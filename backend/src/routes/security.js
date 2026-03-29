// src/routes/security.js
const crypto = require('crypto');
const { query, withTransaction } = require('../config/db');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { logSecurityEvent } = require('../utils/securityLogger');
const redis = require('../config/redis');
const { s3Client, GetObjectCommand } = require('../utils/s3Service');
const { RekognitionClient, CompareFacesCommand } = require('@aws-sdk/client-rekognition');

// Initialize Rekognition
let rekognition = null;
if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_REGION) {
  rekognition = new RekognitionClient({ region: process.env.AWS_REGION });
}

module.exports = async function (fastify, opts) {

  // ── GET /api/security/status ──────────────────────────────────
  fastify.get('/status', { preHandler: [authenticate, requireAdmin] }, async () => ({
    awsRekognition: { enabled: !!rekognition, confidenceThreshold: 80 },
    smtp: { enabled: !!process.env.SMTP_HOST, host: process.env.SMTP_HOST || 'None' },
    system: { version: 'ZT-FASTIFY-2.1', uptime: process.uptime() }
  }));

  // ── GET /api/security/session-policy ────────────────────────
  fastify.get('/session-policy', { preHandler: [authenticate, requireAdmin] }, async () => {
    const policy = await redis.get('config:session_policy') || 'block_new';
    return { policy };
  });

  // ── PUT /api/security/session-policy ────────────────────────
  fastify.put('/session-policy', { preHandler: [authenticate, requireAdmin] }, async (request, reply) => {
    const { policy } = request.body;
    if (policy !== 'block_new' && policy !== 'terminate_old') return reply.status(400).send({ error: 'Invalid policy' });
    await redis.set('config:session_policy', policy);
    return { message: 'Policy updated', policy };
  });

  // ── DELETE /api/security/users/:id/device ───────────────────
  fastify.delete('/users/:id/device', { preHandler: [authenticate, requireAdmin] }, async (request, reply) => {
    try {
      await query('UPDATE users SET device_fingerprint = NULL WHERE id = $1', [request.params.id]);
      await redis.del(`session:${request.params.id}`); // Force re-auth
      reply.send({ message: 'Device reset' });
    } catch {
      reply.status(500).send({ error: 'Failed' });
    }
  });

  // ── POST /api/security/register-device ────────────────────────
  fastify.post('/register-device', { preHandler: [authenticate] }, async (request, reply) => {
    const { deviceId, deviceInfo } = request.body;
    const userId = request.user.id;

    try {
      const { rows } = await query('SELECT device_fingerprint FROM users WHERE id = $1', [userId]);
      if (rows[0].device_fingerprint && rows[0].device_fingerprint !== deviceId) {
        return reply.status(403).send({ error: 'DEVICE_ALREADY_REGISTERED' });
      }

      await query('UPDATE users SET device_fingerprint = $1, device_registered_at = NOW(), updated_at = NOW() WHERE id = $2', [deviceId, userId]);
      
      // Invalidate Session Cache to reflect new device binding
      await redis.del(`session:${userId}`);

      reply.send({ message: 'Device registered successfully', registered: true });
    } catch (err) {
      reply.status(500).send({ error: 'Registration failed' });
    }
  });

  // ── POST /api/security/checkin-selfie ─────────────────────────
  fastify.post('/checkin-selfie', { preHandler: [authenticate] }, async (request, reply) => {
    if (!rekognition) return reply.send({ passed: true, skipped: true });

    const { selfieBase64 } = request.body;
    try {
      const { rows } = await query('SELECT avatar_url FROM users WHERE id = $1', [request.user.id]);
      const avatarUrl = rows[0]?.avatar_url;
      if (!avatarUrl) return reply.send({ passed: true, skipped: true });

      let refImageBytes;
      if (avatarUrl.startsWith('http')) {
        // Fetch from S3/Internet
        const response = await fetch(avatarUrl);
        const arrayBuffer = await response.arrayBuffer();
        refImageBytes = Buffer.from(arrayBuffer);
      } else {
        // Legacy local file support
        const fs = require('fs');
        const path = require('path');
        const refPhotoPath = path.join(__dirname, '../../', avatarUrl);
        if (fs.existsSync(refPhotoPath)) {
          refImageBytes = fs.readFileSync(refPhotoPath);
        } else {
          return reply.send({ passed: true, skipped: true });
        }
      }

      const base64Data = selfieBase64.replace(/^data:image\/\w+;base64,/, '');
      const selfieBytes = Buffer.from(base64Data, 'base64');

      const command = new CompareFacesCommand({
        SourceImage: { Bytes: selfieBytes },
        TargetImage: { Bytes: refImageBytes },
        SimilarityThreshold: 80,
      });

      const result = await rekognition.send(command);
      const match = result.FaceMatches?.[0];

      if (!match) {
        return reply.status(403).send({ passed: false, error: 'SELFIE_MISMATCH' });
      }

      reply.send({ passed: true, confidence: match.Similarity });
    } catch (err) {
      console.error('Rekognition Error:', err);
      reply.status(500).send({ error: 'Verification failed' });
    }
  });

  // ── GET /api/security/audit-log ───────────────────────────────
  fastify.get('/audit-log', { preHandler: [authenticate, requireAdmin] }, async (request, reply) => {
    const { page = 1, limit = 50 } = request.query;
    const offset = (page - 1) * limit;
    try {
      const { rows } = await query(`
        SELECT sal.*, u.first_name, u.last_name, u.email
        FROM security_audit_log sal
        LEFT JOIN users u ON u.id = sal.user_id
        ORDER BY sal.created_at DESC LIMIT $1 OFFSET $2
      `, [limit, offset]);
      reply.send({ events: rows });
    } catch (err) {
      reply.status(500).send({ error: 'Audit log unavailable' });
    }
  });

  // ── POST /api/security/generate-qr ────────────────────────────
  fastify.post('/generate-qr', { preHandler: [authenticate, requireAdmin] }, async (request, reply) => {
    const { siteId } = request.body;
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    try {
      await query('INSERT INTO qr_tokens (token, site_id, expires_at, created_by) VALUES ($1, $2, $3, $4)', [token, siteId, expiresAt, request.user.id]);
      reply.send({ token, qrPayload: JSON.stringify({ type: 'ATTENDANCE_QR', token, siteId }) });
    } catch (err) {
      reply.status(500).send({ error: 'QR Generation failed' });
    }
  });
};

// src/routes/auth.js
const bcrypt = require('bcrypt');
const { query } = require('../config/db');
const redis = require('../config/redis');
const { logSecurityEvent } = require('../utils/securityLogger');

module.exports = async function (fastify, opts) {

  // ── GET /api/nonce ──────────────────────────────────────────
  // Nonce generation for replay protection.
  // This endpoint is rate-limited but open to authenticated and unauthenticated users 
  // to support login and check-in flows.
  fastify.get('/nonce', async (request, reply) => {
    const { generateNonce } = require('../utils/security');
    const userId = request.headers['x-user-id'] || 'anonymous'; // Fallback for login
    const nonce = await generateNonce(userId);
    reply.send({ nonce });
  });

  // ── POST /api/login ──────────────────────────────────────────
  fastify.post('/login', async (request, reply) => {
    const { email, password, deviceId } = request.body;

    try {
      // 1. Fetch user from DB (Primary check)
      const { rows } = await query(
        'SELECT id, password_hash, role, status, device_fingerprint, first_name, last_name, avatar_url FROM users WHERE email = $1',
        [email]
      );
      if (!rows.length) return reply.status(401).send({ error: 'Invalid credentials' });
      
      const user = rows[0];
      if (user.status === 'frozen') return reply.status(403).send({ error: 'Account is frozen' });

      // 2. Validate Password
      const match = await bcrypt.compare(password, user.password_hash);
      if (!match) return reply.status(401).send({ error: 'Invalid credentials' });

      // 3. ZERO-TRUST: Strict Device Binding Enforcement
      // If the account is already bound to a hardware ID, reject any other device.
      if (process.env.ENFORCE_DEVICE_BINDING === 'true' && user.device_fingerprint) {
         if (!deviceId || user.device_fingerprint !== deviceId) {
            await logSecurityEvent({
              userId: user.id,
              eventType: 'device_mismatch',
              severity: 'critical',
              detail: { provided: deviceId, expected: user.device_fingerprint, platform: 'web/mobile' },
              ipAddress: request.ip
            });
            return reply.status(403).send({ 
              error: 'DEVICE_MISMATCH', 
              message: 'Your account is bound to another physical device. Please contact administration to reset your binding.' 
            });
         }
      }

      // 3.5. Multi-Device Policy Check
      const sessionPolicy = await redis.get('config:session_policy') || 'block_new';
      const existingSession = await redis.get(`session:${user.id}`);
      
      if (existingSession && sessionPolicy === 'block_new') {
        const parsed = JSON.parse(existingSession);
        if (parsed.device_fingerprint && parsed.device_fingerprint !== deviceId) {
           return reply.status(403).send({ error: 'SESSION_ACTIVE', message: 'You are already logged in on another device. Please logout there first or contact admin to reset your device.' });
        }
      }

      // 4. Generate JWT with pinned session_id for Terminate Old Session feature
      const crypto = require('crypto');
      const sessionId = crypto.randomUUID();
      const token = fastify.jwt.sign({ sub: user.id, role: user.role, session_id: sessionId });

      // 5. CACHE SESSION: Sub-millisecond hydration in Redis 7
      user.session_id = sessionId;
      await redis.set(`session:${user.id}`, JSON.stringify(user), 'EX', 3600);

      reply.send({
        token,
        user: {
          id: user.id,
          email,
          role: user.role,
          first_name: user.first_name,
          last_name: user.last_name,
          avatar_url: user.avatar_url,
          is_bound: !!user.device_fingerprint
        }
      });
    } catch (err) {
      console.error('Login error:', err);
      reply.status(500).send({ error: 'Authentication service unavailable' });
    }
  });

  // ── GET /api/me ─────────────────────────────────────────────
  // Uses authenticate middleware
  fastify.get('/me', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    reply.send(request.user);
  });

  // ── POST /api/logout ─────────────────────────────────────────
  fastify.post('/logout', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    // Invalidate Redis Cache
    await redis.del(`session:${request.user.id}`);
    reply.send({ message: 'Logged out successfully' });
  });

  // ── POST /api/change-password ─────────────────────────────────
  fastify.post('/change-password', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { oldPassword, newPassword } = request.body;
    try {
       const { rows } = await query('SELECT password_hash FROM users WHERE id = $1', [request.user.id]);
       const match = await bcrypt.compare(oldPassword, rows[0].password_hash);
       if (!match) return reply.status(400).send({ error: 'Current password incorrect' });

       const hash = await bcrypt.hash(newPassword, 12);
       await query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [hash, request.user.id]);
       
       // Force Cache Invalidation so next request re-hydrates with new state if needed
       await redis.del(`session:${request.user.id}`);
       
       reply.send({ message: 'Password changed successfully' });
    } catch (err) {
       reply.status(500).send({ error: 'Update failed' });
    }
  });
};

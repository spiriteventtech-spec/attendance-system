// src/routes/users.js
const bcrypt = require('bcrypt');
const { query } = require('../config/db');
const { authenticate, requireAdmin } = require('../middleware/auth');
const s3 = require('../utils/s3Service');
const { v4: uuidv4 } = require('uuid');

module.exports = async function (fastify, opts) {

  // ── GET /api/admin/users ─────────────────────────────────────
  fastify.get('/', { preHandler: [authenticate, requireAdmin] }, async (request, reply) => {
    const { status, role, search, page = 1, limit = 50 } = request.query;
    const conditions = [];
    const params = [];
    let p = 1;

    if (status) { conditions.push(`status = $${p++}`); params.push(status); }
    if (role)   { conditions.push(`role = $${p++}`);   params.push(role); }
    if (search) {
      conditions.push(`(first_name ILIKE $${p} OR last_name ILIKE $${p} OR email ILIKE $${p})`);
      params.push(`%${search}%`);
      p++;
    }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const offset = (page - 1) * limit;

    try {
      const [data, count] = await Promise.all([
        query(`SELECT id, email, role, status, first_name, last_name, phone, avatar_url, created_at FROM users ${where} ORDER BY created_at DESC LIMIT $${p} OFFSET $${p+1}`, [...params, limit, offset]),
        query(`SELECT COUNT(*) FROM users ${where}`, params),
      ]);
      reply.send({ users: data.rows, total: parseInt(count.rows[0].count), page: parseInt(page), limit: parseInt(limit) });
    } catch (err) {
      reply.status(500).send({ error: 'Server error' });
    }
  });

  // ── POST /api/admin/users/upload-avatar (Admin/Staff) ──────────
  fastify.post('/upload-avatar', { preHandler: [authenticate] }, async (request, reply) => {
    const data = await request.file();
    if (!data) return reply.status(400).send({ error: 'No image uploaded' });

    const isAdmin = request.user.role === 'admin';
    const targetUserId = (isAdmin && (request.body?.targetUserId)) 
                      ? request.body.targetUserId 
                      : request.user.id;

    const fileBuffer = await data.toBuffer();
    const extension = data.mimetype.split('/')[1] || 'jpg';
    const key = `profiles/${targetUserId}-${uuidv4()}.${extension}`;

    try {
      // 1. PERFORMANCE: Direct Stream to S3 (No local disk block)
      await s3.uploadToS3(fileBuffer, key, data.mimetype);

      // 2. Generate Presigned URL (CF Edge accelerated if configured)
      const avatarUrl = await s3.getPresignedUrl(key);

      // 3. Update PostgreSQL profile
      await query('UPDATE users SET avatar_url = $1, updated_at = NOW() WHERE id = $2', [avatarUrl, targetUserId]);

      reply.send({ message: 'Avatar uploaded to S3 successfully', avatarUrl, targetUserId });
    } catch (err) {
      console.error('S3 Avatar Upload Error:', err);
      reply.status(500).send({ error: 'Failed to upload photo to S3' });
    }
  });

  // ── POST /api/admin/users/reset-password ──────────────────────
  fastify.post('/reset-password', { preHandler: [authenticate, requireAdmin] }, async (request, reply) => {
    const { userId, newPassword } = request.body;
    try {
      const hash = await bcrypt.hash(newPassword, 12);
      await query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [hash, userId]);
      reply.send({ message: 'Password reset successful' });
    } catch (err) {
      reply.status(500).send({ error: 'Reset failed' });
    }
  });

  // ── GET /api/admin/users/me/stats ────────────────────────────
  fastify.get('/me/stats', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { rows } = await query(`
        SELECT COUNT(*) as total_sessions, COALESCE(SUM(total_hours_worked), 0) as total_hours, COALESCE(SUM(total_away_minutes), 0) as total_away_minutes
        FROM attendance_logs WHERE user_id = $1
      `, [request.user.id]);
      reply.send(rows[0]);
    } catch (err) {
      reply.status(500).send({ error: 'Stats unavailable' });
    }
  });

  // ── GET /api/admin/users/sites/all (Admin) ───────────────
  fastify.get('/sites/all', { preHandler: [authenticate, requireAdmin] }, async (request, reply) => {
    try {
      const { rows } = await query('SELECT id, name, description, latitude, longitude, radius_meters, is_active FROM projects_sites ORDER BY name');
      reply.send(rows);
    } catch (err) {
      reply.status(500).send({ error: 'Sites unavailable' });
    }
  });

};

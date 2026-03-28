// src/routes/auth.js
const bcrypt = require('bcrypt');
const { query } = require('../config/db');
const redis = require('../config/redis');
const { logSecurityEvent } = require('../utils/securityLogger');

module.exports = async function (fastify, opts) {

  // ── POST /api/login ──────────────────────────────────────────
  fastify.post('/login', async (request, reply) => {
    const { email, password, deviceId, biometricKey } = request.body;

    try {
      // 1. Fetch user from DB (Primary check)
      const { rows } = await query(
        'SELECT id, password_hash, role, status, device_fingerprint, first_name, last_name FROM users WHERE email = $1',
        [email]
      );
      if (!rows.length) return reply.status(401).send({ error: 'Invalid credentials' });
      
      const user = rows[0];
      if (user.status === 'frozen') return reply.status(403).send({ error: 'Account is frozen' });

      // 2. Validate Password
      const match = await bcrypt.compare(password, user.password_hash);
      if (!match) return reply.status(401).send({ error: 'Invalid credentials' });

      // 3. Device Binding Enforcement (Performance optimization: checked globally via redis later)
      if (user.device_fingerprint && deviceId && user.device_fingerprint !== deviceId) {
         return reply.status(403).send({ error: 'DEVICE_MISMATCH', message: 'Unauthorized device.' });
      }

      // 4. Generate JWT
      const token = fastify.jwt.sign({ sub: user.id, role: user.role });

      // 5. CACHE SESSION: Sub-millisecond hydration in Redis 7
      // We store the full user object to avoid subsequent DB lookups in auth middleware
      await redis.set(`session:${user.id}`, JSON.stringify(user), 'EX', 3600);

      reply.send({
        token,
        user: {
          id: user.id,
          email,
          role: user.role,
          firstName: user.first_name,
          lastName: user.last_name
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

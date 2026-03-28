// src/middleware/auth.js
const redis = require('../config/redis');
const { query } = require('../config/db');
const { logSecurityEvent } = require('../utils/securityLogger');

/**
 * Fastify Pre-Handler to authenticate users via JWT + Redis Cache
 */
const authenticate = async (request, reply) => {
  try {
    // 1. Verify JWT (Fastify-JWT adds user to request.user by default, but we'll manually handle sub)
    const decoded = await request.jwtVerify();
    const userId = decoded.sub;

    // 2. Performance: Try Redis Cache first (sub-millisecond)
    let userStr = await redis.get(`session:${userId}`);
    let user;

    if (userStr) {
      user = JSON.parse(userStr);
    } else {
      // 3. Cache Miss: PostgreSQL query
      const { rows } = await query(
        'SELECT id, email, role, status, device_fingerprint FROM users WHERE id = $1',
        [userId]
      );
      if (!rows.length) {
        return reply.status(401).send({ error: 'User mapping lost. Please login again.' });
      }
      user = rows[0];

      // 4. Hydrate Redis (1-hour cache TTL)
      await redis.set(`session:${userId}`, JSON.stringify(user), 'EX', 3600);
    }

    // 5. Hard Block Checks
    if (user.status === 'frozen') {
      return reply.status(403).send({ error: 'Account is frozen. Contact your administrator.' });
    }
    if (user.status === 'archived') {
      return reply.status(403).send({ error: 'Account has been deactivated.' });
    }

    // ── Zero-Trust Device Binding Check ──────────────────────────────
    const deviceId = request.headers['x-device-id'];
    if (user.device_fingerprint) {
      if (!deviceId) {
        await logSecurityEvent({
          userId: user.id,
          eventType: 'missing_device_id',
          severity: 'high',
          detail: { path: request.url, method: request.method, reason: 'bound_account_missing_header' },
          ipAddress: request.ip,
        });
        return reply.status(403).send({
          error: 'DEVICE_ID_REQUIRED',
          code: 'MISSING_DEVICE_HEADER',
          message: 'Your account is bound to a device. Access is not permitted without a recognized device footprint.',
        });
      }
      if (user.device_fingerprint !== deviceId) {
        await logSecurityEvent({
          userId: user.id,
          eventType: 'device_mismatch',
          severity: 'critical',
          detail: { path: request.url, method: request.method },
          ipAddress: request.ip,
        });
        return reply.status(403).send({
          error: 'DEVICE_MISMATCH',
          code: 'UNAUTHORIZED_DEVICE',
          message: 'Access denied. This device is not registered to your account.',
        });
      }
    }

    // Set user on request context
    request.user = user;
    request.deviceId = deviceId;

  } catch (err) {
    if (err.name === 'TokenExpiredError' || err.statusCode === 401) {
      return reply.status(401).send({ error: 'Session expired or invalid token' });
    }
    console.error('[Auth Middleware Error]', err);
    return reply.status(500).send({ error: 'Security layer failure' });
  }
};

const requireAdmin = async (request, reply) => {
  if (request.user?.role !== 'admin') {
    return reply.status(403).send({ error: 'Admin access required' });
  }
};

module.exports = { authenticate, requireAdmin };

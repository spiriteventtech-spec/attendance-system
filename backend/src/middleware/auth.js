// src/middleware/auth.js
const jwt = require('jsonwebtoken');
const { query } = require('../config/db');
const { logSecurityEvent } = require('../utils/securityLogger');

const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // Verify user still exists & is active
    const { rows } = await query(
      'SELECT id, email, role, status, device_fingerprint FROM users WHERE id = $1',
      [decoded.sub]
    );
    if (!rows.length) return res.status(401).json({ error: 'User not found' });
    if (rows[0].status === 'frozen')
      return res.status(403).json({ error: 'Account is frozen. Contact your administrator.' });
    if (rows[0].status === 'archived')
      return res.status(403).json({ error: 'Account has been deactivated.' });

    req.user = rows[0];

    // ── Device Binding Check (staff only) ──────────────────────────────────
    if (rows[0].role === 'staff') {
      const deviceId = req.headers['x-device-id'];
      // Only enforce if device has been registered (skip on fresh registration)
      if (rows[0].device_fingerprint && deviceId && rows[0].device_fingerprint !== deviceId) {
        await logSecurityEvent({
          userId: rows[0].id,
          eventType: 'device_mismatch',
          severity: 'critical',
          detail: { path: req.path, method: req.method },
          ipAddress: req.ip,
        });
        return res.status(403).json({
          error: 'DEVICE_MISMATCH',
          code: 'UNAUTHORIZED_DEVICE',
          message: 'Access denied. This device is not registered to your account.',
        });
      }
      req.deviceId = deviceId;
    }

    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError')
      return res.status(401).json({ error: 'Token expired' });
    return res.status(401).json({ error: 'Invalid token' });
  }
};

const requireAdmin = (req, res, next) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

module.exports = { authenticate, requireAdmin };

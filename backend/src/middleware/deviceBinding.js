// src/middleware/deviceBinding.js
// ─────────────────────────────────────────────────────────────────────────────
// Zero-Trust Device Binding Middleware
// Every authenticated staff request must carry X-Device-ID matching the
// fingerprint registered on first login. Admins are exempt (web panel).
// ─────────────────────────────────────────────────────────────────────────────
const { query } = require('../config/db');
const { logSecurityEvent } = require('../utils/securityLogger');
const { sendDeviceMismatchAlert } = require('../utils/emailAlert');

/**
 * checkDeviceBinding — call AFTER jwt authenticate().
 * Skips validation for admin role (they use the web panel, not mobile).
 */
const checkDeviceBinding = async (req, res, next) => {
  // Admins are exempt from device binding
  if (req.user?.role === 'admin') return next();

  const deviceId = req.headers['x-device-id'];

  // Strict: every staff request MUST carry this header
  if (!deviceId) {
    await logSecurityEvent({
      userId: req.user?.id,
      eventType: 'missing_device_id',
      severity: 'high',
      detail: { path: req.path, method: req.method },
      ipAddress: req.ip,
    });
    return res.status(403).json({ error: 'DEVICE_ID_REQUIRED', code: 'MISSING_DEVICE_HEADER' });
  }

  try {
    const { rows } = await query(
      'SELECT device_fingerprint, email, first_name, last_name FROM users WHERE id = $1',
      [req.user.id]
    );

    if (!rows.length) return res.status(401).json({ error: 'User not found' });

    const user = rows[0];

    // ── Case 1: No fingerprint stored yet (first login) ───────────────────
    // The /api/security/register-device endpoint handles initial registration,
    // but we also allow the first request to pass through so that endpoint
    // can be called. Device registration is idempotent.
    if (!user.device_fingerprint) {
      req.deviceId = deviceId;
      req.deviceIsNew = true;
      return next();
    }

    // ── Case 2: Fingerprint mismatch — BUDDY PUNCHING DETECTED ───────────
    if (user.device_fingerprint !== deviceId) {
      // Log the security event
      await logSecurityEvent({
        userId: req.user.id,
        eventType: 'device_mismatch',
        severity: 'critical',
        detail: {
          storedFingerprint: user.device_fingerprint.substring(0, 16) + '...',
          attemptedFingerprint: deviceId.substring(0, 16) + '...',
          path: req.path,
        },
        ipAddress: req.ip,
      });

      // Send email alert to the real owner (non-blocking)
      sendDeviceMismatchAlert(user.email, `${user.first_name} ${user.last_name}`, req.ip)
        .catch(err => console.error('Email alert failed:', err));

      return res.status(403).json({
        error: 'DEVICE_MISMATCH',
        code: 'UNAUTHORIZED_DEVICE',
        message: 'Access denied. This device is not registered to your account. The account owner has been alerted.',
      });
    }

    // ── Case 3: Match — proceed ────────────────────────────────────────────
    req.deviceId = deviceId;
    next();
  } catch (err) {
    console.error('Device binding check error:', err);
    next(); // Fail-open to not block legitimate users on DB errors
  }
};

module.exports = { checkDeviceBinding };

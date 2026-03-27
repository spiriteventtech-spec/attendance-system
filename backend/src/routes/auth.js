// src/routes/auth.js
const express = require('express');
const bcrypt  = require('bcrypt');
const jwt     = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { query } = require('../config/db');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { logSecurityEvent } = require('../utils/securityLogger');

const router = express.Router();

/**
 * ── POST /api/login ──────────────────────────────────────────
 * Standard auth logic + Zero-Trust session conflict policy.
 * Staff members are bound to a single device (X-Device-ID).
 * Policy can be 'block_new' or 'terminate_old'.
 */
router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg || 'Validation failed' });

  const { email, password } = req.body;
  const deviceId = req.headers['x-device-id'];

  try {
    const { rows } = await query(
      'SELECT id, email, password_hash, role, status, first_name, last_name, device_fingerprint FROM users WHERE email = $1',
      [email]
    );
    if (!rows.length) return res.status(401).json({ error: 'Invalid credentials' });

    const user = rows[0];

    // ── Zero-Trust Session Conflict Policy ───────────────────────────
    if (user.role === 'staff' && user.device_fingerprint && deviceId && user.device_fingerprint !== deviceId) {
      // Fetch policy from settings
      const { rows: policyRows } = await query(
        "SELECT value FROM system_settings WHERE key = 'session_conflict_policy'"
      );
      const policy = policyRows[0]?.value || 'block_new';

      if (policy === 'block_new') {
        await logSecurityEvent({
          userId: user.id,
          eventType: 'session_conflict',
          severity: 'high',
          detail: { attemptedDeviceId: deviceId.substring(0, 16) + '...', policy: 'block_new' },
          ipAddress: req.ip,
        });
        return res.status(403).json({
          error: 'SESSION_CONFLICT',
          code: 'DEVICE_ALREADY_BOUND',
          message: 'Account bound to another device. Security policy blocks concurrent access.',
        });
      } else if (policy === 'terminate_old') {
        // Invalidate old session by updating fingerprint to new one immediately
        await query('UPDATE users SET device_fingerprint = $1, updated_at = NOW() WHERE id = $2', [deviceId, user.id]);
        await logSecurityEvent({
          userId: user.id,
          eventType: 'session_terminated',
          severity: 'medium',
          detail: { newDeviceId: deviceId.substring(0, 16) + '...', oldDeviceId: user.device_fingerprint.substring(0, 16) + '...' },
          ipAddress: req.ip,
        });
        // Update local object so login proceeds with new context
        user.device_fingerprint = deviceId;
      }
    }

    if (user.status === 'frozen')
      return res.status(403).json({ error: 'Account is frozen. Contact administrator.' });
    if (user.status === 'archived')
      return res.status(403).json({ error: 'Account deactivated.' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign(
      { sub: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        firstName: user.first_name,
        lastName: user.last_name,
      }
    });

    // Log successful login (audit trail)
    logSecurityEvent({
      userId: user.id,
      eventType: 'login_success',
      severity: 'info',
      detail: { method: deviceId ? 'mobile' : 'web' },
      ipAddress: req.ip
    });

  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * ── GET /api/me ──────────────────────────────────────────────
 * Unified profile fetch (Admin & Staff)
 */
router.get('/me', authenticate, async (req, res) => {
  try {
    const { rows } = await query(
      'SELECT id, email, role, first_name, last_name, status, device_fingerprint FROM users WHERE id = $1',
      [req.user.sub]
    );
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    
    const user = rows[0];
    res.json({
      id: user.id,
      email: user.email,
      role: user.role,
      firstName: user.first_name,
      lastName: user.last_name,
      status: user.status,
      deviceFingerprint: user.device_fingerprint
    });
  } catch (err) {
    console.error('Profile fetch error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * ── POST /api/register ──────────────────────────────────────
 * Internal user creation (usually Admin only in prod)
 */
router.post('/register', [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 }),
  body('firstName').notEmpty(),
  body('lastName').notEmpty(),
  body('role').isIn(['staff', 'admin']),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { email, password, firstName, lastName, role } = req.body;

  try {
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await query(
      `INSERT INTO users (email, password_hash, first_name, last_name, role)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, email, role`,
      [email, hash, firstName, lastName, role || 'staff']
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') {
       return res.status(400).json({ error: 'EMAIL_ALREADY_EXISTS' });
    }
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;

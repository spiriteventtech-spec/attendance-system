// src/routes/auth.js
const express = require('express');
const bcrypt  = require('bcrypt');
const jwt     = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { query } = require('../config/db');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { logSecurityEvent } = require('../utils/securityLogger');

const router = express.Router();

// ── POST /api/login ─────────────────────────────────────────
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
          message: 'This account is already bound to another device. Access from this device is blocked by security policy.',
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
      return res.status(403).json({ error: 'Account is frozen. Contact your administrator.' });
    if (user.status === 'archived')
      return res.status(403).json({ error: 'Account has been deactivated.' });

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
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/me ──────────────────────────────────────────────
router.get('/me', authenticate, async (req, res) => {
  const { rows } = await query(
    'SELECT id, email, role, status, first_name, last_name, phone, avatar_url FROM users WHERE id = $1',
    [req.user.id]
  );
  res.json(rows[0]);
});

// ── GET /api/me/stats ────────────────────────────────────────
router.get('/me/stats', authenticate, async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT
        COUNT(*) as total_sessions,
        COALESCE(SUM(total_hours_worked), 0) as total_hours,
        COALESCE(SUM(total_away_minutes), 0) as total_away_minutes,
        COUNT(CASE WHEN status = 'overridden' THEN 1 END) as overridden_count
      FROM attendance_logs
      WHERE user_id = $1
    `, [req.user.id]);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/admin/users/freeze ─────────────────────────────
router.post('/admin/users/freeze', authenticate, requireAdmin, [
  body('userId').isUUID(),
  body('freeze').isBoolean(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg || 'Validation failed' });

  const { userId, freeze } = req.body;
  try {
    // Prevent admin from freezing themselves
    if (userId === req.user.id)
      return res.status(400).json({ error: 'Cannot change your own account status' });

    const newStatus = freeze ? 'frozen' : 'active';
    const { rows } = await query(
      `UPDATE users SET status = $1, updated_at = NOW()
       WHERE id = $2 AND role != 'admin'
       RETURNING id, email, status, first_name, last_name`,
      [newStatus, userId]
    );
    if (!rows.length) return res.status(404).json({ error: 'User not found or is an admin' });
    res.json({ message: `User ${freeze ? 'frozen' : 'unfrozen'} successfully`, user: rows[0] });
  } catch (err) {
    console.error('Freeze error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/admin/users/archive ────────────────────────────
router.post('/admin/users/archive', authenticate, requireAdmin, [
  body('userId').isUUID(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg || 'Validation failed' });

  const { userId } = req.body;
  try {
    if (userId === req.user.id)
      return res.status(400).json({ error: 'Cannot archive your own account' });

    const { rows } = await query(
      `UPDATE users SET status = 'archived', updated_at = NOW()
       WHERE id = $1 AND role != 'admin'
       RETURNING id, email, status`,
      [userId]
    );
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    res.json({ message: 'User archived', user: rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/admin/users/reset-password ─────────────────────
router.post('/admin/users/reset-password', authenticate, requireAdmin, [
  body('userId').isUUID(),
  body('newPassword').isLength({ min: 8 }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg || 'Validation failed' });

  const { userId, newPassword } = req.body;
  try {
    const hash = await bcrypt.hash(newPassword, 12);
    const { rows } = await query(
      `UPDATE users SET password_hash = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id, email, first_name, last_name`,
      [hash, userId]
    );
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    res.json({ message: 'Password reset successfully', user: rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/change-password (self) ─────────────────────────
router.post('/change-password', authenticate, [
  body('currentPassword').notEmpty(),
  body('newPassword').isLength({ min: 8 }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg || 'Validation failed' });

  const { currentPassword, newPassword } = req.body;
  try {
    const { rows } = await query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    const valid = await bcrypt.compare(currentPassword, rows[0].password_hash);
    if (!valid) return res.status(400).json({ error: 'Current password is incorrect' });

    const hash = await bcrypt.hash(newPassword, 12);
    await query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [hash, req.user.id]);
    res.json({ message: 'Password updated successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;

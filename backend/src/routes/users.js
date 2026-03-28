// src/routes/users.js
const express = require('express');
const bcrypt  = require('bcrypt');
const { body, validationResult } = require('express-validator');
const { query } = require('../config/db');
const { authenticate, requireAdmin } = require('../middleware/auth');
const multer = require('multer');
const path   = require('path');
const fs     = require('fs');

// Configure multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../../uploads/profiles');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    // We use a random UUID-like string to avoid collisions and keep path neutral
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `avatar-${uniqueSuffix}${ext}`);
  }
});
const upload = multer({ 
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // Increased to 5MB for better quality photos
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only images are allowed'));
  }
});

const router = express.Router();

// ── GET /api/admin/users ─────────────────────────────────────
router.get('/', authenticate, requireAdmin, async (req, res) => {
  const { status, role, search, page = 1, limit = 50 } = req.query;
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
      query(`
        SELECT id, email, role, status, first_name, last_name, phone, avatar_url, created_at
        FROM users ${where}
        ORDER BY created_at DESC
        LIMIT $${p} OFFSET $${p+1}
      `, [...params, limit, offset]),
      query(`SELECT COUNT(*) FROM users ${where}`, params),
    ]);

    res.json({
      users: data.rows,
      total: parseInt(count.rows[0].count),
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/admin/users ─────────────────────────────────────
router.post('/', authenticate, requireAdmin, [
  body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('firstName').trim().notEmpty().withMessage('First name is required'),
  body('lastName').trim().notEmpty().withMessage('Last name is required'),
  body('role').isIn(['admin', 'staff']).withMessage('Invalid role'),
  body('phone').optional().trim(),
], async (req, res) => {
  console.log('--- FRONTEND PAYLOAD ---', req.body);
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    console.log('--- VALIDATION ERROR ---', errors.array()[0].msg);
    return res.status(400).json({ error: errors.array()[0].msg });
  }

  const { email, password, firstName, lastName, role, phone } = req.body;
  try {
    const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length) return res.status(400).json({ error: 'Email already in use' });

    const hash = await bcrypt.hash(password, 12);
    const { rows } = await query(`
      INSERT INTO users (email, password_hash, role, first_name, last_name, phone)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, email, role, status, first_name, last_name, phone, created_at
    `, [email, hash, role, firstName, lastName, phone || null]);

    res.status(201).json({ message: 'User created', user: rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── PUT /api/admin/users/:id ──────────────────────────────────
router.put('/:id', authenticate, requireAdmin, [
  body('firstName').optional().trim().notEmpty().withMessage('First name cannot be empty'),
  body('lastName').optional().trim().notEmpty().withMessage('Last name cannot be empty'),
  body('phone').optional().trim(),
  body('email').optional().isEmail().withMessage('Valid email is required').normalizeEmail(),
  body('role').optional().isIn(['admin', 'staff']).withMessage('Invalid role'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: errors.array()[0].msg });
  }

  const { firstName, lastName, phone, email, role } = req.body;
  const updates = [];
  const params = [];
  let p = 1;

  if (firstName !== undefined) { updates.push(`first_name = $${p++}`); params.push(firstName); }
  if (lastName  !== undefined) { updates.push(`last_name = $${p++}`);  params.push(lastName); }
  if (phone     !== undefined) { updates.push(`phone = $${p++}`);      params.push(phone); }
  if (email     !== undefined) { updates.push(`email = $${p++}`);      params.push(email); }
  if (role      !== undefined) { updates.push(`role = $${p++}`);       params.push(role); }
  if (req.body.avatarUrl !== undefined) { updates.push(`avatar_url = $${p++}`); params.push(req.body.avatarUrl); }

  if (!updates.length) return res.status(400).json({ error: 'No fields to update' });
  updates.push('updated_at = NOW()');

  try {
    params.push(req.params.id);
    const { rows } = await query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${p} RETURNING id, email, role, status, first_name, last_name, phone`,
      params
    );
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    res.json({ message: 'User updated', user: rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/admin/users/me (Current User) ───────────────────
router.get('/me', authenticate, async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT id, email, role, status, first_name, last_name, phone, avatar_url, created_at
      FROM users WHERE id = $1
    `, [req.user.id]);
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── PUT /api/admin/users/me/push-token ───────────────────────
router.put('/me/push-token', authenticate, [
  body('pushToken').trim().notEmpty().withMessage('Push token is required'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

  const { pushToken } = req.body;
  try {
    await query('UPDATE users SET expo_push_token = $1, updated_at = NOW() WHERE id = $2', [pushToken, req.user.id]);
    res.json({ message: 'Push token registered' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── PUT /api/admin/users/me/profile ──────────────────────────
router.put('/me/profile', authenticate, [
  body('firstName').optional().trim().notEmpty(),
  body('lastName').optional().trim().notEmpty(),
  body('phone').optional().trim(),
  body('avatarUrl').optional().trim(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

  const { firstName, lastName, phone, avatarUrl } = req.body;
  const updates = [];
  const params = [];
  let p = 1;

  if (firstName !== undefined) { updates.push(`first_name = $${p++}`); params.push(firstName); }
  if (lastName !== undefined)  { updates.push(`last_name = $${p++}`);  params.push(lastName); }
  if (phone !== undefined)     { updates.push(`phone = $${p++}`);      params.push(phone); }
  if (avatarUrl !== undefined) { updates.push(`avatar_url = $${p++}`); params.push(avatarUrl); }

  if (!updates.length) return res.status(400).json({ error: 'No fields to update' });
  updates.push('updated_at = NOW()');
  params.push(req.user.id);

  try {
    const { rows } = await query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${p} RETURNING id, avatar_url, first_name, last_name`,
      params
    );
    res.json({ message: 'Profile updated', user: rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/admin/users/upload-avatar ─────────────────────
// Admin can upload for any user by providing targetUserId
// Users can only upload for themselves
router.post('/upload-avatar', authenticate, upload.single('avatar'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const isAdmin = req.user.role === 'admin';
  const targetUserId = (isAdmin && (req.body.targetUserId || req.query.targetUserId)) 
                    ? (req.body.targetUserId || req.query.targetUserId) 
                    : req.user.id;

  const avatarUrl = `/uploads/profiles/${req.file.filename}`;

  try {
    const { rowCount } = await query(
      'UPDATE users SET avatar_url = $1, updated_at = NOW() WHERE id = $2', 
      [avatarUrl, targetUserId]
    );

    if (!rowCount) return res.status(404).json({ error: 'User not found' });

    console.log(`[Avatar] Uploaded for user ${targetUserId} by ${req.user.id}`);
    res.json({ 
      message: targetUserId === req.user.id ? 'Your avatar uploaded' : 'Staff reference photo enrolled', 
      avatarUrl,
      userId: targetUserId
    });
  } catch (err) {
    console.error('Avatar upload DB error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/admin/users/me/stats ────────────────────────────
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

// ── GET /api/admin/users/:id/stats ───────────────────────────
router.get('/:id/stats', authenticate, requireAdmin, async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT
        COUNT(*) as total_sessions,
        COALESCE(SUM(total_hours_worked), 0) as total_hours,
        COALESCE(SUM(total_away_minutes), 0) as total_away_minutes,
        COUNT(CASE WHEN status = 'overridden' THEN 1 END) as overridden_count
      FROM attendance_logs
      WHERE user_id = $1
    `, [req.params.id]);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/admin/sites ──────────────────────────────────────
router.get('/sites/all', authenticate, requireAdmin, async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT id, name, description, latitude, longitude, radius_meters, is_active, created_at
      FROM projects_sites ORDER BY name
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/admin/users/sites (Staff accessible) ────────────
router.get('/sites', authenticate, async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT id, name, latitude, longitude, radius_meters 
      FROM projects_sites WHERE is_active = true ORDER BY name
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/admin/sites ─────────────────────────────────────
router.post('/sites', authenticate, requireAdmin, [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('latitude').isFloat({ min: -90, max: 90 }).withMessage('Valid latitude is required'),
  body('longitude').isFloat({ min: -180, max: 180 }).withMessage('Valid longitude is required'),
  body('radiusMeters').isInt({ min: 10, max: 10000 }).withMessage('Radius must be between 10 and 10000 meters'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: errors.array()[0].msg });
  }

  let { name, description, latitude, longitude, radiusMeters } = req.body;
  
  // Ensure we have numbers
  const lat = parseFloat(latitude);
  const lng = parseFloat(longitude);
  const rad = parseInt(radiusMeters);

  if (isNaN(lat) || isNaN(lng)) {
    return res.status(400).json({ error: 'Invalid coordinates provided' });
  }
  try {
    const { rows } = await query(`
      INSERT INTO projects_sites (name, description, latitude, longitude, radius_meters)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, name, latitude, longitude, radius_meters, is_active
    `, [name, description || null, lat, lng, rad]);
    res.status(201).json({ message: 'Site created', site: rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── PUT /api/admin/sites/:id ──────────────────────────────────
router.put('/sites/:id', authenticate, requireAdmin, [
  body('name').optional().trim().notEmpty().withMessage('Name cannot be empty'),
  body('latitude').optional().isFloat({ min: -90, max: 90 }).withMessage('Valid latitude is required'),
  body('longitude').optional().isFloat({ min: -180, max: 180 }).withMessage('Valid longitude is required'),
  body('radiusMeters').optional().isInt({ min: 10, max: 10000 }).withMessage('Radius must be between 10 and 10000 meters'),
  body('is_active').optional().isBoolean(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

  const { name, description, latitude, longitude, radiusMeters, is_active } = req.body;
  const updates = [];
  const params = [];
  let p = 1;

  if (name !== undefined) { updates.push(`name = $${p++}`); params.push(name); }
  if (description !== undefined) { updates.push(`description = $${p++}`); params.push(description); }
  if (latitude !== undefined) { updates.push(`latitude = $${p++}`); params.push(parseFloat(latitude)); }
  if (longitude !== undefined) { updates.push(`longitude = $${p++}`); params.push(parseFloat(longitude)); }
  if (radiusMeters !== undefined) { updates.push(`radius_meters = $${p++}`); params.push(parseInt(radiusMeters)); }
  if (is_active !== undefined) { updates.push(`is_active = $${p++}`); params.push(is_active); }

  if (!updates.length) return res.status(400).json({ error: 'No fields to update' });
  params.push(req.params.id);

  try {
    const { rows } = await query(`
      UPDATE projects_sites SET ${updates.join(', ')} 
      WHERE id = $${p} 
      RETURNING id, name, latitude, longitude, radius_meters, is_active
    `, params);
    if (!rows.length) return res.status(404).json({ error: 'Site not found' });
    res.json({ message: 'Site updated', site: rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── DELETE /api/admin/sites/:id ───────────────────────────────
router.delete('/sites/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const { rows } = await query('DELETE FROM projects_sites WHERE id = $1 RETURNING id', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Site not found' });
    res.json({ message: 'Site deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/admin/users/archive ───────────────────────────
router.post('/archive', authenticate, requireAdmin, async (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: 'User ID is required' });
  if (userId === req.user.id) return res.status(400).json({ error: 'You cannot archive your own account' });

  try {
    const { rowCount } = await query('UPDATE users SET status = \'archived\', updated_at = NOW() WHERE id = $1', [userId]);
    if (!rowCount) return res.status(404).json({ error: 'User not found' });
    res.json({ message: 'User archived successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/admin/users/freeze ────────────────────────────
router.post('/freeze', authenticate, requireAdmin, async (req, res) => {
  const { userId, freeze } = req.body;
  if (!userId) return res.status(400).json({ error: 'User ID is required' });
  if (userId === req.user.id) return res.status(400).json({ error: 'You cannot freeze your own account' });

  try {
    const status = freeze ? 'frozen' : 'active';
    const { rowCount } = await query('UPDATE users SET status = $1, updated_at = NOW() WHERE id = $2', [status, userId]);
    if (!rowCount) return res.status(404).json({ error: 'User not found' });
    res.json({ message: `User status updated to ${status}` });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/admin/users/reset-password ─────────────────────
router.post('/reset-password', authenticate, requireAdmin, [
  body('userId').isUUID().withMessage('Valid User ID is required'),
  body('newPassword').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

  const { userId, newPassword } = req.body;
  try {
    const hash = await bcrypt.hash(newPassword, 12);
    const { rowCount } = await query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [hash, userId]);
    if (!rowCount) return res.status(404).json({ error: 'User not found' });
    res.json({ message: 'Password reset successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/admin/users/recover ───────────────────────────
router.post('/recover', authenticate, requireAdmin, async (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: 'User ID is required' });

  try {
    const { rowCount } = await query('UPDATE users SET status = \'active\', updated_at = NOW() WHERE id = $1', [userId]);
    if (!rowCount) return res.status(404).json({ error: 'User not found' });
    res.json({ message: 'User recovered successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;

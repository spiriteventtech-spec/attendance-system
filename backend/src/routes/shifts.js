// src/routes/shifts.js
const express = require('express');
const { body, query: qv, validationResult } = require('express-validator');
const { query } = require('../config/db');
const { authenticate, requireAdmin } = require('../middleware/auth');
const router = express.Router();

// ── GET /api/shifts/my (Staff) ──────────────────────────────────────────────
// Returns upcoming and recent shifts for the logged-in staff member
router.get('/my', authenticate, async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT s.*, ps.name as site_name, ps.latitude, ps.longitude, ps.radius_meters
      FROM shifts s
      JOIN projects_sites ps ON ps.id = s.site_id
      WHERE s.user_id = $1
      ORDER BY s.start_time DESC
      LIMIT 20
    `, [req.user.id]);
    res.json(rows);
  } catch (err) {
    console.error('Fetch my shifts error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/shifts (Admin) ─────────────────────────────────────────────────
// List all shifts with filters
router.get('/', authenticate, requireAdmin, async (req, res) => {
  const { siteId, userId, start, end } = req.query;
  const conditions = [];
  const params = [];
  let p = 1;

  if (siteId) { conditions.push(`s.site_id = $${p++}`); params.push(siteId); }
  if (userId) { conditions.push(`s.user_id = $${p++}`); params.push(userId); }
  if (start)  { conditions.push(`s.start_time >= $${p++}`); params.push(start); }
  if (end)    { conditions.push(`s.start_time <= $${p++}`); params.push(end); }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

  try {
    const { rows } = await query(`
      SELECT s.*, u.first_name, u.last_name, u.email, ps.name as site_name
      FROM shifts s
      JOIN users u ON u.id = s.user_id
      JOIN projects_sites ps ON ps.id = s.site_id
      ${where}
      ORDER BY s.start_time DESC
    `, params);
    res.json(rows);
  } catch (err) {
    console.error('Fetch shifts error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/shifts (Admin) ────────────────────────────────────────────────
// Create a new shift assignment
router.post('/', authenticate, requireAdmin, [
  body('userId').isUUID(),
  body('siteId').isUUID(),
  body('startTime').isISO8601(),
  body('endTime').isISO8601(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { userId, siteId, startTime, endTime } = req.body;

  if (new Date(startTime) >= new Date(endTime)) {
    return res.status(400).json({ error: 'Start time must be before end time' });
  }

  try {
    const { rows } = await query(`
      INSERT INTO shifts (user_id, site_id, start_time, end_time)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [userId, siteId, startTime, endTime]);
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.message.includes('conflicting key value violates exclusion constraint')) {
      return res.status(409).json({ error: 'User already has an overlapping shift assigned' });
    }
    console.error('Create shift error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── DELETE /api/shifts/:id (Admin) ──────────────────────────────────────────
router.delete('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const { rowCount } = await query('DELETE FROM shifts WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Shift not found' });
    res.json({ message: 'Shift deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;

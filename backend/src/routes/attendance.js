// src/routes/attendance.js
const express = require('express');
const { body, query: qv, validationResult } = require('express-validator');
const { query, withTransaction } = require('../config/db');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// ── POST /api/attendance/checkin ─────────────────────────────
router.post('/checkin', authenticate, [
  body('siteId').isUUID(),
  body('latitude').isFloat({ min: -90, max: 90 }),
  body('longitude').isFloat({ min: -180, max: 180 }),
  body('note').trim().isLength({ min: 3, max: 500 }).withMessage('Check-in note is required (3-500 chars)'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { siteId, latitude, longitude, note } = req.body;

  try {
    // 1. Validate user is inside the geofence using PostGIS ST_DWithin
    const geoCheck = await query(`
      SELECT id, name, radius_meters,
             ST_DWithin(
               location,
               ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography,
               radius_meters
             ) AS inside
      FROM projects_sites
      WHERE id = $3 AND is_active = true
    `, [latitude, longitude, siteId]);

    if (!geoCheck.rows.length)
      return res.status(404).json({ error: 'Site not found or inactive' });

    const site = geoCheck.rows[0];
    if (!site.inside)
      return res.status(400).json({ error: 'You are outside the geofence. Move closer to the site to check in.' });

    // 2. Check no active session exists
    const existing = await query(`
      SELECT id FROM attendance_logs
      WHERE user_id = $1 AND status = 'active'
    `, [req.user.id]);
    if (existing.rows.length)
      return res.status(400).json({ error: 'You already have an active check-in. Please check out first.' });

    // 3. Find applicable shift (optional but recommended)
    // Looking for a shift at this site for this user that starts +/- 2 hours from now
    const shiftCheck = await query(`
      SELECT id FROM shifts
      WHERE user_id = $1 AND site_id = $2 AND status = 'scheduled'
      AND start_time BETWEEN NOW() - INTERVAL '2 hours' AND NOW() + INTERVAL '2 hours'
      LIMIT 1
    `, [req.user.id, siteId]);
    const shiftId = shiftCheck.rows[0]?.id || null;

    // 4. Create attendance log
    const deviceId = req.headers['x-device-id'] || 'unknown';
    const { rows } = await query(`
      INSERT INTO attendance_logs (user_id, site_id, shift_id, check_in_time, check_in_note, status, device_id)
      VALUES ($1, $2, $3, NOW(), $4, 'active', $5)
      RETURNING id, check_in_time, check_in_note, status
    `, [req.user.id, siteId, shiftId, note, deviceId]);

    // Update shift status if linked
    if (shiftId) {
      await query("UPDATE shifts SET status = 'in_progress', updated_at = NOW() WHERE id = $1", [shiftId]);
    }

    res.status(201).json({
      message: 'Checked in successfully',
      log: rows[0],
      site: { id: site.id, name: site.name }
    });
  } catch (err) {
    console.error('Check-in error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/attendance/checkout ────────────────────────────
router.post('/checkout', authenticate, [
  body('latitude').optional({ nullable: true }).isFloat({ min: -90, max: 90 }),
  body('longitude').optional({ nullable: true }).isFloat({ min: -180, max: 180 }),
  body('note').trim().isLength({ min: 3, max: 500 }).withMessage('Check-out note is required (3-500 chars)'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { latitude, longitude, note } = req.body;

  try {
    // 1. Find active session
    const { rows: logRows } = await query(`
      SELECT al.*, ps.radius_meters, ps.location, ps.latitude as site_lat, ps.longitude as site_lng,
             u.device_fingerprint as current_registered_device
      FROM attendance_logs al
      JOIN projects_sites ps ON ps.id = al.site_id
      JOIN users u ON u.id = al.user_id
      WHERE al.user_id = $1 AND al.status = 'active'
    `, [req.user.id]);

    if (!logRows.length)
      return res.status(400).json({ error: 'No active check-in found' });

    const log = logRows[0];
    const currentDeviceId = req.headers['x-device-id'];

    // 1.1 Verify device binding for this specific session
    // This prevents "Login on A -> Checkin -> Login on B -> Checkout"
    if (log.device_id && log.device_id !== 'unknown' && log.device_id !== currentDeviceId) {
      return res.status(403).json({
        error: 'DEVICE_MISMATCH',
        message: 'You must check out from the same device used for check-in.'
      });
    }

    // Use current lat/lng or fallback to site location for breach closing
    const finalLat = latitude !== undefined && latitude !== null ? latitude : log.site_lat;
    const finalLng = longitude !== undefined && longitude !== null ? longitude : log.site_lng;

    // 2. Close any open breach log
    await query(`
      UPDATE breach_logs
      SET return_time = NOW(),
          return_lat = $2,
          return_lng = $3
      WHERE attendance_log_id = $1 AND return_time IS NULL
    `, [log.id, finalLat, finalLng]);

    // 3. Check out — triggers compute_hours_on_checkout
    const { rows } = await query(`
      UPDATE attendance_logs
      SET check_out_time = NOW(), check_out_note = $1
      WHERE id = $2
      RETURNING id, shift_id, check_in_time, check_out_time, total_hours_worked, total_away_minutes, status
    `, [note, log.id]);

    if (!rows.length) {
      throw new Error(`Failed to update attendance_log ID ${log.id}`);
    }

    // 4. Update linked shift if applicable
    if (rows[0].shift_id) {
        await query("UPDATE shifts SET status = 'completed', updated_at = NOW() WHERE id = $1", [rows[0].shift_id]);
    }

    res.json({
      message: 'Checked out successfully',
      log: rows[0]
    });
  } catch (err) {
    console.error('Check-out execution error:', err.message, { userId: req.user.id, logId: log?.id });
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

// ── GET /api/attendance/active ───────────────────────────────
router.get('/active', authenticate, async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT al.id, al.check_in_time, al.check_in_note, al.total_away_minutes,
             ps.id as site_id, ps.name as site_name,
             ps.latitude, ps.longitude, ps.radius_meters
      FROM attendance_logs al
      JOIN projects_sites ps ON ps.id = al.site_id
      WHERE al.user_id = $1 AND al.status = 'active'
    `, [req.user.id]);

    res.json(rows[0] || null);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/attendance/history ──────────────────────────────
router.get('/history', authenticate, async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;

  try {
    const { rows } = await query(`
      SELECT al.*, ps.name as site_name,
             (SELECT COUNT(*) FROM breach_logs bl WHERE bl.attendance_log_id = al.id) as breach_count
      FROM attendance_logs al
      JOIN projects_sites ps ON ps.id = al.site_id
      WHERE al.user_id = $1
      ORDER BY al.check_in_time DESC
      LIMIT $2 OFFSET $3
    `, [req.user.id, limit, offset]);

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/attendance/logs (admin) ─────────────────────────
router.get('/logs', authenticate, requireAdmin, async (req, res) => {
  const {
    siteId, userId, startDate, endDate,
    status, minHours, page = 1, limit = 50
  } = req.query;

  const conditions = [];
  const params = [];
  let p = 1;

  if (siteId)    { conditions.push(`al.site_id = $${p++}`);         params.push(siteId); }
  if (userId)    { conditions.push(`al.user_id = $${p++}`);         params.push(userId); }
  if (status)    { conditions.push(`al.status = $${p++}`);          params.push(status); }
  if (startDate) { conditions.push(`al.check_in_time >= $${p++}`);  params.push(startDate); }
  if (endDate)   { conditions.push(`al.check_in_time < $${p++}::date + 1`);  params.push(endDate); }
  if (minHours)  { conditions.push(`al.total_hours_worked >= $${p++}`); params.push(minHours); }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
  const offset = (page - 1) * limit;

  try {
    const dataQ = query(`
      SELECT al.*,
             u.first_name, u.last_name, u.email,
             ps.name as site_name,
             (SELECT COUNT(*) FROM breach_logs bl WHERE bl.attendance_log_id = al.id) as breach_count,
             (SELECT COALESCE(SUM(bl.duration_away_minutes), 0)
              FROM breach_logs bl WHERE bl.attendance_log_id = al.id) as total_away_calc
      FROM attendance_logs al
      JOIN users u ON u.id = al.user_id
      JOIN projects_sites ps ON ps.id = al.site_id
      ${where}
      ORDER BY al.check_in_time DESC
      LIMIT $${p} OFFSET $${p+1}
    `, [...params, limit, offset]);

    const countQ = query(
      `SELECT COUNT(*) FROM attendance_logs al ${where}`,
      params
    );

    const [data, count] = await Promise.all([dataQ, countQ]);

    res.json({
      logs: data.rows,
      total: parseInt(count.rows[0].count),
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (err) {
    console.error('Logs fetch error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/attendance/override (admin) ────────────────────
router.post('/override', authenticate, requireAdmin, [
  body('logId').isUUID(),
  body('checkInTime').optional().isISO8601(),
  body('checkOutTime').optional().isISO8601(),
  body('adminComment').trim().isLength({ min: 5 }).withMessage('Admin comment is required for overrides'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { logId, checkInTime, checkOutTime, adminComment } = req.body;

  try {
    // 1. Fetch existing log to ensure it exists and get timestamps for recalculation
    const { rows: existingRows } = await query('SELECT check_in_time, check_out_time FROM attendance_logs WHERE id = $1', [logId]);
    if (!existingRows.length) return res.status(404).json({ error: 'Log not found' });
    
    const log = existingRows[0];
    const finalCheckIn = checkInTime || log.check_in_time;
    const finalCheckOut = checkOutTime || log.check_out_time;

    const updates = [];
    const params = [];
    let p = 1;

    if (checkInTime)  { updates.push(`check_in_time = $${p++}`);  params.push(checkInTime); }
    if (checkOutTime) { updates.push(`check_out_time = $${p++}`); params.push(checkOutTime); }

    updates.push(`status = 'overridden'`);
    updates.push(`override_by = $${p++}`);
    updates.push(`override_comment = $${p++}`);
    updates.push(`override_at = NOW()`);
    updates.push(`updated_at = NOW()`);
    params.push(req.user.id, adminComment);

    // Recalculate hours if we have both timestamps (common for overrides)
    if (finalCheckIn && finalCheckOut) {
      const outIdx = p++;
      const inIdx = p++;
      updates.push(`total_hours_worked = ROUND(EXTRACT(EPOCH FROM ($${outIdx}::timestamptz - $${inIdx}::timestamptz)) / 3600.0, 2)`);
      params.push(finalCheckOut, finalCheckIn);
    }

    params.push(logId);
    const { rows } = await query(
      `UPDATE attendance_logs SET ${updates.join(', ')} WHERE id = $${p} RETURNING *`,
      params
    );

    res.json({ message: 'Attendance record overridden', log: rows[0] });
  } catch (err) {
    console.error('Override error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/attendance/breaches/:logId ──────────────────────
router.get('/breaches/:logId', authenticate, async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT * FROM breach_logs
      WHERE attendance_log_id = $1
      ORDER BY exit_time ASC
    `, [req.params.logId]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;

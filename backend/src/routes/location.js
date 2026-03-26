// src/routes/location.js
const express = require('express');
const { body, validationResult } = require('express-validator');
const { query, withTransaction } = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { sendNotification } = require('../utils/notificationService');

const router = express.Router();

// ── POST /api/location/ping ──────────────────────────────────
// Called every ~30s by mobile app while staff is checked in.
// Opens breach_log when outside, closes when back inside.
router.post('/ping', authenticate, [
  body('latitude').isFloat({ min: -90, max: 90 }),
  body('longitude').isFloat({ min: -180, max: 180 }),
  body('accuracy').optional().isFloat({ min: 0 }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { latitude, longitude, accuracy } = req.body;

  try {
    // 1. Find active attendance session for user
    const { rows: sessions } = await query(`
      SELECT al.id as log_id, al.site_id,
             ps.radius_meters,
             ST_DWithin(
               ps.location,
               ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography,
               ps.radius_meters
             ) AS inside
      FROM attendance_logs al
      JOIN projects_sites ps ON ps.id = al.site_id
      WHERE al.user_id = $3 AND al.status = 'active'
    `, [latitude, longitude, req.user.id]);

    if (!sessions.length) {
      // No active session — just record ping for live map
      await query(`
        INSERT INTO location_pings (user_id, latitude, longitude, accuracy, is_inside)
        VALUES ($1, $2, $3, $4, false)
      `, [req.user.id, latitude, longitude, accuracy || null]);
      return res.json({ status: 'no_active_session' });
    }

    const session = sessions[0];
    const isInside = session.inside;

    // 2. Check for open breach
    const { rows: openBreaches } = await query(`
      SELECT id FROM breach_logs
      WHERE attendance_log_id = $1 AND return_time IS NULL
    `, [session.log_id]);

    const hasOpenBreach = openBreaches.length > 0;

    await withTransaction(async (client) => {
      if (!isInside && !hasOpenBreach) {
        // ── BREACH OPENED: user left the geofence ──
        await client.query(`
          INSERT INTO breach_logs (attendance_log_id, user_id, exit_time, exit_lat, exit_lng)
          VALUES ($1, $2, NOW(), $3, $4)
        `, [session.log_id, req.user.id, latitude, longitude]);

        // Send Push Notification
        try {
          const { rows: userRows } = await client.query('SELECT expo_push_token FROM users WHERE id = $1', [req.user.id]);
          const token = userRows[0]?.expo_push_token;
          if (token) {
            await sendNotification(
              token,
              '🚨 Geofence Breach Detected',
              'You have left the designated work area. Please return immediately to maintain session compliance.',
              { type: 'BREACH_OPENED', logId: session.log_id }
            );
          }
        } catch (notifyErr) {
          console.error('Failed to send breach notification:', notifyErr);
        }
      }

      if (isInside && hasOpenBreach) {
        // ── BREACH CLOSED: user returned ──
        await client.query(`
          UPDATE breach_logs
          SET return_time = NOW(), return_lat = $2, return_lng = $3
          WHERE attendance_log_id = $1 AND return_time IS NULL
        `, [session.log_id, latitude, longitude]);
      }

      // 3. Record ping for live map
      await client.query(`
        INSERT INTO location_pings (user_id, latitude, longitude, accuracy, is_inside)
        VALUES ($1, $2, $3, $4, $5)
      `, [req.user.id, latitude, longitude, accuracy || null, isInside]);

      // 4. Prune old pings (keep last 500 per user)
      await client.query(`
        DELETE FROM location_pings
        WHERE user_id = $1
          AND id NOT IN (
            SELECT id FROM location_pings
            WHERE user_id = $1
            ORDER BY pinged_at DESC
            LIMIT 500
          )
      `, [req.user.id]);
    });

    res.json({
      status: 'ok',
      isInside,
      breachOpened: !isInside && !hasOpenBreach,
      breachClosed: isInside && hasOpenBreach,
    });
  } catch (err) {
    console.error('Location ping error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/location/live (admin) ───────────────────────────
// Returns latest ping per user who is currently checked in.
router.get('/live', authenticate, async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT DISTINCT ON (al.user_id)
        al.user_id,
        COALESCE(lp.latitude, ps.latitude) as latitude,
        COALESCE(lp.longitude, ps.longitude) as longitude,
        COALESCE(lp.is_inside, true) as is_inside,
        COALESCE(lp.pinged_at, al.check_in_time) as pinged_at,
        u.first_name,
        u.last_name,
        u.avatar_url,
        al.id as log_id,
        al.site_id,
        al.check_in_time,
        al.check_in_note,
        ps.name as site_name,
        ps.latitude as site_lat,
        ps.longitude as site_lng,
        ps.radius_meters,
        (SELECT COUNT(*) FROM breach_logs bl
         WHERE bl.attendance_log_id = al.id AND bl.return_time IS NULL) as has_open_breach,
        (SELECT COUNT(*) FROM breach_logs bl
         WHERE bl.attendance_log_id = al.id) as total_breach_count,
        (SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE(return_time, NOW()) - exit_time))/60), 0)
         FROM breach_logs bl WHERE bl.attendance_log_id = al.id) as total_away_minutes
      FROM attendance_logs al
      JOIN users u ON u.id = al.user_id
      JOIN projects_sites ps ON ps.id = al.site_id
      LEFT JOIN location_pings lp ON lp.user_id = al.user_id
      WHERE al.status = 'active'
      ORDER BY al.user_id, lp.pinged_at DESC NULLS LAST
    `);
    res.json(rows);
  } catch (err) {
    console.error('Live location error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;

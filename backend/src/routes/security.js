// src/routes/security.js
// ─────────────────────────────────────────────────────────────────────────────
// Zero-Trust Security Routes
//   POST /api/security/register-device   — bind device fingerprint to account
//   POST /api/security/checkin-selfie    — AWS Rekognition face compare
//   GET  /api/security/audit-log         — admin: paginated audit log
//   POST /api/security/generate-qr       — admin: create burn-after-reading QR token
//   POST /api/security/verify-qr         — mobile: validate & consume QR token → check-in
//   GET  /api/security/session-policy    — admin: get global session conflict policy
//   PUT  /api/security/session-policy    — admin: set policy (block_new | terminate_old)
// ─────────────────────────────────────────────────────────────────────────────
const express = require('express');
const crypto  = require('crypto');
const { body, query: qv, validationResult } = require('express-validator');
const { query, withTransaction } = require('../config/db');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { logSecurityEvent } = require('../utils/securityLogger');

// AWS Rekognition (optional — gracefully disabled if not configured)
let rekognition = null;
try {
  if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_REGION) {
    const { RekognitionClient, CompareFacesCommand } = require('@aws-sdk/client-rekognition');
    rekognition = new RekognitionClient({ region: process.env.AWS_REGION });
    console.log('[Security] AWS Rekognition initialized');
  } else {
    console.warn('[Security] AWS Rekognition not configured — selfie verification disabled');
  }
} catch (err) {
  console.warn('[Security] AWS SDK not installed — selfie verification disabled');
}

const router = express.Router();

// ── GET /api/security/status ────────────────────────────────────────────────
// Returns health status of security infrastructure (AWS, SMTP)
router.get('/status', authenticate, requireAdmin, async (req, res) => {
  res.json({
    awsRekognition: {
      enabled: !!rekognition,
      region: process.env.AWS_REGION || 'not-set',
      confidenceThreshold: parseFloat(process.env.REKOGNITION_CONFIDENCE_THRESHOLD) || 80
    },
    smtp: {
      enabled: !!process.env.SMTP_HOST && !!process.env.SMTP_USER,
      host: process.env.SMTP_HOST || 'not-set'
    },
    system: {
      version: 'ZT-2.1.0',
      uptime: process.uptime()
    }
  });
});

// ── POST /api/security/register-device ───────────────────────────────────────
// Called immediately after first login. Stores device fingerprint.
// If a fingerprint is already registered, this is a NO-OP (idempotent).
// To re-register (new phone), an admin must call DELETE on the user's device.
router.post('/register-device', authenticate, [
  body('deviceId').trim().isLength({ min: 16, max: 256 }).withMessage('Invalid device ID format'),
  body('deviceInfo').optional().isObject(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

  const { deviceId, deviceInfo } = req.body;

  try {
    const { rows } = await query('SELECT device_fingerprint FROM users WHERE id = $1', [req.user.id]);
    if (!rows.length) return res.status(404).json({ error: 'User not found' });

    if (rows[0].device_fingerprint) {
      // Already registered — verify it matches (prevents re-registration attacks)
      if (rows[0].device_fingerprint !== deviceId) {
        await logSecurityEvent({
          userId: req.user.id,
          eventType: 'device_reregistration_attempt',
          severity: 'critical',
          detail: { attemptedDeviceId: deviceId.substring(0, 16) + '...' },
          ipAddress: req.ip,
        });
        return res.status(403).json({
          error: 'DEVICE_ALREADY_REGISTERED',
          message: 'This account already has a registered device. Contact your administrator to re-register.',
        });
      }
      return res.json({ message: 'Device already registered', registered: true });
    }

    // First-time registration
    await query(
      `UPDATE users SET device_fingerprint = $1, device_registered_at = NOW(), updated_at = NOW() WHERE id = $2`,
      [deviceId, req.user.id]
    );

    await logSecurityEvent({
      userId: req.user.id,
      eventType: 'device_registered',
      severity: 'info',
      detail: { deviceInfo: deviceInfo || {}, deviceIdPrefix: deviceId.substring(0, 16) + '...' },
      ipAddress: req.ip,
    });

    res.json({ message: 'Device registered successfully', registered: true });
  } catch (err) {
    console.error('Device registration error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── DELETE /api/security/users/:userId/device — Admin: Reset device binding ──
router.delete('/users/:userId/device', authenticate, requireAdmin, async (req, res) => {
  try {
    const { rows } = await query(
      `UPDATE users SET device_fingerprint = NULL, device_registered_at = NULL, updated_at = NOW()
       WHERE id = $1 RETURNING id, email, first_name, last_name`,
      [req.params.userId]
    );
    if (!rows.length) return res.status(404).json({ error: 'User not found' });

    await logSecurityEvent({
      userId: req.params.userId,
      eventType: 'device_unbound',
      severity: 'info',
      detail: { unbound_by: req.user.id },
      ipAddress: req.ip,
    });

    res.json({ message: 'Device binding reset. User can re-register on next login.', user: rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/security/checkin-selfie ─────────────────────────────────────────
// Receives base64 selfie image, compares against user's avatar_url using
// AWS Rekognition CompareFaces. Returns { passed, confidence }.
// If AWS is not configured, returns { passed: true, skipped: true } (graceful).
router.post('/checkin-selfie', authenticate, [
  body('selfieBase64').notEmpty().withMessage('Selfie image is required'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

  // Graceful degradation — if Rekognition not configured, allow check-in
  if (!rekognition) {
    return res.json({ passed: true, skipped: true, message: 'Selfie verification not configured' });
  }

  const { selfieBase64 } = req.body;

  try {
    // Get the user's reference photo (HR profile photo)
    const { rows } = await query('SELECT avatar_url FROM users WHERE id = $1', [req.user.id]);
    if (!rows.length) return res.status(404).json({ error: 'User not found' });

    const avatarUrl = rows[0].avatar_url;
    if (!avatarUrl) {
      // No reference photo on file — skip selfie check
      return res.json({ passed: true, skipped: true, message: 'No reference photo on file' });
    }

    // Fetch the reference photo from local storage
    const fs = require('fs');
    const path = require('path');
    const refPhotoPath = path.join(__dirname, '../../', avatarUrl);
    
    if (!fs.existsSync(refPhotoPath)) {
      return res.json({ passed: true, skipped: true, message: 'Reference photo not accessible' });
    }

    const refImageBytes = fs.readFileSync(refPhotoPath);

    // Strip data URL prefix if present
    const base64Data = selfieBase64.replace(/^data:image\/\w+;base64,/, '');
    const selfieBytes = Buffer.from(base64Data, 'base64');

    const CONFIDENCE_THRESHOLD = parseFloat(process.env.REKOGNITION_CONFIDENCE_THRESHOLD) || 80;

    const { CompareFacesCommand } = require('@aws-sdk/client-rekognition');
    const command = new CompareFacesCommand({
      SourceImage: { Bytes: selfieBytes },
      TargetImage: { Bytes: refImageBytes },
      SimilarityThreshold: CONFIDENCE_THRESHOLD,
    });

    const response = await rekognition.send(command);
    const match = response.FaceMatches?.[0];
    const confidence = match?.Similarity ?? 0;
    const passed = confidence >= CONFIDENCE_THRESHOLD;

    if (!passed) {
      await logSecurityEvent({
        userId: req.user.id,
        eventType: 'selfie_fail',
        severity: 'critical',
        detail: { confidence, threshold: CONFIDENCE_THRESHOLD },
        ipAddress: req.ip,
      });
    }

    res.json({ passed, confidence: parseFloat(confidence.toFixed(2)), threshold: CONFIDENCE_THRESHOLD });
  } catch (err) {
    console.error('Selfie verification error:', err);
    // Don't block check-in on Rekognition errors — log and pass through
    await logSecurityEvent({
      userId: req.user.id,
      eventType: 'selfie_error',
      severity: 'medium',
      detail: { error: err.message },
      ipAddress: req.ip,
    });
    res.json({ passed: true, skipped: true, message: 'Verification service error — check-in permitted' });
  }
});

// ── GET /api/security/audit-log ───────────────────────────────────────────────
// Admin-only. Returns paginated security audit log with filters.
router.get('/audit-log', authenticate, requireAdmin, async (req, res) => {
  const { eventType, severity, userId, page = 1, limit = 50 } = req.query;
  const conditions = [];
  const params = [];
  let p = 1;

  if (eventType) { conditions.push(`sal.event_type = $${p++}`); params.push(eventType); }
  if (severity)  { conditions.push(`sal.severity = $${p++}`);   params.push(severity); }
  if (userId)    { conditions.push(`sal.user_id = $${p++}`);     params.push(userId); }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
  const offset = (page - 1) * limit;

  try {
    const [data, count] = await Promise.all([
      query(`
        SELECT sal.*, u.first_name, u.last_name, u.email
        FROM security_audit_log sal
        LEFT JOIN users u ON u.id = sal.user_id
        ${where}
        ORDER BY sal.created_at DESC
        LIMIT $${p} OFFSET $${p + 1}
      `, [...params, limit, offset]),
      query(`SELECT COUNT(*) FROM security_audit_log sal ${where}`, params),
    ]);

    res.json({
      events: data.rows,
      total: parseInt(count.rows[0].count),
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (err) {
    console.error('Audit log fetch error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/security/generate-qr ────────────────────────────────────────────
// Admin generates a burn-after-reading QR token for a site.
// Token rotates every 24h and is single-use per employee per shift.
router.post('/generate-qr', authenticate, requireAdmin, [
  body('siteId').isUUID().withMessage('Valid site ID required'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

  const { siteId } = req.body;

  try {
    const { rows: siteRows } = await query(
      'SELECT id, name FROM projects_sites WHERE id = $1 AND is_active = true',
      [siteId]
    );
    if (!siteRows.length) return res.status(404).json({ error: 'Site not found or inactive' });

    // Generate a cryptographically random token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    await query(
      `INSERT INTO qr_tokens (token, site_id, expires_at, created_by)
       VALUES ($1, $2, $3, $4)`,
      [token, siteId, expiresAt, req.user.id]
    );

    res.json({
      token,
      siteId,
      siteName: siteRows[0].name,
      expiresAt: expiresAt.toISOString(),
      qrPayload: JSON.stringify({ type: 'ATTENDANCE_QR', token, siteId }),
    });
  } catch (err) {
    console.error('QR generation error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/security/verify-qr ──────────────────────────────────────────────
// Mobile scans QR → sends token → backend validates & checks in atomically.
router.post('/verify-qr', authenticate, [
  body('token').trim().isLength({ min: 64, max: 64 }).withMessage('Invalid QR token format'),
  body('latitude').isFloat({ min: -90, max: 90 }),
  body('longitude').isFloat({ min: -180, max: 180 }),
  body('note').trim().isLength({ min: 3, max: 500 }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

  const { token, latitude, longitude, note } = req.body;

  try {
    await withTransaction(async (client) => {
      // 1. Look up the token (lock the row to prevent race conditions)
      const { rows: tokenRows } = await client.query(
        `SELECT qt.*, ps.name as site_name, ps.radius_meters,
                ST_DWithin(ps.location, ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography, ps.radius_meters) AS inside
         FROM qr_tokens qt
         JOIN projects_sites ps ON ps.id = qt.site_id
         WHERE qt.token = $3
         FOR UPDATE`,
        [latitude, longitude, token]
      );

      if (!tokenRows.length) {
        return res.status(404).json({ error: 'QR_INVALID', message: 'QR code not found or expired.' });
      }

      const qr = tokenRows[0];

      // 2. Check expiry
      if (new Date() > new Date(qr.expires_at)) {
        return res.status(410).json({ error: 'QR_EXPIRED', message: 'This QR code has expired (24h limit).' });
      }

      // 3. Check if this user has already used this QR in the current shift day
      const { rows: used } = await client.query(
        `SELECT id FROM qr_usages WHERE token = $1 AND user_id = $2 AND DATE(used_at) = CURRENT_DATE`,
        [token, req.user.id]
      );
      if (used.length) {
        await logSecurityEvent({
          userId: req.user.id,
          eventType: 'qr_replay',
          severity: 'high',
          detail: { token: token.substring(0, 16) + '...', siteId: qr.site_id },
          ipAddress: req.ip,
        });
        return res.status(409).json({ error: 'QR_ALREADY_USED', message: 'You have already used this QR code today.' });
      }

      // 4. Check existing active session
      const { rows: existing } = await client.query(
        'SELECT id FROM attendance_logs WHERE user_id = $1 AND status = $2',
        [req.user.id, 'active']
      );
      if (existing.length) {
        return res.status(400).json({ error: 'Already checked in. Please check out first.' });
      }

      // 5. Create attendance log
      const { rows: logRows } = await client.query(
        `INSERT INTO attendance_logs (user_id, site_id, check_in_time, check_in_note, status, check_in_method)
         VALUES ($1, $2, NOW(), $3, 'active', 'qr')
         RETURNING id, check_in_time, check_in_note, status`,
        [req.user.id, qr.site_id, note]
      );

      // 6. Mark this QR as used by this user today
      await client.query(
        'INSERT INTO qr_usages (token, user_id) VALUES ($1, $2)',
        [token, req.user.id]
      );

      res.status(201).json({
        message: 'Checked in via QR code',
        log: logRows[0],
        site: { id: qr.site_id, name: qr.site_name },
        method: 'qr',
      });
    });
  } catch (err) {
    if (!res.headersSent) {
      console.error('QR verify error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }
});

// ── GET /api/security/session-policy ─────────────────────────────────────────
// Returns the current global dual-login conflict policy
router.get('/session-policy', authenticate, requireAdmin, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT value FROM system_settings WHERE key = 'session_conflict_policy'`
    );
    res.json({ policy: rows[0]?.value || 'block_new' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── PUT /api/security/session-policy ─────────────────────────────────────────
// Admin sets: 'block_new' (reject 2nd device login) | 'terminate_old' (kill 1st session)
router.put('/session-policy', authenticate, requireAdmin, [
  body('policy').isIn(['block_new', 'terminate_old']).withMessage('Policy must be block_new or terminate_old'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

  try {
    await query(
      `INSERT INTO system_settings (key, value, updated_by)
       VALUES ('session_conflict_policy', $1, $2)
       ON CONFLICT (key) DO UPDATE SET value = $1, updated_by = $2, updated_at = NOW()`,
      [req.body.policy, req.user.id]
    );
    res.json({ message: 'Session policy updated', policy: req.body.policy });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/security/report-settings ───────────────────────────────────────
// Admin-only: Fetch current weekly report automation status & recipient
router.get('/report-settings', authenticate, requireAdmin, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT key, value FROM system_settings WHERE key IN ('weekly_report_enabled', 'weekly_report_recipient', 'weekly_report_format')`
    );
    const settings = rows.reduce((acc, row) => ({ ...acc, [row.key]: row.value }), {});
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── PUT /api/security/report-settings ───────────────────────────────────────
// Admin-only: Update weekly report automation settings
router.put('/report-settings', authenticate, requireAdmin, [
  body('enabled').isBoolean(),
  body('recipient').isEmail().withMessage('Invalid recipient email'),
  body('format').isIn(['pdf', 'xlsx', 'both']).withMessage('Invalid format'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

  const { enabled, recipient, format } = req.body;

  try {
    await withTransaction(async (client) => {
      await client.query(
        "INSERT INTO system_settings (key, value, updated_by) VALUES ('weekly_report_enabled', $1, $2) ON CONFLICT (key) DO UPDATE SET value = $1, updated_by = $2, updated_at = NOW()",
        [String(enabled), req.user.id]
      );
      await client.query(
        "INSERT INTO system_settings (key, value, updated_by) VALUES ('weekly_report_recipient', $1, $2) ON CONFLICT (key) DO UPDATE SET value = $1, updated_by = $2, updated_at = NOW()",
        [recipient, req.user.id]
      );
      await client.query(
        "INSERT INTO system_settings (key, value, updated_by) VALUES ('weekly_report_format', $1, $2) ON CONFLICT (key) DO UPDATE SET value = $1, updated_by = $2, updated_at = NOW()",
        [format, req.user.id]
      );
    });
    res.json({ message: 'Report settings updated' });
  } catch (err) {
    console.error('Report settings update error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/security/report-test ──────────────────────────────────────────
// Admin-only: Manually trigger a test weekly report email
router.post('/report-test', authenticate, requireAdmin, async (req, res) => {
  try {
    const { rows: settings } = await query(
      `SELECT key, value FROM system_settings WHERE key IN ('weekly_report_recipient', 'weekly_report_format')`
    );
    const config = settings.reduce((acc, row) => ({ ...acc, [row.key]: row.value }), {});
    
    if (!config.weekly_report_recipient) {
      return res.status(400).json({ error: 'No recipient email configured in settings' });
    }

    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const { 
      fetchReportData, 
      aggregateReportData, 
      generateExcelBuffer, 
      generatePDFBuffer 
    } = require('../services/reportService');
    const { sendWeeklyReportEmail } = require('../utils/emailAlert');

    const rows = await fetchReportData({ startDate, endDate });
    const aggregated = aggregateReportData(rows, 'weekly');

    const [pdfBuffer, excelBuffer] = await Promise.all([
      generatePDFBuffer(rows, aggregated, 'weekly'),
      generateExcelBuffer(rows, aggregated, 'weekly')
    ]);

    await sendWeeklyReportEmail(config.weekly_report_recipient, pdfBuffer, excelBuffer, startDate, endDate);

    res.json({ message: `Test report sent to ${config.weekly_report_recipient}` });
  } catch (err) {
    console.error('Test report failed:', err);
    res.status(500).json({ error: 'Failed to send test report' });
  }
});

module.exports = router;

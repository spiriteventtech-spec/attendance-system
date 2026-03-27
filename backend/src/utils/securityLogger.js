// src/utils/securityLogger.js
// ─────────────────────────────────────────────────────────────────────────────
// Central audit log writer — writes to the security_audit_log table.
// All security events (device mismatch, velocity violation, replay attack, etc.)
// flow through this single utility.
// ─────────────────────────────────────────────────────────────────────────────
const { query } = require('../config/db');

/**
 * Log a security event to the database.
 * @param {object} opts
 * @param {string}  opts.userId     - UUID of the affected user (can be null for unauthenticated events)
 * @param {string}  opts.eventType  - 'device_mismatch' | 'velocity_violation' | 'replay_attack' |
 *                                    'mock_location' | 'selfie_fail' | 'session_terminated' |
 *                                    'missing_device_id' | 'stale_request' | 'invalid_nonce_signature' |
 *                                    'qr_replay' | 'session_conflict'
 * @param {string}  opts.severity   - 'info' | 'medium' | 'high' | 'critical'
 * @param {object}  opts.detail     - JSON payload with event-specific info
 * @param {string}  opts.ipAddress  - Requester's IP address
 */
const logSecurityEvent = async ({ userId, eventType, severity = 'high', detail = {}, ipAddress }) => {
  try {
    await query(
      `INSERT INTO security_audit_log (user_id, event_type, severity, detail, ip_address)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId || null, eventType, severity, JSON.stringify(detail), ipAddress || null]
    );
  } catch (err) {
    // Never let audit logging crash the request
    console.error('[SecurityLogger] Failed to write audit event:', err.message);
  }
};

module.exports = { logSecurityEvent };

// src/middleware/replayProtection.js
// ─────────────────────────────────────────────────────────────────────────────
// Cryptographic Replay Attack Prevention (HMAC-SHA256)
// Protects check-in, check-out, and location ping endpoints.
//
// Mobile must send:
//   X-Nonce: <hex string — HMAC-SHA256(userId + timestamp, JWT_SECRET)>
//   X-Timestamp: <unix timestamp in milliseconds>
//
// Server rejects if:
//   1. Timestamp is older than MAX_AGE_MS
//   2. Nonce signature doesn't match
//   3. Nonce has already been used (stored in used_nonces table)
// ─────────────────────────────────────────────────────────────────────────────
const crypto = require('crypto');
const { query } = require('../config/db');
const { logSecurityEvent } = require('../utils/securityLogger');

const MAX_AGE_MS = 60_000; // 60 seconds — reject stale requests

const verifyReplayProtection = async (req, res, next) => {
  // Only enforce on state-changing endpoints
  if (!['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) return next();

  // Skip for admin users and explicit bypass routes (login, register-device)
  const skipPaths = ['/login', '/register', '/security/register-device'];
  if (skipPaths.some(p => req.path.includes(p))) return next();
  if (req.user?.role === 'admin') return next();

  const nonce = req.headers['x-nonce'];
  const tsHeader = req.headers['x-timestamp'];

  if (!nonce || !tsHeader) {
    // Soft warn on missing — don't hard-block during mobile rollout
    // Once all clients are updated, flip this to return 400
    console.warn(`[ReplayProtection] Missing headers on ${req.method} ${req.path} for user ${req.user?.id}`);
    return next();
  }

  const ts = parseInt(tsHeader, 10);
  const now = Date.now();

  // ── 1. Timestamp freshness check ─────────────────────────────────────────
  if (isNaN(ts) || Math.abs(now - ts) > MAX_AGE_MS) {
    await logSecurityEvent({
      userId: req.user?.id,
      eventType: 'stale_request',
      severity: 'medium',
      detail: { timestamp: ts, serverTime: now, ageDiff: now - ts },
      ipAddress: req.ip,
    });
    return res.status(400).json({ error: 'REQUEST_EXPIRED', code: 'STALE_TIMESTAMP' });
  }

  // ── 2. HMAC signature verification ───────────────────────────────────────
  const expectedNonce = crypto
    .createHmac('sha256', process.env.JWT_SECRET)
    .update(`${req.user.id}:${tsHeader}`)
    .digest('hex');

  if (!crypto.timingSafeEqual(Buffer.from(nonce, 'hex'), Buffer.from(expectedNonce, 'hex'))) {
    await logSecurityEvent({
      userId: req.user?.id,
      eventType: 'invalid_nonce_signature',
      severity: 'critical',
      detail: { path: req.path },
      ipAddress: req.ip,
    });
    return res.status(403).json({ error: 'INVALID_NONCE', code: 'SIGNATURE_MISMATCH' });
  }

  // ── 3. Replay check — has this nonce been used before? ───────────────────
  try {
    const { rows: existing } = await query(
      'SELECT nonce FROM used_nonces WHERE nonce = $1',
      [nonce]
    );

    if (existing.length) {
      await logSecurityEvent({
        userId: req.user?.id,
        eventType: 'replay_attack',
        severity: 'critical',
        detail: { nonce: nonce.substring(0, 16) + '...', path: req.path },
        ipAddress: req.ip,
      });
      return res.status(409).json({ error: 'NONCE_REPLAYED', code: 'REPLAY_ATTACK_DETECTED' });
    }

    // ── 4. Store nonce with TTL (expires in 120 seconds, pruned by a cron) ──
    await query(
      `INSERT INTO used_nonces (nonce, user_id, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '120 seconds')
       ON CONFLICT (nonce) DO NOTHING`,
      [nonce, req.user.id]
    );

    next();
  } catch (err) {
    console.error('Replay protection DB error:', err);
    next(); // Fail-open on DB errors
  }
};

/**
 * Clean up expired nonces — call this periodically (e.g., every 5 minutes from index.js)
 */
const pruneExpiredNonces = async () => {
  try {
    const { rowCount } = await query('DELETE FROM used_nonces WHERE expires_at < NOW()');
    if (rowCount > 0) console.log(`[Nonce Cleanup] Pruned ${rowCount} expired nonces`);
  } catch (err) {
    console.error('[Nonce Cleanup] Error:', err);
  }
};

module.exports = { verifyReplayProtection, pruneExpiredNonces };

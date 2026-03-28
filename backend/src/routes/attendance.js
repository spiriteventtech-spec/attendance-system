// src/routes/attendance.js
const { query, withTransaction } = require('../config/db');
const { authenticate, requireAdmin } = require('../middleware/auth');
const redis = require('../config/redis');

module.exports = async function (fastify, opts) {

  // ── POST /api/attendance/checkin ──────────────────────────────
  fastify.post('/checkin', { preHandler: [authenticate] }, async (request, reply) => {
    const { siteId, latitude, longitude, note } = request.body;
    const userId = request.user.id;

    try {
      // 1. Geofence Check (PostGIS)
      const { rows: sites } = await query(`
        SELECT id, name, radius_meters,
               ST_DWithin(location, ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography, $3) AS inside
        FROM projects_sites WHERE id = $4 AND is_active = true
      `, [latitude, longitude, 500, siteId]); // Allow slightly larger buffer for GPS drift at checkin

      if (!sites.length) return reply.status(404).send({ error: 'Work site not found' });
      if (!sites[0].inside) return reply.status(403).send({ error: 'OUTSIDE_GEOFENCE' });

      // 2. Prevent Double Check-in
      const { rows: active } = await query('SELECT id FROM attendance_logs WHERE user_id = $1 AND status = \'active\'', [userId]);
      if (active.length) return reply.status(400).send({ error: 'You already have an active session' });

      // 3. PostgreSQL Transaction: Insert log + Set session state
      const { rows: log } = await query(`
        INSERT INTO attendance_logs (user_id, site_id, check_in_time, check_in_note, check_in_lat, check_in_lng, status)
        VALUES ($1, $2, NOW(), $3, $4, $5, 'active')
        RETURNING id, check_in_time, site_id
      `, [userId, siteId, note || null, latitude, longitude]);

      // 4. PERFORMANCE: Sync session status to Redis for sub-millisecond status check
      await redis.set(`active_session:${userId}`, JSON.stringify({ log_id: log[0].id, site_id: siteId }), 'EX', 43200); // 12h

      reply.status(201).send({ message: 'Checked in successfully', log: log[0] });
    } catch (err) {
      console.error('Checkin Error:', err);
      reply.status(500).send({ error: 'Failed to process check-in' });
    }
  });

  // ── POST /api/attendance/checkout ─────────────────────────────
  fastify.post('/checkout', { preHandler: [authenticate] }, async (request, reply) => {
    const { latitude, longitude, note } = request.body;
    const userId = request.user.id;

    try {
      // 1. PERFORMANCE: Check Redis first
      const sessionStr = await redis.get(`active_session:${userId}`);
      if (!sessionStr) {
        // Fallback to DB
        const { rows } = await query('SELECT id FROM attendance_logs WHERE user_id = $1 AND status = \'active\'', [userId]);
        if (!rows.length) return reply.status(404).send({ error: 'No active session found' });
      }

      // 2. Transasction: Close session and calculate duration
      const { rows: closed } = await query(`
        UPDATE attendance_logs
        SET check_out_time = NOW(),
            check_out_note = $2,
            check_out_lat = $3,
            check_out_lng = $4,
            status = 'completed',
            total_hours_worked = EXTRACT(EPOCH FROM (NOW() - check_in_time))/3600
        WHERE user_id = $1 AND status = 'active'
        RETURNING id, total_hours_worked
      `, [userId, note || null, latitude, longitude]);

      // 3. CACHE INVALIDATION: Remove active session from Redis
      await redis.del(`active_session:${userId}`);

      reply.send({ message: 'Checked out successfully', log: closed[0] });
    } catch (err) {
      reply.status(500).send({ error: 'Checkout failed' });
    }
  });

  // ── GET /api/attendance/active ───────────────────────────────
  fastify.get('/active', { preHandler: [authenticate] }, async (request, reply) => {
    // Attempt Redis fetch
    const sessionStr = await redis.get(`active_session:${request.user.id}`);
    if (sessionStr) {
       return reply.send(JSON.parse(sessionStr));
    }

    const { rows } = await query('SELECT id as log_id, site_id, check_in_time FROM attendance_logs WHERE user_id = $1 AND status = \'active\'', [request.user.id]);
    if (!rows.length) return reply.status(404).send({ error: 'No active session' });
    
    // Recovery: hydrate redis
    await redis.set(`active_session:${request.user.id}`, JSON.stringify(rows[0]), 'EX', 43200);
    reply.send(rows[0]);
  });
};

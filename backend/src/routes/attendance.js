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

  // ── GET /api/attendance/logs (Admin) ─────────────────────────
  fastify.get('/logs', { preHandler: [authenticate, requireAdmin] }, async (request, reply) => {
    const { userId, siteId, status, startDate, endDate, limit = 50 } = request.query;
    const conditions = [];
    const params = [];
    let p = 1;

    if (userId) { conditions.push(`al.user_id = $${p++}`); params.push(userId); }
    if (siteId) { conditions.push(`al.site_id = $${p++}`); params.push(siteId); }
    if (status) { conditions.push(`al.status = $${p++}`); params.push(status); }
    if (startDate) { conditions.push(`DATE(al.check_in_time) >= $${p++}`); params.push(startDate); }
    if (endDate) { conditions.push(`DATE(al.check_in_time) <= $${p++}`); params.push(endDate); }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    try {
      const { rows } = await query(`
        SELECT al.*, u.first_name, u.last_name, ps.name as site_name
        FROM attendance_logs al
        JOIN users u ON u.id = al.user_id
        JOIN projects_sites ps ON ps.id = al.site_id
        ${where}
        ORDER BY al.check_in_time DESC
        LIMIT $${p}
      `, [...params, limit]);
      reply.send({ logs: rows });
    } catch (err) {
      console.error(err);
      reply.status(500).send({ error: 'Failed to fetch logs' });
    }
  });

  // ── GET /api/attendance/history (Staff) ──────────────────────
  fastify.get('/history', { preHandler: [authenticate] }, async (request, reply) => {
    const { limit = 10 } = request.query;
    try {
      const { rows } = await query(`
        SELECT al.*, ps.name as site_name
        FROM attendance_logs al
        JOIN projects_sites ps ON ps.id = al.site_id
        WHERE al.user_id = $1
        ORDER BY al.check_in_time DESC
        LIMIT $2
      `, [request.user.id, limit]);
      reply.send(rows);
    } catch (err) {
      reply.status(500).send({ error: 'Failed to fetch history' });
    }
  });

  // ── POST /api/attendance/override (Admin) ────────────────────
  fastify.post('/override', { preHandler: [authenticate, requireAdmin] }, async (request, reply) => {
    const { logId, totalHours, note } = request.body;
    try {
      await query(`
        UPDATE attendance_logs
        SET total_hours_worked = $1, status = 'overridden', 
            check_out_note = CONCAT(check_out_note, ' | Admin Override: ', $2::text)
        WHERE id = $3
      `, [totalHours, note, logId]);
      reply.send({ message: 'Log overridden successfully' });
    } catch (err) {
      reply.status(500).send({ error: 'Failed to override log' });
    }
  });

  // ── GET /api/attendance/breaches/:logId (Admin) ──────────────
  fastify.get('/breaches/:logId', { preHandler: [authenticate, requireAdmin] }, async (request, reply) => {
    try {
      const { rows } = await query(`
        SELECT * FROM breach_logs WHERE attendance_log_id = $1 ORDER BY exit_time DESC
      `, [request.params.logId]);
      reply.send(rows);
    } catch (err) {
      reply.status(500).send({ error: 'Failed to fetch breaches' });
    }
  });
};

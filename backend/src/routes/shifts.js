// src/routes/shifts.js
const { query } = require('../config/db');
const { authenticate, requireAdmin } = require('../middleware/auth');

module.exports = async function (fastify, opts) {

  // ── GET /api/shifts/my (Staff) ────────────────────────────────
  fastify.get('/my', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { rows } = await query(`
        SELECT s.*, ps.name as site_name, ps.latitude, ps.longitude, ps.radius_meters
        FROM shifts s
        JOIN projects_sites ps ON ps.id = s.site_id
        WHERE s.user_id = $1
        ORDER BY s.start_time DESC LIMIT 20
      `, [request.user.id]);
      reply.send(rows);
    } catch (err) {
      reply.status(500).send({ error: 'Failed to fetch your shifts' });
    }
  });

  // ── GET /api/shifts (Admin) ───────────────────────────────────
  fastify.get('/', { preHandler: [authenticate, requireAdmin] }, async (request, reply) => {
    const { siteId, userId, start, end } = request.query;
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
      reply.send(rows);
    } catch (err) {
      reply.status(500).send({ error: 'Failed to fetch shifts' });
    }
  });

  // ── POST /api/shifts (Admin) ──────────────────────────────────
  fastify.post('/', { preHandler: [authenticate, requireAdmin] }, async (request, reply) => {
    const { userId, siteId, startTime, endTime } = request.body;
    if (new Date(startTime) >= new Date(endTime)) {
      return reply.status(400).send({ error: 'Start time must be before end time' });
    }
    try {
      const { rows } = await query(`
        INSERT INTO shifts (user_id, site_id, start_time, end_time)
        VALUES ($1, $2, $3, $4)
        RETURNING *
      `, [userId, siteId, startTime, endTime]);
      reply.status(201).send(rows[0]);
    } catch (err) {
      if (err.message.includes('conflicting key value')) {
        return reply.status(409).send({ error: 'Shift overlap detected' });
      }
      reply.status(500).send({ error: 'Shift creation failed' });
    }
  });

  // ── DELETE /api/shifts/:id (Admin) ────────────────────────────
  fastify.delete('/:id', { preHandler: [authenticate, requireAdmin] }, async (request, reply) => {
    try {
      const { rowCount } = await query('DELETE FROM shifts WHERE id = $1', [request.params.id]);
      if (!rowCount) return reply.status(404).send({ error: 'Shift not found' });
      reply.send({ message: 'Shift deleted successfully' });
    } catch (err) {
      reply.status(500).send({ error: 'Delete failed' });
    }
  });
};

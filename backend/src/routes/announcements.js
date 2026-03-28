// src/routes/announcements.js
const { query } = require('../config/db');
const { authenticate, requireAdmin } = require('../middleware/auth');

module.exports = async function (fastify, opts) {

  // ── GET /api/announcements ───────────────────────────────────
  fastify.get('/', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      let activeSiteId = null;
      if (request.user.role === 'staff') {
        const siteCheck = await query(
          'SELECT site_id FROM attendance_logs WHERE user_id = $1 AND status = \'active\'',
          [request.user.id]
        );
        if (siteCheck.rows.length) activeSiteId = siteCheck.rows[0].site_id;
      }

      const { rows } = await query(`
        SELECT a.*, u.first_name, u.last_name, tu.first_name as target_first_name, tu.last_name as target_last_name, ps.name as target_site_name
        FROM announcements a
        JOIN users u ON u.id = a.sender_id
        LEFT JOIN users tu ON tu.id = a.target_user_id
        LEFT JOIN projects_sites ps ON ps.id = a.target_site_id
        WHERE ($3 = 'admin') 
           OR (a.target_user_id IS NULL AND a.target_site_id IS NULL) 
           OR (a.target_user_id = $1) 
           OR (a.target_site_id IS NOT NULL AND a.target_site_id = $2)
        ORDER BY a.created_at DESC LIMIT 30
      `, [request.user.id, activeSiteId, request.user.role]);
      
      reply.send(rows);
    } catch (err) {
      reply.status(500).send({ error: 'Failed to fetch announcements' });
    }
  });

  // ── POST /api/announcements ──────────────────────────────────
  fastify.post('/', { preHandler: [authenticate, requireAdmin] }, async (request, reply) => {
    const { title, message, priority, targetUserId, targetSiteId } = request.body;
    try {
      const { rows } = await query(`
        INSERT INTO announcements (sender_id, title, message, priority, target_user_id, target_site_id)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `, [request.user.id, title, message, priority, targetUserId || null, targetSiteId || null]);

      reply.status(201).send({ message: 'Announcement posted', announcement: rows[0] });
    } catch (err) {
      reply.status(500).send({ error: 'Post failed' });
    }
  });

  // ── DELETE /api/announcements/:id ────────────────────────────
  fastify.delete('/:id', { preHandler: [authenticate, requireAdmin] }, async (request, reply) => {
    try {
      const { rowCount } = await query('DELETE FROM announcements WHERE id = $1', [request.params.id]);
      if (rowCount === 0) return reply.status(404).send({ error: 'Announcement not found' });
      reply.send({ message: 'Announcement deleted' });
    } catch (err) {
      reply.status(500).send({ error: 'Delete failed' });
    }
  });
};

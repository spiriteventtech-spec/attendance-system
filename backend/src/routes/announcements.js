// src/routes/announcements.js
const express = require('express');
const { body, validationResult } = require('express-validator');
const { query } = require('../config/db');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// ── GET /api/announcements ───────────────────────────────────
// List relevant announcements (broadcasts + targeted to user/site)
router.get('/', authenticate, async (req, res) => {
  try {
    // If staff, we need to check their active site to show site-specific messages
    let activeSiteId = null;
    if (req.user.role === 'staff') {
      const siteCheck = await query(`
        SELECT site_id FROM attendance_logs 
        WHERE user_id = $1 AND status = 'active'
      `, [req.user.id]);
      if (siteCheck.rows.length) activeSiteId = siteCheck.rows[0].site_id;
    }

    const { rows } = await query(`
      SELECT 
        a.*, 
        u.first_name, u.last_name,
        tu.first_name as target_first_name, tu.last_name as target_last_name,
        ps.name as target_site_name
      FROM announcements a
      JOIN users u ON u.id = a.sender_id
      LEFT JOIN users tu ON tu.id = a.target_user_id
      LEFT JOIN projects_sites ps ON ps.id = a.target_site_id
      WHERE 
        ($3 = 'admin')                                        -- Admin sees all
        OR (a.target_user_id IS NULL AND a.target_site_id IS NULL) -- Global
        OR (a.target_user_id = $1)                            -- Targeted to this user
        OR (a.target_site_id IS NOT NULL AND a.target_site_id = $2) -- Targeted to this site
      ORDER BY a.created_at DESC
      LIMIT 30
    `, [req.user.id, activeSiteId, req.user.role]);
    
    res.json(rows);
  } catch (err) {
    console.error('Fetch announcements error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/announcements ──────────────────────────────────
// Create a new announcement (Admin only)
router.post('/', authenticate, requireAdmin, [
  body('title').trim().isLength({ min: 3, max: 100 }).withMessage('Title must be 3-100 characters'),
  body('message').trim().isLength({ min: 3, max: 2000 }).withMessage('Message must be 3-2000 characters'),
  body('priority').isIn(['general', 'important', 'urgent']).withMessage('Invalid priority level'),
  body('targetUserId').optional({ nullable: true }).isUUID(),
  body('targetSiteId').optional({ nullable: true }).isUUID(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

  const { title, message, priority, targetUserId, targetSiteId } = req.body;

  try {
    const { rows } = await query(`
      INSERT INTO announcements (sender_id, title, message, priority, target_user_id, target_site_id)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [req.user.id, title, message, priority, targetUserId || null, targetSiteId || null]);

    res.status(201).json({
      message: 'Announcement posted successfully',
      announcement: rows[0]
    });
  } catch (err) {
    console.error('Post announcement error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── DELETE /api/announcements/:id ────────────────────────────
// Admin can delete announcements
router.delete('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const { rowCount } = await query(`
      DELETE FROM announcements WHERE id = $1
    `, [req.params.id]);

    if (rowCount === 0) return res.status(404).json({ error: 'Announcement not found' });
    res.json({ message: 'Announcement deleted' });
  } catch (err) {
    console.error('Delete announcement error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;

// src/routes/reports.js
const express = require('express');
const { query: qv } = require('express-validator');
const { authenticate, requireAdmin } = require('../middleware/auth');


const { 
  fetchReportData, 
  aggregateReportData, 
  generateExcelBuffer, 
  generatePDFBuffer 
} = require('../services/reportService');

const router = express.Router();

// ── GET /api/reports/export ───────────────────────────────────
router.get('/export', authenticate, requireAdmin, [
  qv('format').isIn(['pdf', 'xlsx', 'csv']).withMessage('format must be pdf, xlsx, or csv'),
  qv('startDate').optional().isISO8601(),
  qv('endDate').optional().isISO8601(),
  qv('siteId').optional().isUUID(),
  qv('userId').optional().isUUID(),
], async (req, res) => {
  const { format, startDate, endDate, siteId, userId, frequency = 'daily' } = req.query;
  const rows = await fetchReportData({ siteId, userId, startDate, endDate });
  const aggregated = aggregateReportData(rows, frequency);

  const title = 'Tactical Workforce Report';

  // ── CSV ──────────────────────────────────────────────────────
  if (format === 'csv') {
    const headers = [
      'Staff Name', 'Email', 'Site', 'Check-In', 'Check-Out',
      'Hours Worked', 'Away Minutes', 'Breaches', 'Status', 'Check-In Note', 'Check-Out Note', 'Override Comment'
    ];
    const lines = [
      headers.join(','),
      ...rows.map(r => [
        `"${r.staff_name}"`,
        r.email,
        `"${r.site_name}"`,
        r.check_in_time ? new Date(r.check_in_time).toISOString() : '',
        r.check_out_time ? new Date(r.check_out_time).toISOString() : '',
        r.total_hours_worked ?? '',
        r.total_away_minutes ?? 0,
        r.breaches,
        r.status,
        `"${(r.check_in_note || '').replace(/"/g, '""')}"`,
        `"${(r.check_out_note || '').replace(/"/g, '""')}"`,
        `"${(r.override_comment || '').replace(/"/g, '""')}"`,
      ].join(','))
    ];

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="attendance-report-${Date.now()}.csv"`);
    return res.send(lines.join('\n'));
  }

  // ── XLSX ─────────────────────────────────────────────────────
  if (format === 'xlsx') {
    const buffer = await generateExcelBuffer(rows, aggregated, frequency);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="tactical-report-${Date.now()}.xlsx"`);
    return res.send(buffer);
  }

  // ── PDF ──────────────────────────────────────────────────────
  if (format === 'pdf') {
    const buffer = await generatePDFBuffer(rows, aggregated, frequency);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="attendance-report-${Date.now()}.pdf"`);
    return res.send(buffer);
  }

  res.status(400).json({ error: 'Invalid format' });
});

module.exports = router;

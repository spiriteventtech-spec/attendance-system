// src/routes/reports.js
const { authenticate, requireAdmin } = require('../middleware/auth');
const { 
  fetchReportData, 
  aggregateReportData, 
  generateExcelBuffer, 
  generatePDFBuffer 
} = require('../services/reportService');

module.exports = async function (fastify, opts) {

  // ── GET /api/reports/export ───────────────────────────────────
  fastify.get('/export', { preHandler: [authenticate, requireAdmin] }, async (request, reply) => {
    const { format, startDate, endDate, siteId, userId, frequency = 'daily' } = request.query;
    
    try {
      const rows = await fetchReportData({ siteId, userId, startDate, endDate });
      const aggregated = aggregateReportData(rows, frequency);

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

        reply
          .header('Content-Type', 'text/csv')
          .header('Content-Disposition', `attachment; filename="attendance-report-${Date.now()}.csv"`)
          .send(lines.join('\n'));
        return;
      }

      // ── XLSX ─────────────────────────────────────────────────────
      if (format === 'xlsx') {
        const buffer = await generateExcelBuffer(rows, aggregated, frequency);
        reply
          .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
          .header('Content-Disposition', `attachment; filename="tactical-report-${Date.now()}.xlsx"`)
          .send(buffer);
        return;
      }

      // ── PDF ──────────────────────────────────────────────────────
      if (format === 'pdf') {
        const buffer = await generatePDFBuffer(rows, aggregated, frequency);
        reply
          .header('Content-Type', 'application/pdf')
          .header('Content-Disposition', `attachment; filename="attendance-report-${Date.now()}.pdf"`)
          .send(buffer);
        return;
      }

      reply.status(400).send({ error: 'Invalid format' });
    } catch (err) {
      console.error('Report Export Error:', err);
      reply.status(500).send({ error: 'Failed to generate report' });
    }
  });
};

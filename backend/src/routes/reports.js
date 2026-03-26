// src/routes/reports.js
const express = require('express');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');
const { query: qv } = require('express-validator');
const { query } = require('../config/db');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// ── Helper: fetch report data ─────────────────────────────────
async function fetchReportData({ siteId, userId, startDate, endDate }) {
  const conditions = ['al.check_out_time IS NOT NULL'];
  const params = [];
  let p = 1;

  if (siteId)    { conditions.push(`al.site_id = $${p++}`);        params.push(siteId); }
  if (userId)    { conditions.push(`al.user_id = $${p++}`);        params.push(userId); }
  if (startDate) { conditions.push(`al.check_in_time >= $${p++}`); params.push(startDate); }
  if (endDate)   { conditions.push(`al.check_in_time < $${p++}::date + 1`); params.push(endDate); }

  const { rows } = await query(`
    SELECT
      al.id,
      u.first_name || ' ' || u.last_name AS staff_name,
      u.email,
      ps.name AS site_name,
      al.check_in_time,
      al.check_out_time,
      al.check_in_note,
      al.check_out_note,
      al.total_hours_worked,
      al.total_away_minutes,
      al.status,
      al.override_comment,
      (SELECT COUNT(*) FROM breach_logs bl WHERE bl.attendance_log_id = al.id) as breaches
    FROM attendance_logs al
    JOIN users u ON u.id = al.user_id
    JOIN projects_sites ps ON ps.id = al.site_id
    WHERE ${conditions.join(' AND ')}
    ORDER BY al.check_in_time DESC
  `, params);

  return rows;
}

// ── Helper: Aggregate data for summary ────────────────────────
function aggregateReportData(rows, frequency) {
  const staff = {};
  const sites = {};
  const timeline = {};

  rows.forEach(r => {
    const hours = parseFloat(r.total_hours_worked) || 0;
    const date = new Date(r.check_in_time);
    
    // Group by Staff
    if (!staff[r.staff_name]) staff[r.staff_name] = { hours: 0, sessions: 0, breaches: 0 };
    staff[r.staff_name].hours += hours;
    staff[r.staff_name].sessions += 1;
    staff[r.staff_name].breaches += (parseInt(r.breaches) || 0);

    // Group by Site
    if (!sites[r.site_name]) sites[r.site_name] = { hours: 0, sessions: 0 };
    sites[r.site_name].hours += hours;
    sites[r.site_name].sessions += 1;

    // Group by Frequency (Timeline)
    let periodKey;
    if (frequency === 'daily') periodKey = date.toISOString().split('T')[0];
    else if (frequency === 'weekly') {
      const start = new Date(date);
      start.setDate(date.getDate() - date.getDay());
      periodKey = `Week of ${start.toISOString().split('T')[0]}`;
    } else {
      periodKey = date.toLocaleString('default', { month: 'long', year: 'numeric' });
    }

    if (!timeline[periodKey]) timeline[periodKey] = 0;
    timeline[periodKey] += hours;
  });

  return { 
    staff: Object.entries(staff).map(([name, data]) => ({ name, ...data })),
    sites: Object.entries(sites).map(([name, data]) => ({ name, ...data })),
    timeline: Object.entries(timeline).map(([date, hours]) => ({ date, hours }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
  };
}

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
  const generatedAt = new Date().toLocaleString();

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
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'EventsTrack';

    // Summary sheet
    const summarySheet = workbook.addWorksheet('Overview');
    summarySheet.addRow([title]);
    summarySheet.addRow([`Generated: ${generatedAt}`]);
    summarySheet.addRow([]);
    summarySheet.addRow(['METRIC', 'VALUE']);
    summarySheet.addRow(['Total Records', rows.length]);
    summarySheet.addRow(['Total Hours', rows.reduce((s, r) => s + (parseFloat(r.total_hours_worked) || 0), 0).toFixed(2)]);
    summarySheet.addRow(['Total Away Minutes', rows.reduce((s, r) => s + (parseInt(r.total_away_minutes) || 0), 0)]);
    summarySheet.addRow(['Frequency Filter', frequency.toUpperCase()]);

    // Staff Performance Sheet
    const staffSheet = workbook.addWorksheet('Staff Calculation');
    staffSheet.columns = [
      { header: 'Staff Name', key: 'name', width: 25 },
      { header: 'Total Hours', key: 'hours', width: 15 },
      { header: 'Sessions', key: 'sessions', width: 12 },
      { header: 'Breaches', key: 'breaches', width: 12 },
    ];
    aggregated.staff.forEach(s => staffSheet.addRow({ ...s, hours: s.hours.toFixed(2) }));

    // Site Utilization Sheet
    const siteSheet = workbook.addWorksheet('Project Calculation');
    siteSheet.columns = [
      { header: 'Site / Project Name', key: 'name', width: 30 },
      { header: 'Total Hours Allocated', key: 'hours', width: 20 },
      { header: 'Staff Deployment Count', key: 'sessions', width: 20 },
    ];
    aggregated.sites.forEach(s => siteSheet.addRow({ ...s, hours: s.hours.toFixed(2) }));

    // Timeline Sheet
    const timelineSheet = workbook.addWorksheet(`${frequency.charAt(0).toUpperCase() + frequency.slice(1)} Breakdown`);
    timelineSheet.columns = [
      { header: 'Period', key: 'date', width: 25 },
      { header: 'Hours Worked', key: 'hours', width: 15 },
    ];
    aggregated.timeline.forEach(t => timelineSheet.addRow({ ...t, hours: t.hours.toFixed(2) }));

    // Data sheet (Raw Logs)
    const logSheet = workbook.addWorksheet('Raw Logs');

    logSheet.columns = [
      { header: 'Staff Name',      key: 'staff_name',         width: 22 },
      { header: 'Email',           key: 'email',              width: 28 },
      { header: 'Site',            key: 'site_name',          width: 22 },
      { header: 'Check-In',        key: 'check_in_time',      width: 22 },
      { header: 'Check-Out',       key: 'check_out_time',     width: 22 },
      { header: 'Hours Worked',    key: 'total_hours_worked', width: 14 },
      { header: 'Away (min)',      key: 'total_away_minutes', width: 12 },
      { header: 'Breaches',        key: 'breaches',           width: 10 },
      { header: 'Status',          key: 'status',             width: 12 },
    ];

    // Style header rooms
    [staffSheet, siteSheet, timelineSheet, logSheet].forEach(s => {
        s.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        s.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A3C5E' } };
    });

    rows.forEach(r => {
      logSheet.addRow({
        ...r,
        check_in_time:  r.check_in_time  ? new Date(r.check_in_time).toLocaleString()  : '',
        check_out_time: r.check_out_time ? new Date(r.check_out_time).toLocaleString() : '',
        total_away_minutes: r.total_away_minutes || 0,
      });
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="tactical-report-${Date.now()}.xlsx"`);
    await workbook.xlsx.write(res);
    return res.end();
  }

  // ── PDF ──────────────────────────────────────────────────────
  if (format === 'pdf') {
    const doc = new PDFDocument({ margin: 40, size: 'A4', layout: 'landscape' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="attendance-report-${Date.now()}.pdf"`);
    doc.pipe(res);

    // Header
    doc.rect(0, 0, doc.page.width, 60).fill('#1A3C5E');
    doc.fillColor('#FFFFFF').fontSize(20).font('Helvetica-Bold')
       .text(title, 40, 18);
    doc.fontSize(9).font('Helvetica')
       .text(`Generated: ${generatedAt}  |  Records: ${rows.length}`, 40, 42);

    doc.fillColor('#000000').moveDown(3);

    // Summary stats
    const totalHours = rows.reduce((s, r) => s + (parseFloat(r.total_hours_worked) || 0), 0);
    const totalAway  = rows.reduce((s, r) => s + (parseInt(r.total_away_minutes) || 0), 0);

    doc.fontSize(10).font('Helvetica-Bold')
       .text(`Total Records: ${rows.length}   |   Total Hours: ${totalHours.toFixed(2)}   |   Total Away: ${totalAway} min   |   Freq: ${frequency}`, {
         align: 'center'
       });
    doc.moveDown(1);

    // ── Staff Performance Table ───────────────────────────────
    doc.fillColor('#1A3C5E').fontSize(12).font('Helvetica-Bold').text('Staff Calculation Overview', 40);
    doc.moveDown(0.5);
    
    let x = 40;
    const sCols = [
        { label: 'Staff Name', width: 150, key: 'name' },
        { label: 'Hours',      width: 60,  key: 'hours', fmt: v => v.toFixed(2) },
        { label: 'Sessions',   width: 60,  key: 'sessions' },
        { label: 'Breaches',   width: 60,  key: 'breaches' },
    ];
    
    // Header
    doc.rect(40, doc.y, 330, 15).fill('#334155');
    doc.fillColor('#FFFFFF').fontSize(8);
    sCols.forEach(c => {
        doc.text(c.label, x + 3, doc.y - 15 + 4, { width: c.width - 6 });
        x += c.width;
    });
    doc.moveDown(0.1);

    // Rows
    aggregated.staff.forEach((s, i) => {
        const y = doc.y;
        if (i % 2 === 0) doc.rect(40, y, 330, 15).fill('#F8FAFC');
        doc.fillColor('#333333');
        x = 40;
        sCols.forEach(c => {
            const val = c.fmt ? c.fmt(s[c.key]) : s[c.key];
            doc.text(String(val), x + 3, y + 4, { width: c.width - 6 });
            x += c.width;
        });
        doc.y = y + 15;
    });
    doc.moveDown(2);

    // ── Site Utilization Table ────────────────────────────────
    doc.fillColor('#1A3C5E').fontSize(12).font('Helvetica-Bold').text('Project Deployment Calculation', 40);
    doc.moveDown(0.5);
    
    x = 40;
    const pCols = [
        { label: 'Site / Project', width: 180, key: 'name' },
        { label: 'Total Hours',    width: 80,  key: 'hours', fmt: v => v.toFixed(2) },
        { label: 'Deployments',    width: 80,  key: 'sessions' },
    ];
    
    // Header
    doc.rect(40, doc.y, 340, 15).fill('#334155');
    doc.fillColor('#FFFFFF').fontSize(8);
    pCols.forEach(c => {
        doc.text(c.label, x + 3, doc.y - 15 + 4, { width: c.width - 6 });
        x += c.width;
    });
    doc.moveDown(0.1);

    // Rows
    aggregated.sites.forEach((s, i) => {
        const y = doc.y;
        if (i % 2 === 0) doc.rect(40, y, 340, 15).fill('#F8FAFC');
        doc.fillColor('#333333');
        x = 40;
        pCols.forEach(c => {
            const val = c.fmt ? c.fmt(s[c.key]) : s[c.key];
            doc.text(String(val), x + 3, y + 4, { width: c.width - 6 });
            x += c.width;
        });
        doc.y = y + 15;
    });
    doc.moveDown(2);

    // ── Raw Activity Logs ─────────────────────────────────────
    doc.addPage({ margin: 40, size: 'A4', layout: 'landscape' });
    doc.fillColor('#1A3C5E').fontSize(12).font('Helvetica-Bold').text('Detailed Activity Logs (Raw)', 40);
    doc.moveDown(0.5);

    const cols = [
      { label: 'Staff Name',    width: 120, key: 'staff_name' },
      { label: 'Site',          width: 100, key: 'site_name' },
      { label: 'Check-In',      width: 120, key: 'check_in_time', fmt: v => v ? new Date(v).toLocaleString() : '' },
      { label: 'Check-Out',     width: 120, key: 'check_out_time', fmt: v => v ? new Date(v).toLocaleString() : '' },
      { label: 'Hours',         width: 50,  key: 'total_hours_worked' },
      { label: 'Status',        width: 70,  key: 'status' },
    ];

    // Table header
    let tx = 40;
    const rowH = 18;
    doc.rect(40, doc.y, 580, rowH).fill('#1A3C5E');
    doc.fillColor('#FFFFFF').fontSize(8).font('Helvetica-Bold');
    cols.forEach(c => {
      doc.text(c.label, tx + 3, doc.y - rowH + 4, { width: c.width - 6 });
      tx += c.width;
    });
    doc.moveDown(0.1);

    // Table rows
    rows.slice(0, 500).forEach((r, i) => {
      if (doc.y > doc.page.height - 60) {
        doc.addPage({ margin: 40, size: 'A4', layout: 'landscape' });
      }
      const y = doc.y;
      if (i % 2 === 0) doc.rect(40, y, 580, rowH).fill('#F0F4F8');
      doc.fillColor('#333333').fontSize(7.5).font('Helvetica');
      tx = 40;
      cols.forEach(c => {
        const val = c.fmt ? c.fmt(r[c.key]) : (r[c.key] ?? '');
        doc.text(String(val), tx + 3, y + 4, { width: c.width - 6, ellipsis: true });
        tx += c.width;
      });
      doc.moveTo(40, y + rowH).lineTo(620, y + rowH).stroke('#DDDDDD');
      doc.y = y + rowH;
    });

    if (rows.length > 500) {
      doc.moveDown().fillColor('#888888').fontSize(8)
         .text(`... and ${rows.length - 500} more records. Export as XLSX for full analysis.`);
    }

    doc.end();
    return;
  }

  res.status(400).json({ error: 'Invalid format' });
});

module.exports = router;

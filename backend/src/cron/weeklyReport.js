const cron = require('node-cron');
const { query } = require('../config/db');
const { 
  fetchReportData, 
  aggregateReportData, 
  generateExcelBuffer, 
  generatePDFBuffer 
} = require('../services/reportService');
const { sendWeeklyReportEmail } = require('../utils/emailAlert');
const { format, subDays } = require('date-fns');

/**
 * Initialize the automated weekly report cron job.
 * Runs every Sunday at 11:59 PM (23:59).
 */
const initWeeklyReportCron = () => {
  // Cron schedule: 59 23 * * 0 (Sunday at 23:59)
  cron.schedule('59 23 * * 0', async () => {
    console.log('[Cron] Starting automated weekly report generation...');
    
    try {
      // 1. Check if reporting is enabled and get recipient
      const { rows: settings } = await query(
        "SELECT value FROM system_settings WHERE key = 'weekly_report_recipient'"
      );
      const recipientEmail = settings[0]?.value;

      const { rows: status } = await query(
        "SELECT value FROM system_settings WHERE key = 'weekly_report_enabled'"
      );
      const isEnabled = status[0]?.value === 'true';

      if (!recipientEmail || !isEnabled) {
        console.log('[Cron] Weekly report skipped: disabled or no recipient configured.');
        return;
      }

      // 2. Prepare date range (Last 7 days: Monday to Sunday)
      const endDate = format(new Date(), 'yyyy-MM-dd');
      const startDate = format(subDays(new Date(), 6), 'yyyy-MM-dd');

      // 3. Generate Report Data
      const rows = await fetchReportData({ startDate, endDate });
      if (rows.length === 0) {
        console.log('[Cron] No data found for the past week. Skipping report.');
        return;
      }
      
      const aggregated = aggregateReportData(rows, 'weekly');

      // 4. Generate Buffers
      const [pdfBuffer, excelBuffer] = await Promise.all([
        generatePDFBuffer(rows, aggregated, 'weekly'),
        generateExcelBuffer(rows, aggregated, 'weekly')
      ]);

      // 5. Send Email
      await sendWeeklyReportEmail(recipientEmail, pdfBuffer, excelBuffer, startDate, endDate);
      
      console.log(`[Cron] Weekly report successfully sent to ${recipientEmail}`);
    } catch (err) {
      console.error('[Cron] Weekly report failed:', err);
    }
  });

  console.log('[Cron] Weekly Report scheduler (Sundays 23:59) initialized');
};

module.exports = { initWeeklyReportCron };

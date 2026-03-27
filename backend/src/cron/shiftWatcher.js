// src/cron/shiftWatcher.js
const { query } = require('../config/db');
const { sendNotification } = require('../utils/notificationService');

/**
 * Checks for scheduled shifts that have started but have no check-in.
 * Sends a late-check-in push notification to the user.
 */
const checkLateShifts = async () => {
  console.log('📅 Running Late Shift Compliance Check...');
  try {
    const { rows } = await query(`
      SELECT s.id, s.user_id, s.start_time, u.expo_push_token, ps.name as site_name
      FROM shifts s
      JOIN users u ON u.id = s.user_id
      JOIN projects_sites ps ON ps.id = s.site_id
      WHERE s.status = 'scheduled'
      AND s.start_time < NOW() - INTERVAL '15 minutes'
      AND s.late_notified_at IS NULL
      AND u.expo_push_token IS NOT NULL
    `);

    for (const shift of rows) {
      try {
        console.log(`🔔 Sending late alert to user ${shift.user_id} for site ${shift.site_name}`);
        
        await sendNotification(
          shift.expo_push_token,
          'Shift Late Alert ⚠️',
          `You are more than 15 minutes late for your shift at ${shift.site_name}. Please check in or contact your supervisor.`,
          { shiftId: shift.id, type: 'LATE_ALERT' }
        );

        // Mark as notified to prevent duplicate alerts
        await query('UPDATE shifts SET late_notified_at = NOW() WHERE id = $1', [shift.id]);
        
      } catch (err) {
        console.error(`Failed to notify user ${shift.user_id}:`, err.message);
      }
    }
  } catch (err) {
    console.error('Error in checkLateShifts:', err);
  }
};

/**
 * Marks shifts as absent if they have significantly passed their end_time OR start_time without check-in.
 * Typically runs daily or every few hours.
 */
const markAbsences = async () => {
  console.log('📅 Running Daily Absence Cleanup...');
  try {
    // Mark as absent if shift end_time passed and still in 'scheduled' state
    const { rowCount } = await query(`
      UPDATE shifts
      SET status = 'absent', updated_at = NOW()
      WHERE status = 'scheduled'
      AND end_time < NOW()
    `);
    if (rowCount > 0) console.log(`✅ Marked ${rowCount} missed shifts as absent.`);
  } catch (err) {
    console.error('Error in markAbsences:', err);
  }
};

module.exports = { checkLateShifts, markAbsences };

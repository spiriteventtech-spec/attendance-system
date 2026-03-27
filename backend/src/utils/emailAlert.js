// src/utils/emailAlert.js
// ─────────────────────────────────────────────────────────────────────────────
// Email alert utility for critical security events.
// Uses nodemailer with SMTP credentials from environment variables.
// If SMTP is not configured, alerts are logged to console instead.
// ─────────────────────────────────────────────────────────────────────────────
const nodemailer = require('nodemailer');

let transporter = null;

const getTransporter = () => {
  if (transporter) return transporter;
  
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER) {
    return null; // Not configured — will log to console
  }

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
  return transporter;
};

/**
 * Send an email alert when a device mismatch is detected.
 * The real account owner is notified so they can take action.
 */
const sendDeviceMismatchAlert = async (email, fullName, ipAddress) => {
  const html = `
    <div style="font-family: monospace; background: #0a0a0a; color: #fff; padding: 32px; border-radius: 8px; max-width: 600px;">
      <div style="border-left: 4px solid #FF3D00; padding-left: 16px; margin-bottom: 24px;">
        <h2 style="color: #FF3D00; margin: 0;">⚠️ SECURITY ALERT — Unauthorized Device Detected</h2>
        <p style="color: #888; margin: 4px 0;">EventsTrack Field Terminal</p>
      </div>
      <p>Hello <strong style="color: #00F5FF;">${fullName}</strong>,</p>
      <p>An attempt was made to access your account from an <strong style="color: #FF3D00;">unregistered device</strong>.</p>
      <table style="width: 100%; border-collapse: collapse; margin: 24px 0;">
        <tr style="border-bottom: 1px solid #222;">
          <td style="color: #888; padding: 8px 0;">Time</td>
          <td style="color: #fff; text-align: right;">${new Date().toUTCString()}</td>
        </tr>
        <tr style="border-bottom: 1px solid #222;">
          <td style="color: #888; padding: 8px 0;">IP Address</td>
          <td style="color: #fff; text-align: right;">${ipAddress || 'Unknown'}</td>
        </tr>
        <tr>
          <td style="color: #888; padding: 8px 0;">Action Taken</td>
          <td style="color: #22C55E; text-align: right;">Request Blocked ✓</td>
        </tr>
      </table>
      <p style="color: #888; font-size: 12px;">
        If this was you (e.g. you got a new phone), please contact your administrator to re-register your device.
        If this was NOT you, your account is secure — the access was denied.
      </p>
    </div>
  `;

  const t = getTransporter();
  if (!t) {
    console.warn(`[EmailAlert] SMTP not configured. Would have sent device mismatch alert to ${email} (IP: ${ipAddress})`);
    return;
  }

  await t.sendMail({
    from: `"EventsTrack Security" <${process.env.SMTP_USER}>`,
    to: email,
    subject: '🚨 Security Alert: Unauthorized Device Access Attempt',
    html,
  });
  console.log(`[EmailAlert] Device mismatch alert sent to ${email}`);
};

/**
 * Send alert to all admin users when a velocity violation is detected.
 */
const sendVelocityViolationAlert = async (adminEmails, workerName, speedKph, workerId) => {
  const t = getTransporter();
  if (!t) {
    console.warn(`[EmailAlert] Velocity violation for ${workerName} (${speedKph.toFixed(1)} km/h) — SMTP not configured`);
    return;
  }

  const html = `
    <div style="font-family: monospace; background: #0a0a0a; color: #fff; padding: 32px; border-radius: 8px;">
      <h2 style="color: #FF3D00;">🚀 GPS VELOCITY VIOLATION — Possible Spoofing</h2>
      <p>Worker: <strong style="color: #00F5FF;">${workerName}</strong></p>
      <p>Impossible Speed Detected: <strong style="color: #FF3D00;">${speedKph.toFixed(1)} km/h</strong></p>
      <p style="color: #888;">This exceeds the physical maximum (300 km/h threshold). Location spoofing may be in progress.</p>
      <p>Worker ID: <code style="color: #888;">${workerId}</code></p>
      <p style="color: #888; font-size: 12px;">Review the live map and Security Audit Log in the admin panel for details.</p>
    </div>
  `;

  for (const email of adminEmails) {
    await t.sendMail({
      from: `"EventsTrack Security" <${process.env.SMTP_USER}>`,
      to: email,
      subject: `🚨 GPS Spoofing Alert: ${workerName} — ${speedKph.toFixed(1)} km/h`,
      html,
    }).catch(err => console.error(`Email to ${email} failed:`, err.message));
  }
};

module.exports = { sendDeviceMismatchAlert, sendVelocityViolationAlert };

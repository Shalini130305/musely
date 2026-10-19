/**
 * MUSELY Email Service
 *
 * Sends transactional emails via configured SMTP/provider.
 *
 * Required environment variables:
 *   EMAIL_FROM         - Sender address, e.g. noreply@musely.in
 *   EMAIL_FROM_NAME    - Sender display name, e.g. MUSELY
 *   SMTP_HOST          - SMTP host, e.g. smtp.gmail.com
 *   SMTP_PORT          - SMTP port, e.g. 587
 *   SMTP_USER          - SMTP username / email
 *   SMTP_PASS          - SMTP password or app-specific password
 *
 * Alternatively, set SENDGRID_API_KEY to use SendGrid.
 *
 * If no email provider is configured, emails are logged to console only.
 * This is safe for development but emails will not actually be delivered.
 */

import nodemailer from 'nodemailer';
import { logger } from '../utils/logger';

function createTransporter() {
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_PORT === '465',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }
  // Fallback: Ethereal (fake SMTP for dev). Will log preview URL.
  return null;
}

const FROM = `${process.env.EMAIL_FROM_NAME || 'MUSELY'} <${process.env.EMAIL_FROM || 'noreply@musely.in'}>`;

export async function sendPasswordResetEmail(
  to: string,
  displayName: string,
  resetUrl: string,
): Promise<void> {
  const transporter = createTransporter();

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset your MUSELY password</title>
</head>
<body style="background:#0B0B0D;color:#FFFFFF;font-family:Inter,Arial,sans-serif;margin:0;padding:0;">
  <div style="max-width:480px;margin:40px auto;background:#151519;border-radius:24px;border:1px solid #303039;overflow:hidden;">
    <div style="padding:32px 32px 20px;border-bottom:1px solid #303039;text-align:center;">
      <span style="font-size:28px;font-weight:900;letter-spacing:-0.5px;">M<span style="color:#FF4F9A">U</span>SELY</span>
    </div>
    <div style="padding:32px;">
      <h1 style="margin:0 0 12px;font-size:22px;font-weight:700;">Reset your password</h1>
      <p style="color:#B8B8C2;margin:0 0 24px;line-height:1.6;">
        Hi ${displayName}, we received a request to reset the password for your MUSELY account.
        Click the button below to choose a new password. This link expires in <strong>1 hour</strong>.
      </p>
      <a href="${resetUrl}"
         style="display:block;text-align:center;background:#FF4F9A;color:#FFFFFF;font-weight:700;
                padding:14px 24px;border-radius:14px;text-decoration:none;font-size:15px;">
        Reset Password
      </a>
      <p style="color:#B8B8C2;margin:24px 0 0;font-size:12px;line-height:1.6;">
        If you didn't request a password reset, please ignore this email. Your password will remain unchanged.
        <br>For security, this link works only once and expires after 1 hour.
      </p>
    </div>
    <div style="padding:20px 32px;border-top:1px solid #303039;text-align:center;">
      <p style="color:#555562;font-size:11px;margin:0;">
        © ${new Date().getFullYear()} MUSELY — India's Creative Discovery Platform
      </p>
    </div>
  </div>
</body>
</html>
  `.trim();

  const mailOptions = {
    from: FROM,
    to,
    subject: 'Reset your MUSELY password',
    html,
    text: `Reset your MUSELY password\n\nHi ${displayName},\n\nWe received a request to reset your password.\nClick this link to reset it (expires in 1 hour):\n\n${resetUrl}\n\nIf you didn't request this, ignore this email.\n\n© ${new Date().getFullYear()} MUSELY`,
  };

  if (!transporter) {
    // No SMTP configured — log for development
    logger.warn(`[EMAIL NOT SENT — SMTP not configured]\nTo: ${to}\nSubject: ${mailOptions.subject}\nReset URL: ${resetUrl}`);
    return;
  }

  try {
    const info = await transporter.sendMail(mailOptions);
    logger.info(`Password reset email sent to ${to} (messageId: ${info.messageId})`);
  } catch (err) {
    logger.error(`Failed to send password reset email to ${to}:`, err);
    // Don't throw — caller already responded success to prevent enumeration
  }
}

export async function sendOtpEmail(
  to: string,
  displayName: string,
  otp: string,
  purpose: 'email_verify' | 'login' | 'password_reset',
): Promise<void> {
  const transporter = createTransporter();

  const subjectMap = {
    email_verify: 'Verify your MUSELY email address',
    login: 'Your MUSELY sign-in code',
    password_reset: 'Your MUSELY password reset code',
  };

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="background:#0B0B0D;color:#FFFFFF;font-family:Inter,Arial,sans-serif;margin:0;padding:0;">
  <div style="max-width:480px;margin:40px auto;background:#151519;border-radius:24px;border:1px solid #303039;overflow:hidden;">
    <div style="padding:32px 32px 20px;border-bottom:1px solid #303039;text-align:center;">
      <span style="font-size:28px;font-weight:900;letter-spacing:-0.5px;">M<span style="color:#FF4F9A">U</span>SELY</span>
    </div>
    <div style="padding:32px;text-align:center;">
      <h1 style="margin:0 0 12px;font-size:20px;font-weight:700;">${subjectMap[purpose]}</h1>
      <p style="color:#B8B8C2;margin:0 0 24px;line-height:1.6;">Hi ${displayName}, your one-time code is:</p>
      <div style="background:#1C1C22;border:1px solid #FF4F9A;border-radius:16px;padding:24px;margin:0 auto 24px;max-width:220px;">
        <span style="font-size:36px;font-weight:900;letter-spacing:8px;color:#FF4F9A;">${otp}</span>
      </div>
      <p style="color:#B8B8C2;font-size:13px;margin:0;">This code expires in <strong>10 minutes</strong> and can only be used once.</p>
      <p style="color:#555562;font-size:12px;margin:16px 0 0;">If you didn't request this, please ignore this email.</p>
    </div>
    <div style="padding:20px 32px;border-top:1px solid #303039;text-align:center;">
      <p style="color:#555562;font-size:11px;margin:0;">© ${new Date().getFullYear()} MUSELY — India's Creative Discovery Platform</p>
    </div>
  </div>
</body>
</html>
  `.trim();

  const mailOptions = {
    from: FROM,
    to,
    subject: subjectMap[purpose],
    html,
    text: `Your MUSELY code: ${otp}\n\nThis code expires in 10 minutes.\n\nIf you didn't request this, ignore this email.`,
  };

  if (!transporter) {
    logger.warn(`[OTP EMAIL NOT SENT — SMTP not configured]\nTo: ${to}\nCode: ${otp}`);
    return;
  }

  try {
    await transporter.sendMail(mailOptions);
    logger.info(`OTP email sent to ${to}`);
  } catch (err) {
    logger.error(`Failed to send OTP email to ${to}:`, err);
  }
}

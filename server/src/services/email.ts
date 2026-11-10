/**
 * MUSELY Email Service
 *
 * Sends transactional emails via configured SMTP or Email API (Resend, SendGrid).
 *
 * Required environment variables:
 *   EMAIL_FROM         - Sender address, e.g. noreply@musely.in or onboarding@resend.dev
 *   EMAIL_FROM_NAME    - Sender display name, e.g. MUSELY
 *
 * One of the following providers:
 *   1) SMTP:
 *      SMTP_HOST       - e.g. smtp.gmail.com or smtp.sendgrid.net
 *      SMTP_PORT       - e.g. 587 or 465
 *      SMTP_USER       - SMTP username / email
 *      SMTP_PASS       - SMTP password / App password
 *   2) RESEND:
 *      RESEND_API_KEY  - e.g. re_xxxx
 *   3) SENDGRID:
 *      SENDGRID_API_KEY - e.g. SG.xxxx
 *
 * If no email provider is configured, email contents are logged securely to server logs.
 */

import nodemailer from 'nodemailer';
import { logger } from '../utils/logger';

function createTransporter() {
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    const port = parseInt(process.env.SMTP_PORT || '587', 10);
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    });
  }
  return null;
}

const FROM_EMAIL = process.env.EMAIL_FROM || 'noreply@musely.in';
const FROM_NAME = process.env.EMAIL_FROM_NAME || 'MUSELY';
const FROM = `"${FROM_NAME}" <${FROM_EMAIL}>`;

interface SendMailParams {
  to: string;
  subject: string;
  html: string;
  text: string;
}

async function sendEmailInternal({ to, subject, html, text }: SendMailParams): Promise<boolean> {
  // 1. Try Resend REST API if RESEND_API_KEY is configured
  if (process.env.RESEND_API_KEY) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RESEND_API_KEY.trim()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: FROM,
          to: [to],
          subject,
          html,
          text,
        }),
      });

      if (res.ok) {
        const data = await res.json() as any;
        logger.info(`Email successfully delivered via Resend to ${to} (id: ${data.id || 'ok'})`);
        return true;
      } else {
        const errText = await res.text();
        logger.error(`Resend API delivery error to ${to}: ${res.status} ${errText}`);
      }
    } catch (apiErr) {
      logger.error('Resend API request failed:', apiErr);
    }
  }

  // 2. Try SendGrid REST API if SENDGRID_API_KEY is configured
  if (process.env.SENDGRID_API_KEY) {
    try {
      const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.SENDGRID_API_KEY.trim()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: to }] }],
          from: { email: FROM_EMAIL, name: FROM_NAME },
          subject,
          content: [
            { type: 'text/plain', value: text },
            { type: 'text/html', value: html },
          ],
        }),
      });

      if (res.ok || res.status === 202) {
        logger.info(`Email successfully delivered via SendGrid to ${to}`);
        return true;
      } else {
        const errText = await res.text();
        logger.error(`SendGrid API delivery error to ${to}: ${res.status} ${errText}`);
      }
    } catch (sgErr) {
      logger.error('SendGrid API request failed:', sgErr);
    }
  }

  // 3. Try standard SMTP
  const transporter = createTransporter();
  if (transporter) {
    try {
      const info = await transporter.sendMail({
        from: FROM,
        to,
        subject,
        html,
        text,
      });
      logger.info(`Email successfully delivered via SMTP to ${to} (messageId: ${info.messageId})`);
      return true;
    } catch (err: any) {
      logger.error(`SMTP delivery failed to ${to}:`, {
        code: err?.code,
        command: err?.command,
        message: err?.message,
      });
      return false;
    }
  }

  // Fallback: No email provider configured
  logger.warn(
    `[EMAIL NOT SENT — No provider configured]\n` +
    `To: ${to}\n` +
    `Subject: ${subject}\n` +
    `Please set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, RESEND_API_KEY, or SENDGRID_API_KEY in Vercel environment variables.`
  );
  return false;
}

export async function sendPasswordResetEmail(
  to: string,
  displayName: string,
  resetUrl: string,
): Promise<void> {
  const subject = 'Reset Your MUSELY Password';

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset Your MUSELY Password</title>
</head>
<body style="background:#0B0B0D;color:#FFFFFF;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;margin:0;padding:24px 12px;">
  <div style="max-width:520px;margin:24px auto;background:#151519;border-radius:24px;border:1px solid #303039;overflow:hidden;box-shadow:0 12px 32px rgba(0,0,0,0.5);">
    <!-- Brand Header -->
    <div style="padding:32px 32px 24px;border-bottom:1px solid #303039;text-align:center;background:linear-gradient(180deg, #1A1A22 0%, #151519 100%);">
      <span style="font-size:30px;font-weight:900;letter-spacing:-0.5px;color:#FFFFFF;">M<span style="color:#FF4F9A">U</span>SELY</span>
      <p style="margin:4px 0 0;color:#757582;font-size:12px;text-transform:uppercase;letter-spacing:1px;font-weight:600;">Creative Discovery Platform</p>
    </div>

    <!-- Body -->
    <div style="padding:36px 32px;">
      <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#FFFFFF;letter-spacing:-0.3px;">Reset Your Password</h1>
      <p style="color:#B8B8C2;margin:0 0 20px;line-height:1.6;font-size:15px;">
        Hi <strong>${displayName || 'Creator'}</strong>,
      </p>
      <p style="color:#B8B8C2;margin:0 0 28px;line-height:1.6;font-size:14px;">
        We received a request to reset the password for your MUSELY account (<span style="color:#FFFFFF;">${to}</span>). Click the button below to choose a new password:
      </p>

      <!-- Action Button -->
      <div style="text-align:center;margin:32px 0;">
        <a href="${resetUrl}"
           target="_blank"
           rel="noopener noreferrer"
           style="display:inline-block;background:#FF4F9A;color:#FFFFFF;font-weight:700;
                  padding:14px 36px;border-radius:14px;text-decoration:none;font-size:15px;
                  box-shadow:0 4px 16px rgba(255,79,154,0.35);">
          Reset Password
        </a>
      </div>

      <!-- Expiration Notice -->
      <div style="background:#1C1C22;border-radius:12px;padding:14px 18px;border:1px solid #303039;margin:28px 0 20px;">
        <p style="color:#FF8FBD;font-size:13px;margin:0;font-weight:600;">
          ⏱ This password reset link expires in <strong>1 hour</strong> and can only be used once.
        </p>
      </div>

      <!-- Direct Link fallback -->
      <p style="color:#757582;font-size:12px;line-height:1.5;margin:0 0 16px;">
        If the button above does not work, copy and paste this secure link into your browser:
        <br>
        <a href="${resetUrl}" style="color:#FF4F9A;word-break:break-all;text-decoration:none;font-size:11px;">${resetUrl}</a>
      </p>

      <!-- Security Guidance -->
      <div style="border-top:1px solid #26262E;padding-top:20px;margin-top:24px;">
        <p style="color:#757582;margin:0;font-size:12px;line-height:1.6;">
          🔒 <strong>Did not request this?</strong> If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged and your account stays secure.
        </p>
      </div>
    </div>

    <!-- Footer -->
    <div style="padding:20px 32px;border-top:1px solid #303039;text-align:center;background:#0F0F12;">
      <p style="color:#555562;font-size:11px;margin:0;line-height:1.5;">
        © ${new Date().getFullYear()} MUSELY — India's Creative Discovery Platform<br>
        This is an automated security email. Please do not reply directly.
      </p>
    </div>
  </div>
</body>
</html>
  `.trim();

  const text = `Reset Your MUSELY Password\n\n` +
    `Hi ${displayName || 'Creator'},\n\n` +
    `We received a request to reset the password for your MUSELY account (${to}).\n\n` +
    `Click the link below to choose a new password (expires in 1 hour):\n` +
    `${resetUrl}\n\n` +
    `If you did not request this reset, please ignore this email. Your password will remain unchanged.\n\n` +
    `© ${new Date().getFullYear()} MUSELY`;

  await sendEmailInternal({ to, subject, html, text });
}

export async function sendOtpEmail(
  to: string,
  displayName: string,
  otp: string,
  purpose: 'email_verify' | 'login' | 'password_reset',
): Promise<void> {
  const subjectMap = {
    email_verify: 'Verify your MUSELY email address',
    login: 'Your MUSELY sign-in code',
    password_reset: 'Your MUSELY password reset code',
  };

  const subject = subjectMap[purpose];

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="background:#0B0B0D;color:#FFFFFF;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;margin:0;padding:20px;">
  <div style="max-width:480px;margin:24px auto;background:#151519;border-radius:24px;border:1px solid #303039;overflow:hidden;">
    <div style="padding:32px 32px 20px;border-bottom:1px solid #303039;text-align:center;">
      <span style="font-size:28px;font-weight:900;letter-spacing:-0.5px;">M<span style="color:#FF4F9A">U</span>SELY</span>
    </div>
    <div style="padding:32px;text-align:center;">
      <h1 style="margin:0 0 12px;font-size:20px;font-weight:700;">${subject}</h1>
      <p style="color:#B8B8C2;margin:0 0 24px;line-height:1.6;">Hi ${displayName || 'Creator'}, your one-time verification code is:</p>
      <div style="background:#1C1C22;border:1px solid #FF4F9A;border-radius:16px;padding:20px;margin:0 auto 24px;max-width:240px;">
        <span style="font-size:36px;font-weight:900;letter-spacing:8px;color:#FF4F9A;font-family:monospace;">${otp}</span>
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

  const text = `Your MUSELY code: ${otp}\n\nThis code expires in 10 minutes.\n\nIf you didn't request this, ignore this email.`;

  await sendEmailInternal({ to, subject, html, text });
}

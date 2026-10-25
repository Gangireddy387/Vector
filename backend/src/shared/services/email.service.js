import sendgrid from '@sendgrid/mail';
import { config } from '../../config/index.js';

const isConfigured = Boolean(config.sendgrid.apiKey);
if (isConfigured) sendgrid.setApiKey(config.sendgrid.apiKey);

export const isEmailEnabled = () => isConfigured;

/**
 * Sends a transactional email through SendGrid.
 * Without SENDGRID_API_KEY the message is logged instead, so every flow works in development.
 */
export async function sendEmail({ to, subject, html, text }) {
  if (!to) return { delivered: false };
  if (!isConfigured) {
    console.info(`[email:dry-run] to=${to} subject="${subject}"`);
    return { delivered: false, dryRun: true };
  }
  try {
    await sendgrid.send({
      to,
      from: { email: config.sendgrid.fromEmail, name: config.sendgrid.fromName },
      subject,
      html,
      text: text ?? html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
    });
    return { delivered: true };
  } catch (error) {
    console.error('[email] SendGrid delivery failed:', error.response?.body ?? error.message);
    return { delivered: false };
  }
}

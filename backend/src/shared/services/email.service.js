import sendgrid from '@sendgrid/mail';
import { config } from '../../config/index.js';

const isConfigured = Boolean(config.sendgrid.apiKey);
if (isConfigured) sendgrid.setApiKey(config.sendgrid.apiKey);

export const isEmailEnabled = () => isConfigured;

/**
 * Sends a transactional email through SendGrid.
 * Without SENDGRID_API_KEY the message is logged instead, so every flow works in development.
 * `attachments`: [{ filename, type, content (string or Buffer) }].
 */
export async function sendEmail({ to, subject, html, text, attachments = [] }) {
  if (!to) return { delivered: false };
  if (!isConfigured) {
    console.info(`[email:dry-run] to=${to} subject="${subject}"${attachments.length ? ` attachments=${attachments.map((file) => file.filename).join(',')}` : ''}`);
    return { delivered: false, dryRun: true };
  }
  try {
    await sendgrid.send({
      to,
      from: { email: config.sendgrid.fromEmail, name: config.sendgrid.fromName },
      subject,
      html,
      text: text ?? html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
      ...(attachments.length
        ? {
            attachments: attachments.map(({ filename, type, content }) => ({
              filename,
              type,
              disposition: 'attachment',
              content: Buffer.from(content).toString('base64'),
            })),
          }
        : {}),
    });
    return { delivered: true };
  } catch (error) {
    console.error('[email] SendGrid delivery failed:', error.response?.body ?? error.message);
    return { delivered: false };
  }
}

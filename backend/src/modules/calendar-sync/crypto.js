import crypto from 'node:crypto';
import { config } from '../../config/index.js';

/** Calendar sign-ins are stored encrypted (AES-256-GCM): a copy of the database alone does not open anyone's calendar. */

const key = () => crypto.createHash('sha256').update(config.calendar.tokenKey || `${config.jwt.secret}:calendar-tokens`).digest();

export function encrypt(text) {
  if (text == null) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(String(text), 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), data.toString('base64url')].join('.');
}

export function decrypt(value) {
  if (!value) return null;
  const [version, iv, tag, data] = String(value).split('.');
  if (version !== 'v1' || !iv || !tag || !data) throw new Error('Unreadable stored calendar sign-in');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
}

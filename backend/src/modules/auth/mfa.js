import crypto from 'node:crypto';
import * as OTPAuth from 'otpauth';
import { config } from '../../config/index.js';

/** TOTP secrets are stored encrypted (AES-256-GCM), same idea as calendar tokens. */

const key = () => crypto.createHash('sha256').update(`${config.jwt.secret}:mfa-secrets`).digest();

export function encryptSecret(text) {
  if (text == null) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(String(text), 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), data.toString('base64url')].join('.');
}

export function decryptSecret(value) {
  if (!value) return null;
  const [version, iv, tag, data] = String(value).split('.');
  if (version !== 'v1' || !iv || !tag || !data) throw new Error('Unreadable MFA secret');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
}

export function createTotpSecret(email) {
  const totp = new OTPAuth.TOTP({
    issuer: 'Vector',
    label: email,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: new OTPAuth.Secret({ size: 20 }),
  });
  return { secret: totp.secret.base32, otpauthUrl: totp.toString() };
}

export function verifyTotp(secret, code) {
  const totp = new OTPAuth.TOTP({
    issuer: 'Vector',
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  });
  // ±1 step covers clock skew of about a minute.
  return totp.validate({ token: String(code).replace(/\s/g, ''), window: 1 }) !== null;
}

const RECOVERY_COUNT = 8;

/** Eight one-time codes shown once; only hashes are stored. */
export function createRecoveryCodes() {
  const codes = Array.from({ length: RECOVERY_COUNT }, () =>
    crypto.randomBytes(5).toString('hex').toUpperCase().replace(/(.{4})(.{4})(.{2})/, '$1-$2-$3'),
  );
  return { codes, hashes: codes.map(hashRecoveryCode) };
}

export function hashRecoveryCode(code) {
  return crypto.createHash('sha256').update(String(code).trim().toUpperCase().replace(/[^A-Z0-9]/g, '')).digest('hex');
}

/** Returns the remaining hashes after consuming a matching code, or null if none matched. */
export function consumeRecoveryCode(hashes, code) {
  const needle = hashRecoveryCode(code);
  if (!Array.isArray(hashes) || !hashes.includes(needle)) return null;
  return hashes.filter((hash) => hash !== needle);
}

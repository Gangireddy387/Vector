import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from '../../config/index.js';

/**
 * Every token says what it is for (`typ`), so a token made for one purpose (a guest pass, a recording link) is never
 * accepted as a sign-in. Sign-in tokens also carry the account's `tokenVersion`: changing or resetting the password
 * raises it, which signs out every other session.
 */
export const TOKEN_TYPES = Object.freeze({ access: 'access', guest: 'guest', recording: 'recording' });

export const signAccessToken = (user) =>
  jwt.sign({ sub: user.id, email: user.email, typ: TOKEN_TYPES.access, ver: user.tokenVersion ?? 0 }, config.jwt.secret, { expiresIn: config.jwt.expiresIn });

/** Any valid token; check `typ` with `isAccessToken` (or the purpose-specific helpers) before trusting it. */
export const verifyAccessToken = (token) => jwt.verify(token, config.jwt.secret);

/** Sign-in tokens issued before tokens had a type count as sign-in tokens. */
export const isAccessToken = (payload) => payload?.typ === TOKEN_TYPES.access || payload?.typ === undefined;

/** Whether a sign-in token was issued before the account's latest password change. */
export const isRevoked = (payload, user) => (payload.ver ?? 0) !== (user.tokenVersion ?? 0);

/** A pass for someone outside the organization to join one meeting's call; it opens nothing else. */
export const signGuestToken = ({ meetingId, guestId, name }) =>
  jwt.sign({ typ: TOKEN_TYPES.guest, mid: meetingId, gid: guestId, name }, config.jwt.secret, { expiresIn: '12h' });

/** A short-lived link to one call recording (video players cannot send a sign-in header). */
export const signRecordingToken = (recordingId) => jwt.sign({ typ: TOKEN_TYPES.recording, rid: recordingId }, config.jwt.secret, { expiresIn: '6h' });

/** One-time tokens (invites, password resets): the raw value is emailed, only the hash is stored. */
export const createOneTimeToken = () => {
  const raw = crypto.randomBytes(32).toString('hex');
  return { raw, hash: hashOneTimeToken(raw) };
};

export const hashOneTimeToken = (raw) => crypto.createHash('sha256').update(String(raw)).digest('hex');

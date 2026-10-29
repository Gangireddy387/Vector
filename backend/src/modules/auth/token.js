import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from '../../config/index.js';

export const signAccessToken = (user) =>
  jwt.sign({ sub: user.id, email: user.email }, config.jwt.secret, { expiresIn: config.jwt.expiresIn });

export const verifyAccessToken = (token) => jwt.verify(token, config.jwt.secret);

/** A pass for someone outside the organization to join one meeting's call; it opens nothing else. */
export const signGuestToken = ({ meetingId, guestId, name }) =>
  jwt.sign({ typ: 'guest', mid: meetingId, gid: guestId, name }, config.jwt.secret, { expiresIn: '12h' });

/** One-time tokens (invites, password resets): the raw value is emailed, only the hash is stored. */
export const createOneTimeToken = () => {
  const raw = crypto.randomBytes(32).toString('hex');
  return { raw, hash: hashOneTimeToken(raw) };
};

export const hashOneTimeToken = (raw) => crypto.createHash('sha256').update(String(raw)).digest('hex');

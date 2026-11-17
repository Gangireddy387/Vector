import crypto from 'node:crypto';
import { Op } from 'sequelize';
import { ApiToken, User } from '../../database/models.js';
import { ApiError } from '../../shared/errors/api-error.js';

const PREFIX = 'vtk_';
const hashToken = (raw) => crypto.createHash('sha256').update(raw).digest('hex');

const toPublic = (row) => ({
  id: row.id,
  name: row.name,
  prefix: row.prefix,
  lastUsedAt: row.lastUsedAt,
  expiresAt: row.expiresAt,
  createdAt: row.createdAt,
});

export async function listApiTokens(userId) {
  const rows = await ApiToken.findAll({ where: { userId }, order: [['createdAt', 'DESC']] });
  return { tokens: rows.map(toPublic) };
}

/** Creates a token; `token` is returned once and never stored in plaintext. */
export async function createApiToken(userId, { name, expiresInDays }) {
  const label = String(name ?? '').trim().slice(0, 80);
  if (label.length < 2) throw ApiError.badRequest('Name must be at least 2 characters', [{ path: 'name', message: 'Name must be at least 2 characters' }]);
  const count = await ApiToken.count({ where: { userId } });
  if (count >= 20) throw ApiError.badRequest('You can have at most 20 API tokens');

  const secret = crypto.randomBytes(24).toString('base64url');
  const raw = `${PREFIX}${secret}`;
  const expiresAt =
    expiresInDays == null
      ? null
      : new Date(Date.now() + Math.min(Math.max(Number(expiresInDays) || 0, 1), 365) * 24 * 60 * 60 * 1000);

  const row = await ApiToken.create({
    userId,
    name: label,
    prefix: raw.slice(0, 12),
    tokenHash: hashToken(raw),
    expiresAt,
  });
  return { token: raw, ...toPublic(row) };
}

export async function revokeApiToken(userId, tokenId) {
  const deleted = await ApiToken.destroy({ where: { id: tokenId, userId } });
  if (!deleted) throw ApiError.notFound('Token not found');
  return { deleted: true };
}

/**
 * Resolves a personal access token to an active user, or null if invalid/expired.
 * Updates lastUsedAt at most once a minute.
 */
export async function resolveApiToken(raw) {
  if (!raw?.startsWith(PREFIX) || raw.length < 20) return null;
  const row = await ApiToken.findOne({
    where: {
      tokenHash: hashToken(raw),
      [Op.or]: [{ expiresAt: null }, { expiresAt: { [Op.gt]: new Date() } }],
    },
  });
  if (!row) return null;
  const user = await User.findByPk(row.userId);
  if (!user || user.status !== 'active') return null;
  if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > 60_000) {
    row.lastUsedAt = new Date();
    void row.save({ silent: true }).catch(() => undefined);
  }
  return user;
}

import { Op } from 'sequelize';
import { OrganizationMember, User, WorkspaceAuditLog } from '../../database/models.js';
import { USER_SUMMARY_ATTRIBUTES } from '../users/user.model.js';

/**
 * Records an organization-admin action for the Activity / Audit tab.
 * Failures are swallowed so auditing never blocks the primary action.
 */
export async function logWorkspaceAction({ organizationId, actorId, action, targetType = null, targetId = null, meta = null }) {
  if (!organizationId || !action) return null;
  try {
    return await WorkspaceAuditLog.create({
      organizationId,
      actorId: actorId ?? null,
      action,
      targetType,
      targetId: targetId != null ? String(targetId) : null,
      meta,
    });
  } catch (error) {
    console.warn('[workspace-audit] failed to log:', error.message);
    return null;
  }
}

/** IP + user-agent from an Express request for sign-in / security rows (no secrets). */
export function requestAuditMeta(req) {
  if (!req) return {};
  const forwarded = req.headers?.['x-forwarded-for'];
  const ip =
    (typeof forwarded === 'string' ? forwarded.split(',')[0]?.trim() : null) ||
    req.ip ||
    req.socket?.remoteAddress ||
    null;
  const userAgent = typeof req.get === 'function' ? req.get('user-agent') : req.headers?.['user-agent'];
  return {
    ip: ip ? String(ip).slice(0, 80) : null,
    userAgent: userAgent ? String(userAgent).slice(0, 200) : null,
  };
}

/**
 * Writes the same auth/security event into every organization the person is an active member of
 * (so each workspace’s Activity tab sees their SSO / session history).
 */
export async function logAuthForUser(userId, { action, meta = null } = {}) {
  if (!userId || !action) return;
  try {
    const memberships = await OrganizationMember.findAll({
      where: { userId, status: 'active' },
      attributes: ['organizationId'],
      raw: true,
    });
    await Promise.all(
      memberships.map((membership) =>
        logWorkspaceAction({
          organizationId: membership.organizationId,
          actorId: userId,
          action,
          targetType: 'user',
          targetId: userId,
          meta,
        }),
      ),
    );
  } catch (error) {
    console.warn('[workspace-audit] auth log failed:', error.message);
  }
}

function categoryWhere(category) {
  if (category === 'auth') return { action: { [Op.like]: 'auth.%' } };
  if (category === 'admin') return { action: { [Op.notLike]: 'auth.%' } };
  return {};
}

/** Cursor pagination: `before` is an ISO timestamp; returns newer-first entries. */
export async function listAuditLog(organizationId, { limit = 50, before, category } = {}) {
  const where = { organizationId, ...categoryWhere(category) };
  if (before) {
    const cursor = new Date(before);
    if (!Number.isNaN(cursor.getTime())) where.createdAt = { [Op.lt]: cursor };
  }
  const rows = await WorkspaceAuditLog.findAll({
    where,
    include: [{ model: User, as: 'actor', attributes: USER_SUMMARY_ATTRIBUTES, required: false }],
    order: [['createdAt', 'DESC'], ['id', 'DESC']],
    limit: Math.min(Math.max(Number(limit) || 50, 1), 100),
  });
  return {
    entries: rows.map((row) => ({
      id: row.id,
      action: row.action,
      targetType: row.targetType,
      targetId: row.targetId,
      meta: row.meta,
      createdAt: row.createdAt,
      actor: row.actor ?? null,
    })),
  };
}

/** CSV of recent admin / sign-in actions for download (up to 5 000 rows). */
export async function exportAuditLogCsv(organizationId, { category } = {}) {
  const rows = await WorkspaceAuditLog.findAll({
    where: { organizationId, ...categoryWhere(category) },
    include: [{ model: User, as: 'actor', attributes: USER_SUMMARY_ATTRIBUTES, required: false }],
    order: [
      ['createdAt', 'DESC'],
      ['id', 'DESC'],
    ],
    limit: 5000,
  });
  const escape = (value) => {
    const text = value == null ? '' : String(value);
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const header = ['at', 'actor', 'action', 'targetType', 'targetId', 'meta'];
  const lines = [
    header.join(','),
    ...rows.map((row) =>
      [row.createdAt?.toISOString?.() ?? row.createdAt, row.actor?.email ?? row.actor?.name ?? '', row.action, row.targetType ?? '', row.targetId ?? '', row.meta ? JSON.stringify(row.meta) : '']
        .map(escape)
        .join(','),
    ),
  ];
  return lines.join('\n');
}

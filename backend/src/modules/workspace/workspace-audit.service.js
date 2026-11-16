import { Op } from 'sequelize';
import { User, WorkspaceAuditLog } from '../../database/models.js';
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

/** Cursor pagination: `before` is an ISO timestamp; returns newer-first entries. */
export async function listAuditLog(organizationId, { limit = 50, before } = {}) {
  const where = { organizationId };
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

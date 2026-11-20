import { Op } from 'sequelize';
import { Organization, OrganizationMember, User, WorkspaceAuditLog } from '../../database/models.js';
import { USER_SUMMARY_ATTRIBUTES } from '../users/user.model.js';

/**
 * Records an organization-admin action for the Activity / Audit tab.
 * Failures are swallowed so auditing never blocks the primary action.
 */
export async function logWorkspaceAction({ organizationId, actorId, action, targetType = null, targetId = null, meta = null }) {
  if (!organizationId || !action) return null;
  try {
    const row = await WorkspaceAuditLog.create({
      organizationId,
      actorId: actorId ?? null,
      action,
      targetType,
      targetId: targetId != null ? String(targetId) : null,
      meta,
    });
    void emitAuditWebhook(row, actorId).catch((error) => {
      console.warn('[workspace-audit] webhook emit failed:', error.message);
    });
    return row;
  } catch (error) {
    console.warn('[workspace-audit] failed to log:', error.message);
    return null;
  }
}

async function emitAuditWebhook(row, actorId) {
  const { deliverOrganizationEvent } = await import('../webhooks/webhook.service.js');
  const organization = await Organization.findByPk(row.organizationId, { attributes: ['id', 'slug', 'name'] });
  const actor = row.actorId
    ? await User.findByPk(row.actorId, { attributes: USER_SUMMARY_ATTRIBUTES })
    : null;
  const event = serializeAuditEvent(
    {
      id: row.id,
      action: row.action,
      targetType: row.targetType,
      targetId: row.targetId,
      meta: row.meta,
      createdAt: row.createdAt,
      actor,
    },
    organization,
  );
  await deliverOrganizationEvent(row.organizationId, 'workspace.audit.created', event.data, {
    actorId: actorId ?? row.actorId ?? null,
  });
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

function timeWindow({ before, since, until }) {
  const createdAt = {};
  if (before) {
    const cursor = new Date(before);
    if (!Number.isNaN(cursor.getTime())) createdAt[Op.lt] = cursor;
  }
  if (since) {
    const start = new Date(since);
    if (!Number.isNaN(start.getTime())) createdAt[Op.gte] = start;
  }
  if (until) {
    const end = new Date(until);
    if (!Number.isNaN(end.getTime())) createdAt[Op.lte] = end;
  }
  return Object.keys(createdAt).length ? { createdAt } : {};
}

function toEntry(row) {
  return {
    id: row.id,
    action: row.action,
    targetType: row.targetType,
    targetId: row.targetId,
    meta: row.meta,
    createdAt: row.createdAt,
    actor: row.actor ?? null,
  };
}

/** Stable CloudEvents-style envelope for SIEM / JSONL export. */
export function serializeAuditEvent(entry, organization = null) {
  const meta = entry.meta && typeof entry.meta === 'object' ? entry.meta : {};
  const time = entry.createdAt?.toISOString?.() ?? entry.createdAt;
  return {
    specversion: '1.0',
    type: 'vector.workspace.audit',
    source: 'vector',
    id: entry.id,
    time,
    datacontenttype: 'application/json',
    data: {
      organizationId: organization?.id ?? null,
      organizationSlug: organization?.slug ?? null,
      organizationName: organization?.name ?? null,
      category: String(entry.action || '').startsWith('auth.') ? 'auth' : 'admin',
      action: entry.action,
      actor: entry.actor
        ? { id: entry.actor.id, email: entry.actor.email ?? null, name: entry.actor.name ?? null }
        : null,
      target: {
        type: entry.targetType ?? null,
        id: entry.targetId ?? null,
      },
      meta,
      client: {
        ip: meta.ip ?? null,
        userAgent: meta.userAgent ?? null,
      },
    },
  };
}

async function fetchAuditRows(organizationId, { category, before, since, until, limit = 5000 } = {}) {
  return WorkspaceAuditLog.findAll({
    where: {
      organizationId,
      ...categoryWhere(category),
      ...timeWindow({ before, since, until }),
    },
    include: [{ model: User, as: 'actor', attributes: USER_SUMMARY_ATTRIBUTES, required: false }],
    order: [
      ['createdAt', 'DESC'],
      ['id', 'DESC'],
    ],
    limit: Math.min(Math.max(Number(limit) || 5000, 1), 10_000),
  });
}

/** Cursor pagination: `before` is an ISO timestamp; returns newer-first entries. */
export async function listAuditLog(organizationId, { limit = 50, before, since, category } = {}) {
  const rows = await fetchAuditRows(organizationId, {
    category,
    before,
    since,
    limit: Math.min(Math.max(Number(limit) || 50, 1), 100),
  });
  return { entries: rows.map(toEntry) };
}

/** CSV of recent admin / sign-in actions for download. */
export async function exportAuditLogCsv(organizationId, { category, since, until } = {}) {
  const rows = await fetchAuditRows(organizationId, { category, since, until, limit: 5000 });
  const escape = (value) => {
    const text = value == null ? '' : String(value);
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const header = ['at', 'actor', 'action', 'targetType', 'targetId', 'meta'];
  const lines = [
    header.join(','),
    ...rows.map((row) =>
      [
        row.createdAt?.toISOString?.() ?? row.createdAt,
        row.actor?.email ?? row.actor?.name ?? '',
        row.action,
        row.targetType ?? '',
        row.targetId ?? '',
        row.meta ? JSON.stringify(row.meta) : '',
      ]
        .map(escape)
        .join(','),
    ),
  ];
  return lines.join('\n');
}

/** NDJSON / JSONL for Splunk, Datadog, Elastic, etc. */
export async function exportAuditLogJsonl(organizationId, { category, since, until } = {}) {
  const organization = await Organization.findByPk(organizationId, { attributes: ['id', 'slug', 'name'] });
  const rows = await fetchAuditRows(organizationId, { category, since, until, limit: 10_000 });
  return rows.map((row) => JSON.stringify(serializeAuditEvent(toEntry(row), organization))).join('\n');
}

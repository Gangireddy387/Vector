import { Issue, Project, WorkTimer } from '../../database/models.js';
import { ApiError } from '../../shared/errors/api-error.js';
import { currentOrganizationId } from '../../shared/context/request-context.js';
import { createWorkLog } from './worklog.service.js';

/** Elapsed whole minutes (at least 1 when stopping a started timer). */
export function elapsedMinutes(startedAt, endedAt = new Date()) {
  const start = startedAt instanceof Date ? startedAt : new Date(startedAt);
  const end = endedAt instanceof Date ? endedAt : new Date(endedAt);
  const ms = Math.max(0, end.getTime() - start.getTime());
  return Math.max(1, Math.ceil(ms / 60_000));
}

const issueInclude = [
  {
    model: Issue,
    as: 'issue',
    attributes: ['id', 'key', 'title', 'projectId'],
    include: [{ model: Project, as: 'project', attributes: ['id', 'key', 'name', 'color'] }],
  },
];

function serializeTimer(timer) {
  if (!timer) return null;
  const json = typeof timer.toJSON === 'function' ? timer.toJSON() : timer;
  return {
    id: json.id,
    issueId: json.issueId,
    startedAt: json.startedAt,
    note: json.note ?? null,
    elapsedMinutes: elapsedMinutes(json.startedAt),
    issue: json.issue
      ? {
          id: json.issue.id,
          key: json.issue.key,
          title: json.issue.title,
          projectId: json.issue.projectId,
          project: json.issue.project ?? null,
        }
      : null,
  };
}

async function findActive(userId) {
  return WorkTimer.findOne({
    where: { userId },
    include: issueInclude,
  });
}

export async function getActiveTimer(userId) {
  const timer = await findActive(userId);
  return { timer: serializeTimer(timer) };
}

/**
 * Starts a timer on `issue`. If another timer is running, it is stopped into a worklog first.
 * @returns {{ timer, stopped: { workLog, issueKey }|null }}
 */
export async function startTimer(issue, user, { note = null } = {}) {
  const organizationId = currentOrganizationId();
  if (!organizationId) throw ApiError.badRequest('Organization required');
  if (issue.project?.organizationId && issue.project.organizationId !== organizationId) {
    throw ApiError.forbidden('Issue is outside the current organization');
  }

  let stopped = null;
  const existing = await WorkTimer.findOne({
    where: { userId: user.id },
    include: [{ model: Issue, as: 'issue', include: [{ model: Project, as: 'project' }] }],
  });
  if (existing) {
    if (existing.issueId === issue.id) {
      return { timer: serializeTimer(await findActive(user.id)), stopped: null };
    }
    stopped = await stopTimerInternal(existing, user, { note: existing.note });
  }

  const timer = await WorkTimer.create({
    userId: user.id,
    organizationId,
    issueId: issue.id,
    startedAt: new Date(),
    note: note ? String(note).trim().slice(0, 500) || null : null,
  });
  const loaded = await WorkTimer.findByPk(timer.id, { include: issueInclude });
  return { timer: serializeTimer(loaded), stopped };
}

async function stopTimerInternal(timer, user, { note } = {}) {
  const issue =
    timer.issue ??
    (await Issue.findByPk(timer.issueId, {
      include: [{ model: Project, as: 'project', attributes: ['id', 'key', 'name', 'organizationId'] }],
    }));
  if (!issue) {
    await timer.destroy();
    throw ApiError.notFound('Timed issue no longer exists');
  }

  const minutes = elapsedMinutes(timer.startedAt);
  const finalNote =
    note !== undefined && note !== null
      ? String(note).trim().slice(0, 500) || null
      : timer.note ?? null;

  const workLog = await createWorkLog(issue, user, { minutes, note: finalNote, loggedAt: new Date() });
  await timer.destroy();
  return { workLog, issueKey: issue.key, minutes };
}

export async function stopTimer(user, { note } = {}) {
  const timer = await WorkTimer.findOne({
    where: { userId: user.id },
    include: [{ model: Issue, as: 'issue', include: [{ model: Project, as: 'project' }] }],
  });
  if (!timer) throw ApiError.badRequest('No timer is running');
  const stopped = await stopTimerInternal(timer, user, { note });
  return { timer: null, ...stopped };
}

export async function discardTimer(userId) {
  const timer = await WorkTimer.findOne({ where: { userId } });
  if (!timer) return { timer: null };
  await timer.destroy();
  return { timer: null };
}

import { Op } from 'sequelize';
import {
  Activity,
  Meeting,
  MeetingRecording,
  MeetingSearchChunk,
  MeetingTranscriptLine,
  Notification,
  Organization,
  Project,
  WorkspaceAuditLog,
} from '../../database/models.js';
import { deleteStoredFile } from '../attachments/attachment.storage.js';

/** Days; `0` means keep forever (current default behaviour). */
export const RETENTION_DEFAULTS = {
  auditLogDays: 0,
  activityDays: 0,
  notificationDays: 0,
  transcriptDays: 0,
  recordingDays: 0,
};

const MAX_DAYS = 3650;
const KEYS = Object.keys(RETENTION_DEFAULTS);

const toDays = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(Math.floor(n), MAX_DAYS);
};

export function normalizeRetention(raw = {}) {
  const next = { ...RETENTION_DEFAULTS };
  for (const key of KEYS) {
    if (raw[key] != null) next[key] = toDays(raw[key]);
  }
  return next;
}

export function publicRetention(organization) {
  return normalizeRetention(organization?.retention ?? {});
}

const cutoff = (days) => new Date(Date.now() - days * 24 * 60 * 60_000);

async function projectIdsFor(organizationId) {
  const rows = await Project.findAll({ where: { organizationId }, attributes: ['id'], raw: true });
  return rows.map((row) => row.id);
}

async function purgeAudit(organizationId, days) {
  if (!days) return 0;
  return WorkspaceAuditLog.destroy({ where: { organizationId, createdAt: { [Op.lt]: cutoff(days) } } });
}

async function purgeActivity(organizationId, days) {
  if (!days) return 0;
  const projectIds = await projectIdsFor(organizationId);
  if (!projectIds.length) return 0;
  return Activity.destroy({ where: { projectId: { [Op.in]: projectIds }, createdAt: { [Op.lt]: cutoff(days) } } });
}

async function purgeNotifications(organizationId, days) {
  if (!days) return 0;
  const projectIds = await projectIdsFor(organizationId);
  if (!projectIds.length) return 0;
  return Notification.destroy({ where: { projectId: { [Op.in]: projectIds }, createdAt: { [Op.lt]: cutoff(days) } } });
}

async function purgeTranscripts(organizationId, days) {
  if (!days) return 0;
  const meetings = await Meeting.findAll({ where: { organizationId }, attributes: ['id'], raw: true });
  const meetingIds = meetings.map((row) => row.id);
  if (!meetingIds.length) return 0;
  const before = cutoff(days);
  const removed = await MeetingTranscriptLine.destroy({
    where: { meetingId: { [Op.in]: meetingIds }, spokenAt: { [Op.lt]: before } },
  });
  await MeetingSearchChunk.destroy({
    where: { meetingId: { [Op.in]: meetingIds }, kind: 'transcript', at: { [Op.lt]: before } },
  });
  return removed;
}

async function purgeRecordings(organizationId, days) {
  if (!days) return 0;
  const meetings = await Meeting.findAll({ where: { organizationId }, attributes: ['id'], raw: true });
  const meetingIds = meetings.map((row) => row.id);
  if (!meetingIds.length) return 0;
  const rows = await MeetingRecording.findAll({
    where: { meetingId: { [Op.in]: meetingIds }, createdAt: { [Op.lt]: cutoff(days) } },
  });
  for (const recording of rows) {
    const key = recording.storageKey;
    await recording.destroy();
    if (key) await deleteStoredFile(key).catch(() => undefined);
  }
  return rows.length;
}

/** Applies one organization's retention policy. Returns counts per bucket. */
export async function purgeOrganizationRetention(organization) {
  const retention = publicRetention(organization);
  const counts = {
    audit: await purgeAudit(organization.id, retention.auditLogDays),
    activity: await purgeActivity(organization.id, retention.activityDays),
    notifications: await purgeNotifications(organization.id, retention.notificationDays),
    transcripts: await purgeTranscripts(organization.id, retention.transcriptDays),
    recordings: await purgeRecordings(organization.id, retention.recordingDays),
  };
  return counts;
}

/** Nightly job: purge expired data for every organization that set a retention period. */
export async function runDataRetention() {
  const organizations = await Organization.findAll({ attributes: ['id', 'retention'] });
  let touched = 0;
  for (const organization of organizations) {
    const retention = publicRetention(organization);
    if (!KEYS.some((key) => retention[key] > 0)) continue;
    const counts = await purgeOrganizationRetention(organization);
    if (Object.values(counts).some((n) => n > 0)) touched += 1;
  }
  return touched;
}

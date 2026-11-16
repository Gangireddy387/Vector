import { Op } from 'sequelize';
import { Project, ProjectMember, StandupUpdate, User } from '../../database/models.js';
import { localDateTime } from '../../shared/utils/timezone.js';
import { notifyUsers } from '../notifications/notification.service.js';
import { projectHasFeature } from '../plans/plan.service.js';
import { DEFAULT_PROJECT_SETTINGS } from '../projects/project.model.js';
import { pushToUsers } from '../push/push.service.js';
import { USER_SUMMARY_ATTRIBUTES } from '../users/user.model.js';

const settingsOf = (project) => ({ ...DEFAULT_PROJECT_SETTINGS, ...(project.settings ?? {}) });

/**
 * Hourly: at each project's standupDigestHour in a manager's zone, send one rollup
 * (who posted, who is missing, blockers) to project admins and the project lead.
 */
export async function sendStandupDigests(now = new Date()) {
  const projects = await Project.findAll({
    where: { archivedAt: null },
    attributes: ['id', 'name', 'organizationId', 'leadId', 'settings'],
  });
  let sent = 0;

  for (const project of projects) {
    const settings = settingsOf(project);
    if (!settings.standupEnabled) continue;
    if (!(await projectHasFeature(project.id, 'chat'))) continue;

    const digestHour = Number(settings.standupDigestHour);
    const admins = await ProjectMember.findAll({
      where: { projectId: project.id, role: 'admin' },
      include: [{ model: User, as: 'user', attributes: [...USER_SUMMARY_ATTRIBUTES, 'timezone', 'preferences', 'status'] }],
    });
    const recipients = new Map();
    for (const row of admins) {
      if (row.user?.status === 'active') recipients.set(row.user.id, row.user);
    }
    if (project.leadId && !recipients.has(project.leadId)) {
      const lead = await User.findOne({
        where: { id: project.leadId, status: 'active' },
        attributes: [...USER_SUMMARY_ATTRIBUTES, 'timezone', 'preferences'],
      });
      if (lead) recipients.set(lead.id, lead);
    }
    if (!recipients.size) continue;

    for (const manager of recipients.values()) {
      const local = localDateTime(manager.timezone, now);
      if (local.hour !== digestHour) continue;
      const weekday = new Date(`${local.date}T12:00:00Z`).getUTCDay();
      if (weekday === 0 || weekday === 6) continue;
      const today = local.date;
      const preferences = manager.preferences ?? {};
      const digested = { ...(preferences.standupDigested ?? {}) };
      if (digested[project.id] === today) continue;

      const [members, updates] = await Promise.all([
        ProjectMember.findAll({
          where: { projectId: project.id, role: { [Op.ne]: 'viewer' } },
          include: [{ model: User, as: 'user', attributes: [...USER_SUMMARY_ATTRIBUTES, 'status'] }],
        }),
        StandupUpdate.findAll({
          where: { projectId: project.id, date: today },
          include: [{ model: User, as: 'user', attributes: USER_SUMMARY_ATTRIBUTES }],
        }),
      ]);
      const active = members.filter((row) => row.user && row.user.status !== 'disabled');
      const postedIds = new Set(updates.map((row) => row.userId));
      const missing = active.filter((row) => !postedIds.has(row.userId)).map((row) => row.user.name);
      const blockers = updates.filter((row) => (row.blockers ?? '').trim());

      digested[project.id] = today;
      await manager.update({ preferences: { ...preferences, standupDigested: digested } });

      const parts = [`${postedIds.size}/${active.length} posted`];
      if (missing.length) parts.push(`${missing.length} missing: ${missing.slice(0, 4).join(', ')}${missing.length > 4 ? '…' : ''}`);
      if (blockers.length) parts.push(`${blockers.length} blocker${blockers.length === 1 ? '' : 's'}`);
      const title = `Standup digest · ${project.name}`;
      const body = parts.join(' · ');
      const link = `/projects/${project.id}/standup?date=${today}`;

      await notifyUsers({
        userIds: [manager.id],
        type: 'standup_digest',
        title,
        body,
        link,
        projectId: project.id,
        email: false,
      });
      await pushToUsers(
        [manager.id],
        { kind: 'standup_digest', title, body, url: link, tag: `standup-digest-${project.id}-${today}` },
        { ttlSeconds: 60 * 60 * 12 },
      );
      sent += 1;
    }
  }
  return sent;
}

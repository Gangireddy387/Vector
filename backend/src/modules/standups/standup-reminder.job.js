import { Op } from 'sequelize';
import { Project, ProjectMember, StandupUpdate, User } from '../../database/models.js';
import { localDateTime } from '../../shared/utils/timezone.js';
import { notifyUsers } from '../notifications/notification.service.js';
import { projectHasFeature } from '../plans/plan.service.js';
import { DEFAULT_PROJECT_SETTINGS } from '../projects/project.model.js';
import { pushToUsers } from '../push/push.service.js';

const settingsOf = (project) => ({ ...DEFAULT_PROJECT_SETTINGS, ...(project.settings ?? {}) });

/**
 * Hourly: for each person, at each project's standupReminderHour in their own zone,
 * nudge once per project-day if they have not posted. Deduped via preferences.standupReminded.
 */
export async function sendStandupReminders(now = new Date()) {
  const users = await User.findAll({ where: { status: 'active' }, attributes: ['id', 'name', 'timezone', 'preferences'] });
  let sent = 0;

  for (const user of users) {
    const local = localDateTime(user.timezone, now);
    const weekday = new Date(`${local.date}T12:00:00Z`).getUTCDay();
    if (weekday === 0 || weekday === 6) continue;
    const today = local.date;
    const preferences = user.preferences ?? {};
    const reminded = { ...(preferences.standupReminded ?? {}) };
    // Migrate the old single-date flag so people are not re-nudged the same day after deploy.
    if (preferences.standupRemindedOn === today) continue;

    const memberships = await ProjectMember.findAll({
      where: { userId: user.id, role: { [Op.ne]: 'viewer' } },
      include: [{ model: Project, as: 'project', attributes: ['id', 'name', 'organizationId', 'settings'] }],
    });

    const pending = [];
    for (const membership of memberships) {
      const project = membership.project;
      if (!project || !(await projectHasFeature(project.id, 'chat'))) continue;
      const settings = settingsOf(project);
      if (!settings.standupEnabled) continue;
      if (local.hour !== Number(settings.standupReminderHour)) continue;
      if (reminded[project.id] === today) continue;
      const posted = await StandupUpdate.findOne({ where: { projectId: project.id, userId: user.id, date: today }, attributes: ['id'] });
      if (posted) {
        reminded[project.id] = today;
        continue;
      }
      pending.push(project);
      reminded[project.id] = today;
    }

    if (JSON.stringify(reminded) !== JSON.stringify(preferences.standupReminded ?? {})) {
      await user.update({ preferences: { ...preferences, standupReminded: reminded, standupRemindedOn: undefined } });
    }
    if (!pending.length) continue;

    const first = pending[0];
    const extra = pending.length - 1;
    const title = pending.length === 1 ? `Post today’s standup in ${first.name}` : `Post today’s standup (${pending.length} projects)`;
    const body =
      pending.length === 1
        ? 'Share what you did, what you will do, and any blockers.'
        : `Still needed in ${first.name}${extra ? ` and ${extra} more` : ''}.`;
    const link = `/projects/${first.id}/standup?date=${today}`;

    await notifyUsers({
      userIds: [user.id],
      type: 'standup_reminder',
      title,
      body,
      link,
      projectId: first.id,
      email: false,
    });
    await pushToUsers(
      [user.id],
      { kind: 'standup_reminder', title, body, url: link, tag: `standup-${today}` },
      { ttlSeconds: 60 * 60 * 8 },
    );
    sent += 1;
  }
  return sent;
}

import { OrganizationMember, User } from '../../database/models.js';
import { localDateTime } from '../../shared/utils/timezone.js';
import { standupPendingFor } from '../dashboard/dashboard.service.js';
import { listMyWork } from '../issues/issue.service.js';
import { projectHasFeature } from '../plans/plan.service.js';
import { listProjects } from '../projects/project.service.js';
import { sendEmail } from '../../shared/services/email.service.js';
import { workdayNudgeEmail } from '../../shared/services/email-templates.js';
import { notifyUsers } from './notification.service.js';
import { WORKDAY_NUDGE_DAYS } from './workday-nudge.constants.js';

/** Local hour to nudge on membership day 2 and day 7. */
const NUDGE_HOUR = 10;

/** Whole calendar days between two YYYY-MM-DD dates. */
function daysBetween(from, to) {
  const a = new Date(`${from}T12:00:00Z`).getTime();
  const b = new Date(`${to}T12:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}

/**
 * Day-2 / day-7 workday habit nudges: in-app (+ push) and email when there is still
 * a standup to post or overdue / due-today work. Deduped per milestone via preferences.workdayNudged.
 */
export async function sendWorkdayNudges(now = new Date()) {
  const users = await User.findAll({ where: { status: 'active' }, attributes: ['id', 'name', 'email', 'timezone', 'preferences'] });
  let sent = 0;

  for (const user of users) {
    const local = localDateTime(user.timezone, now);
    if (local.hour !== NUDGE_HOUR) continue;
    const weekday = new Date(`${local.date}T12:00:00Z`).getUTCDay();
    if (weekday === 0 || weekday === 6) continue;

    const membership = await OrganizationMember.findOne({
      where: { userId: user.id, status: 'active' },
      order: [['createdAt', 'ASC']],
      attributes: ['createdAt'],
    });
    if (!membership) continue;

    const joinedOn = localDateTime(user.timezone, membership.createdAt).date;
    const day = daysBetween(joinedOn, local.date);
    if (!WORKDAY_NUDGE_DAYS.includes(day)) continue;

    const preferences = user.preferences ?? {};
    const nudged = { ...(preferences.workdayNudged ?? {}) };
    if (nudged[String(day)] === local.date) continue;

    const projects = await listProjects(user.id, { includeArchived: false });
    const [standupPending, myWork] = await Promise.all([standupPendingFor(user.id, projects), listMyWork(user.id)]);
    const today = local.date;
    const open = myWork.filter((issue) => issue.status.category !== 'done');
    const overdue = open.filter((issue) => issue.dueDate && issue.dueDate < today);
    const dueToday = open.filter((issue) => issue.dueDate === today);

    const reasons = [];
    if (standupPending.length) {
      reasons.push(
        `standup still open in ${standupPending.length === 1 ? standupPending[0].projectName : `${standupPending.length} projects`}`,
      );
    }
    if (overdue.length) reasons.push(`${overdue.length} overdue task${overdue.length === 1 ? '' : 's'}`);
    if (dueToday.length) reasons.push(`${dueToday.length} due today`);

    // Claim the milestone even with nothing to do so we do not re-check every hour.
    await user.update({ preferences: { ...preferences, workdayNudged: { ...nudged, [String(day)]: local.date } } });
    if (!reasons.length) continue;

    const title = day === 2 ? 'Day 2 — Start my day' : 'Day 7 — Keep the workday loop going';
    const body = reasons.join(' · ');
    const firstStandup = standupPending[0];
    const link = firstStandup ? `/projects/${firstStandup.projectId}/standup?date=${firstStandup.date}` : '/?startDay=1';

    await notifyUsers({
      userIds: [user.id],
      type: 'workday_nudge',
      title,
      body,
      link,
      projectId: firstStandup?.projectId ?? null,
      email: false,
    });

    const emailAllowed = firstStandup
      ? await projectHasFeature(firstStandup.projectId, 'emailDigest')
      : (await Promise.all(projects.slice(0, 3).map((project) => projectHasFeature(project.id, 'emailDigest')))).some(Boolean);
    if (emailAllowed && preferences.emailNotifications !== false) {
      await sendEmail({
        to: user.email,
        ...workdayNudgeEmail({
          name: user.name.split(' ')[0],
          day,
          reasons,
          link,
        }),
      }).catch((error) => console.warn(`[jobs] workday-nudge email ${user.id}:`, error.message));
    }

    sent += 1;
  }
  return sent;
}

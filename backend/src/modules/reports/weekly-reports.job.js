import { User } from '../../database/models.js';
import { sendEmail } from '../../shared/services/email.service.js';
import { weeklyReportsEmail } from '../../shared/services/email-templates.js';
import { localDateTime } from '../../shared/utils/timezone.js';
import { getReportOverview } from './report.service.js';

const SEND_HOUR = 8;

/**
 * Runs hourly. On Monday at 08:00 in each user's zone, emails opted-in people a 7-day reports overview.
 * Preference: `user.preferences.weeklyReportsEmail` (Settings → Notifications, or Reports → Email me weekly).
 * Last-sent stamp: `preferences.weeklyReportsSentOn` (YYYY-MM-DD local Monday).
 */
export async function sendWeeklyReports(now = new Date()) {
  const users = await User.findAll({ where: { status: 'active' } });
  let sent = 0;

  for (const user of users.filter((candidate) => candidate.preferences?.weeklyReportsEmail)) {
    const local = localDateTime(user.timezone, now);
    const weekday = new Date(`${local.date}T12:00:00Z`).getUTCDay();
    if (weekday !== 1 || local.hour !== SEND_HOUR) continue;

    const weekKey = local.date;
    if (user.preferences?.weeklyReportsSentOn === weekKey) continue;

    await user.update({ preferences: { ...user.preferences, weeklyReportsSentOn: weekKey } });

    try {
      const overview = await getReportOverview(user.id, { days: 7 });
      if (!overview.projects.length) continue;
      await sendEmail({
        to: user.email,
        ...weeklyReportsEmail({
          name: user.name.split(' ')[0],
          period: overview.period,
          totals: overview.totals,
          byProject: overview.byProject.slice(0, 8),
        }),
      });
      sent += 1;
    } catch (error) {
      console.warn(`[weekly-reports] failed for ${user.id}:`, error.message);
    }
  }
  return sent;
}

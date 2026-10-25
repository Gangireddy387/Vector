import { User } from '../../database/models.js';
import { sendEmail } from '../../shared/services/email.service.js';
import { dailyDigestEmail } from '../../shared/services/email-templates.js';
import { addDaysToDate, localDateTime } from '../../shared/utils/timezone.js';
import { listMyWork } from '../issues/issue.service.js';

const DIGEST_HOUR = 8;

/**
 * Runs hourly and emails each opted-in user at 8:00 in *their* time zone a short list of
 * overdue, due-today and upcoming work. "Today" is also the user's local date.
 */
export async function sendDailyDigests(now = new Date()) {
  const users = await User.findAll({ where: { status: 'active' } });
  let sent = 0;

  for (const user of users.filter((candidate) => candidate.preferences?.dailyDigest)) {
    const local = localDateTime(user.timezone, now);
    if (local.hour !== DIGEST_HOUR) continue;

    const today = local.date;
    const weekEnd = addDaysToDate(today, 7);
    const open = (await listMyWork(user.id)).filter((issue) => issue.status.category !== 'done');
    const sections = [
      { title: 'Overdue', issues: open.filter((issue) => issue.dueDate && issue.dueDate < today) },
      { title: 'Due today', issues: open.filter((issue) => issue.dueDate === today) },
      { title: 'Due this week', issues: open.filter((issue) => issue.dueDate > today && issue.dueDate <= weekEnd) },
      { title: 'In progress', issues: open.filter((issue) => issue.status.category === 'in_progress' && !issue.dueDate) },
    ];
    if (!sections.some((section) => section.issues.length)) continue;
    await sendEmail({ to: user.email, ...dailyDigestEmail({ name: user.name.split(' ')[0], sections }) });
    sent += 1;
  }
  return sent;
}

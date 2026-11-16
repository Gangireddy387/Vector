import { Op } from 'sequelize';
import { Notification, OrganizationMember } from '../../database/models.js';
import { WORKDAY_NUDGE_DAYS } from './workday-nudge.constants.js';

/**
 * Day-2 / day-7 workday nudge open rates for an organization.
 * Open ≈ in-app notification marked read (`readAt`). Email opens are not tracked.
 */
export async function getWorkdayNudgeStats(organizationId) {
  const members = await OrganizationMember.findAll({
    where: { organizationId, status: 'active' },
    attributes: ['userId'],
    raw: true,
  });
  const userIds = members.map((member) => member.userId);
  if (!userIds.length) {
    return emptyStats();
  }

  const rows = await Notification.findAll({
    where: { type: 'workday_nudge', userId: { [Op.in]: userIds } },
    attributes: ['title', 'readAt', 'createdAt'],
    raw: true,
  });

  const byDay = Object.fromEntries(WORKDAY_NUDGE_DAYS.map((day) => [String(day), { sent: 0, opened: 0, openRate: 0 }]));

  for (const row of rows) {
    const day = dayFromTitle(row.title);
    const bucket = day != null ? byDay[String(day)] : null;
    if (bucket) {
      bucket.sent += 1;
      if (row.readAt) bucket.opened += 1;
    }
  }

  for (const bucket of Object.values(byDay)) {
    bucket.openRate = rate(bucket.opened, bucket.sent);
  }

  const sent = rows.length;
  const opened = rows.filter((row) => row.readAt).length;
  return {
    sent,
    opened,
    openRate: rate(opened, sent),
    byDay,
  };
}

function emptyStats() {
  return {
    sent: 0,
    opened: 0,
    openRate: 0,
    byDay: Object.fromEntries(WORKDAY_NUDGE_DAYS.map((day) => [String(day), { sent: 0, opened: 0, openRate: 0 }])),
  };
}

function dayFromTitle(title) {
  if (typeof title !== 'string') return null;
  if (title.startsWith('Day 2')) return 2;
  if (title.startsWith('Day 7')) return 7;
  return null;
}

function rate(opened, sent) {
  if (!sent) return 0;
  return Math.round((opened / sent) * 1000) / 10;
}

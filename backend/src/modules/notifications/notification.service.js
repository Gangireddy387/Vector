import { Op } from 'sequelize';
import { Notification, User } from '../../database/models.js';
import { ApiError } from '../../shared/errors/api-error.js';
import { emitToUser } from '../../shared/realtime/socket.js';
import { sendEmail } from '../../shared/services/email.service.js';
import { notificationEmail } from '../../shared/services/email-templates.js';
import { projectHasFeature } from '../plans/plan.service.js';
import { projectRoleOf } from '../projects/project-access.js';
import { pushToUsers } from '../push/push.service.js';
import { USER_SUMMARY_ATTRIBUTES } from '../users/user.model.js';

/** Which plan switch allows the email copy of a notification; everything else counts as a work notification. */
const EMAIL_FEATURE_BY_TYPE = { due_soon: 'emailReminders' };

/** Types that also ring a device push when Vector is closed (DMs, mentions, standups, blockers). */
const PUSH_TYPES = new Set([
  'chat_mention',
  'channel_reply',
  'direct_message',
  'standup_reminder',
  'standup_digest',
  'standup_blocker',
  'due_soon',
  'workday_nudge',
]);

/**
 * Creates in-app notifications (pushed live over websockets) and mirrors them by email
 * for recipients who opted in. The actor never notifies themselves.
 */
export async function notifyUsers({ userIds, actorId = null, type, title, body = null, link = null, issueId = null, projectId = null, email = true }) {
  let recipients = [...new Set(userIds.filter(Boolean))].filter((userId) => userId !== actorId);
  // About a project: only people who can still open it (removed or deactivated people stop hearing about its work).
  if (projectId && recipients.length) {
    const allowed = await Promise.all(recipients.map(async (userId) => Boolean(await projectRoleOf(projectId, userId))));
    recipients = recipients.filter((_userId, index) => allowed[index]);
  }
  if (!recipients.length) return [];

  const notifications = await Notification.bulkCreate(
    recipients.map((userId) => ({ userId, actorId, type, title, body, link, issueId, projectId })),
  );
  notifications.forEach((notification) => emitToUser(notification.userId, 'notification:created', notification.toJSON()));

  if (PUSH_TYPES.has(type)) {
    await pushToUsers(
      recipients,
      { kind: type, title, body: body ?? '', url: link ?? '/', tag: `${type}-${notifications[0]?.id ?? Date.now()}` },
      { ttlSeconds: 60 * 60 * 12 },
    ).catch((error) => console.warn(`[push] notifyUsers ${type}:`, error.message));
  }

  if (email && (!projectId || (await projectHasFeature(projectId, EMAIL_FEATURE_BY_TYPE[type] ?? 'emailNotifications')))) {
    const users = await User.findAll({ where: { id: recipients, status: 'active' } });
    await Promise.all(
      users
        .filter((user) => user.preferences?.emailNotifications !== false)
        .map((user) => sendEmail({ to: user.email, ...notificationEmail({ title, body, link }) })),
    );
  }
  return notifications;
}

export async function listNotifications(userId, { unreadOnly, limit }) {
  const where = { userId };
  if (unreadOnly) where.readAt = null;
  return Notification.findAll({
    where,
    include: [{ model: User, as: 'actor', attributes: USER_SUMMARY_ATTRIBUTES }],
    order: [['createdAt', 'DESC']],
    limit,
  });
}

export const countUnread = (userId) => Notification.count({ where: { userId, readAt: null } });

/**
 * Marks a notification read. Pass `{ clicked: true }` when the person opens/navigates it
 * (bell Open, inbox link, toast). Mark-all-read must never set clickedAt.
 */
export async function markRead(userId, notificationId, { clicked = false } = {}) {
  const notification = await Notification.findOne({ where: { id: notificationId, userId } });
  if (!notification) throw ApiError.notFound('Notification not found');
  const patch = {};
  if (!notification.readAt) patch.readAt = new Date();
  if (clicked && !notification.clickedAt) patch.clickedAt = new Date();
  if (Object.keys(patch).length) {
    await notification.update(patch);
    if (clicked && notification.type === 'workday_nudge') {
      console.info(`[nudge] clicked workday_nudge ${notification.id} user=${userId}`);
    }
  }
  return notification;
}

export const markAllRead = (userId) =>
  Notification.update({ readAt: new Date() }, { where: { userId, readAt: { [Op.is]: null } } });

export async function removeNotification(userId, notificationId) {
  const deleted = await Notification.destroy({ where: { id: notificationId, userId } });
  if (!deleted) throw ApiError.notFound('Notification not found');
}

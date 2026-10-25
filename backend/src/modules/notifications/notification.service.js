import { Op } from 'sequelize';
import { Notification, User } from '../../database/models.js';
import { ApiError } from '../../shared/errors/api-error.js';
import { emitToUser } from '../../shared/realtime/socket.js';
import { sendEmail } from '../../shared/services/email.service.js';
import { notificationEmail } from '../../shared/services/email-templates.js';
import { USER_SUMMARY_ATTRIBUTES } from '../users/user.model.js';

/**
 * Creates in-app notifications (pushed live over websockets) and mirrors them by email
 * for recipients who opted in. The actor never notifies themselves.
 */
export async function notifyUsers({ userIds, actorId = null, type, title, body = null, link = null, issueId = null, projectId = null, email = true }) {
  const recipients = [...new Set(userIds.filter(Boolean))].filter((userId) => userId !== actorId);
  if (!recipients.length) return [];

  const notifications = await Notification.bulkCreate(
    recipients.map((userId) => ({ userId, actorId, type, title, body, link, issueId, projectId })),
  );
  notifications.forEach((notification) => emitToUser(notification.userId, 'notification:created', notification.toJSON()));

  if (email) {
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

export async function markRead(userId, notificationId) {
  const notification = await Notification.findOne({ where: { id: notificationId, userId } });
  if (!notification) throw ApiError.notFound('Notification not found');
  if (!notification.readAt) await notification.update({ readAt: new Date() });
  return notification;
}

export const markAllRead = (userId) =>
  Notification.update({ readAt: new Date() }, { where: { userId, readAt: { [Op.is]: null } } });

export async function removeNotification(userId, notificationId) {
  const deleted = await Notification.destroy({ where: { id: notificationId, userId } });
  if (!deleted) throw ApiError.notFound('Notification not found');
}

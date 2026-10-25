import * as notificationService from './notification.service.js';

export const list = async (req, res) =>
  res.json({ notifications: await notificationService.listNotifications(req.user.id, req.filters) });

export const unreadCount = async (req, res) => res.json({ count: await notificationService.countUnread(req.user.id) });

export const markRead = async (req, res) =>
  res.json({ notification: await notificationService.markRead(req.user.id, req.params.notificationId) });

export const markAllRead = async (req, res) => {
  await notificationService.markAllRead(req.user.id);
  res.status(204).end();
};

export const remove = async (req, res) => {
  await notificationService.removeNotification(req.user.id, req.params.notificationId);
  res.status(204).end();
};

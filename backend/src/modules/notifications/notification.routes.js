import { Router } from 'express';
import { validate } from '../../shared/middleware/validate.js';
import * as controller from './notification.controller.js';
import { listNotificationsQuery } from './notification.validation.js';

const router = Router();

router.get('/notifications', validate({ query: listNotificationsQuery }), controller.list);
router.get('/notifications/unread-count', controller.unreadCount);
router.post('/notifications/read-all', controller.markAllRead);
router.patch('/notifications/:notificationId/read', controller.markRead);
router.delete('/notifications/:notificationId', controller.remove);

export default router;

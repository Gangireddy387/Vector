import { Router } from 'express';
import { authenticate, requireOrganization } from './shared/middleware/authenticate.js';
import activityRoutes from './modules/activity/activity.routes.js';
import aiRoutes from './modules/ai/ai.routes.js';
import attachmentRoutes from './modules/attachments/attachment.routes.js';
import authRoutes from './modules/auth/auth.routes.js';
import automationRoutes from './modules/automations/automation.routes.js';
import calendarRoutes from './modules/calendar/calendar.routes.js';
import chatRoutes from './modules/chat/chat.routes.js';
import commentRoutes from './modules/comments/comment.routes.js';
import dashboardRoutes from './modules/dashboard/dashboard.routes.js';
import departmentRoutes from './modules/departments/department.routes.js';
import issueRoutes from './modules/issues/issue.routes.js';
import labelRoutes from './modules/labels/label.routes.js';
import messageRoutes from './modules/messages/messages.routes.js';
import notificationRoutes from './modules/notifications/notification.routes.js';
import projectRoutes from './modules/projects/project.routes.js';
import recurringTaskRoutes from './modules/recurring-tasks/recurring-task.routes.js';
import reportRoutes from './modules/reports/report.routes.js';
import savedFilterRoutes from './modules/saved-filters/saved-filter.routes.js';
import searchRoutes from './modules/search/search.routes.js';
import standupRoutes from './modules/standups/standup.routes.js';
import sprintRoutes from './modules/sprints/sprint.routes.js';
import statusRoutes from './modules/statuses/status.routes.js';
import templateRoutes from './modules/templates/template.routes.js';
import { avatarRoutes, publicAvatarRoutes } from './modules/users/avatar.routes.js';
import userRoutes from './modules/users/user.routes.js';
import worklogRoutes from './modules/worklogs/worklog.routes.js';
import { publicWorkspaceRoutes } from './modules/workspace/workspace.routes.js';
import { organizationAdminRoutes, organizationRoutes, publicOrganizationRoutes } from './modules/organizations/organization.routes.js';
import superAdminRoutes from './modules/super-admin/super-admin.routes.js';

export function createApiRouter() {
  const router = Router();

  router.use('/auth', authRoutes);
  router.use(publicWorkspaceRoutes);
  router.use(publicAvatarRoutes);
  router.use(publicOrganizationRoutes);

  router.use(authenticate);
  router.use(avatarRoutes);
  router.use(organizationRoutes);
  router.use(organizationAdminRoutes);
  router.use(superAdminRoutes);

  // Everything below works inside the signed-in person's current organization.
  router.use(requireOrganization);
  router.use('/users', userRoutes);
  [
    departmentRoutes,
    dashboardRoutes,
    searchRoutes,
    projectRoutes,
    statusRoutes,
    labelRoutes,
    sprintRoutes,
    issueRoutes,
    commentRoutes,
    attachmentRoutes,
    worklogRoutes,
    activityRoutes,
    notificationRoutes,
    automationRoutes,
    templateRoutes,
    recurringTaskRoutes,
    savedFilterRoutes,
    reportRoutes,
    chatRoutes,
    standupRoutes,
    calendarRoutes,
    messageRoutes,
    aiRoutes,
  ].forEach((moduleRouter) => router.use(moduleRouter));

  return router;
}

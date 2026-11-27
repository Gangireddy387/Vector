import { Router } from 'express';
import { authenticate, requireOrganization } from './shared/middleware/authenticate.js';
import activityRoutes from './modules/activity/activity.routes.js';
import aiRoutes from './modules/ai/ai.routes.js';
import attachmentRoutes, { publicAttachmentFileRoutes } from './modules/attachments/attachment.routes.js';
import authRoutes from './modules/auth/auth.routes.js';
import { publicAuthOAuthRoutes } from './modules/auth/auth-oauth.routes.js';
import { billingRoutes } from './modules/billing/billing.routes.js';
import { publicScimRoutes, scimAdminRoutes } from './modules/scim/scim.routes.js';
import { githubAdminRoutes } from './modules/integrations/github/github.routes.js';
import { gitlabAdminRoutes } from './modules/integrations/gitlab/gitlab.routes.js';
import { webhookAdminRoutes } from './modules/webhooks/webhook.routes.js';
import { embedAdminRoutes, publicEmbedRoutes } from './modules/embed/embed.routes.js';
import automationRoutes from './modules/automations/automation.routes.js';
import calendarRoutes from './modules/calendar/calendar.routes.js';
import chatRoutes from './modules/chat/chat.routes.js';
import { publicChatFileRoutes } from './modules/chat/chat.files.js';
import commentRoutes from './modules/comments/comment.routes.js';
import dashboardRoutes from './modules/dashboard/dashboard.routes.js';
import departmentRoutes from './modules/departments/department.routes.js';
import issueRoutes from './modules/issues/issue.routes.js';
import labelRoutes from './modules/labels/label.routes.js';
import componentRoutes from './modules/components/component.routes.js';
import customFieldRoutes from './modules/custom-fields/custom-field.routes.js';
import messageRoutes from './modules/messages/messages.routes.js';
import { conversationFileRoutes, publicConversationFileRoutes } from './modules/messages/conversation.files.js';
import { publicMeetingRoutes } from './modules/meetings/meeting.guest.js';
import { publicRecordingRoutes } from './modules/meetings/meeting.recordings.js';
import { publicMeetingFileRoutes } from './modules/meetings/meeting.files.js';
import { publicShareRoutes } from './modules/shares/share.public.js';
import shareRoutes from './modules/shares/share.routes.js';
import { publicIntakeRoutes } from './modules/intake/intake.public.js';
import intakeRoutes from './modules/intake/intake.routes.js';
import { livekitWebhookRoutes } from './modules/meetings/meeting.phone.js';
import { calendarSyncRoutes, publicCalendarSyncRoutes } from './modules/calendar-sync/calendar-sync.routes.js';
import meetingRoutes from './modules/meetings/meeting.routes.js';
import pushRoutes from './modules/push/push.routes.js';
import notificationRoutes from './modules/notifications/notification.routes.js';
import projectRoutes from './modules/projects/project.routes.js';
import recurringTaskRoutes from './modules/recurring-tasks/recurring-task.routes.js';
import reportRoutes from './modules/reports/report.routes.js';
import savedFilterRoutes from './modules/saved-filters/saved-filter.routes.js';
import searchRoutes from './modules/search/search.routes.js';
import standupRoutes from './modules/standups/standup.routes.js';
import sprintRoutes from './modules/sprints/sprint.routes.js';
import statusRoutes from './modules/statuses/status.routes.js';
import workflowTransitionRoutes from './modules/workflow-transitions/workflow-transition.routes.js';
import templateRoutes from './modules/templates/template.routes.js';
import { avatarRoutes, publicAvatarRoutes } from './modules/users/avatar.routes.js';
import { publicShowcaseRoutes, showcaseAdminRoutes } from './modules/marketing/showcase.routes.js';
import { publicLegalRoutes, legalAdminRoutes } from './modules/legal/legal.routes.js';
import { publicPricingRoutes, pricingAdminRoutes } from './modules/plans/pricing.routes.js';
import { publicRingtoneRoutes, ringtoneRoutes } from './modules/users/ringtone.routes.js';
import userRoutes from './modules/users/user.routes.js';
import worklogRoutes from './modules/worklogs/worklog.routes.js';
import { publicWorkspaceRoutes } from './modules/workspace/workspace.routes.js';
import { organizationAdminRoutes, organizationRoutes, publicOrganizationRoutes } from './modules/organizations/organization.routes.js';
import superAdminRoutes from './modules/super-admin/super-admin.routes.js';
import supportCallRoutes from './modules/support/support-call.routes.js';
import goalRoutes from './modules/goals/goal.routes.js';
import portfolioRoutes from './modules/portfolio/portfolio.routes.js';
import roadmapRoutes from './modules/roadmap/roadmap.routes.js';
import versionRoutes from './modules/versions/version.routes.js';
import wikiRoutes from './modules/wiki/wiki.routes.js';
import { publicWikiFileRoutes, wikiFileRoutes } from './modules/wiki/wiki.files.js';

export function createApiRouter() {
  const router = Router();

  router.use('/auth', authRoutes);
  router.use(publicAuthOAuthRoutes);
  router.use(publicWorkspaceRoutes);
  router.use(publicAvatarRoutes);
  router.use(publicShowcaseRoutes);
  router.use(publicLegalRoutes);
  router.use(publicPricingRoutes);
  router.use(publicRingtoneRoutes);
  router.use(publicOrganizationRoutes);
  router.use(publicMeetingRoutes);
  router.use(publicShareRoutes);
  router.use(publicIntakeRoutes);
  router.use(publicRecordingRoutes);
  router.use(publicMeetingFileRoutes);
  router.use(publicConversationFileRoutes);
  router.use(publicChatFileRoutes);
  router.use(publicAttachmentFileRoutes);
  router.use(publicWikiFileRoutes);
  router.use(publicCalendarSyncRoutes);
  router.use(livekitWebhookRoutes);
  router.use(publicScimRoutes);
  router.use(publicEmbedRoutes);

  router.use(authenticate);
  router.use(avatarRoutes);
  router.use(ringtoneRoutes);
  router.use(calendarSyncRoutes);
  router.use(pushRoutes);
  router.use(billingRoutes);
  router.use(organizationRoutes);
  router.use(organizationAdminRoutes);
  router.use(scimAdminRoutes);
  router.use(webhookAdminRoutes);
  router.use(embedAdminRoutes);
  router.use(githubAdminRoutes);
  router.use(gitlabAdminRoutes);
  router.use(superAdminRoutes);
  router.use(showcaseAdminRoutes);
  router.use(legalAdminRoutes);
  router.use(pricingAdminRoutes);
  router.use(supportCallRoutes);

  // Everything below works inside the signed-in person's current organization.
  router.use(requireOrganization);
  router.use('/users', userRoutes);
  [
    departmentRoutes,
    dashboardRoutes,
    searchRoutes,
    projectRoutes,
    statusRoutes,
    workflowTransitionRoutes,
    labelRoutes,
    componentRoutes,
    customFieldRoutes,
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
    conversationFileRoutes,
    meetingRoutes,
    shareRoutes,
    intakeRoutes,
    goalRoutes,
    portfolioRoutes,
    roadmapRoutes,
    versionRoutes,
    wikiRoutes,
    wikiFileRoutes,
    aiRoutes,
  ].forEach((moduleRouter) => router.use(moduleRouter));

  return router;
}

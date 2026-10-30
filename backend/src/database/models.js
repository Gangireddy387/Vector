/**
 * Central model registry. Every Sequelize model is imported here and all associations
 * are declared in one place so the full data model can be reviewed at a glance.
 */
import { sequelize } from './connection.js';
import { User } from '../modules/users/user.model.js';
import { Project } from '../modules/projects/project.model.js';
import { ProjectMember } from '../modules/projects/project-member.model.js';
import { Status } from '../modules/statuses/status.model.js';
import { Label } from '../modules/labels/label.model.js';
import { Issue } from '../modules/issues/issue.model.js';
import { IssueLabel, IssueLink, IssueWatcher } from '../modules/issues/issue-relations.model.js';
import { Sprint } from '../modules/sprints/sprint.model.js';
import { Comment } from '../modules/comments/comment.model.js';
import { Attachment } from '../modules/attachments/attachment.model.js';
import { WorkLog } from '../modules/worklogs/worklog.model.js';
import { Activity } from '../modules/activity/activity.model.js';
import { Notification } from '../modules/notifications/notification.model.js';
import { AutomationRule } from '../modules/automations/automation-rule.model.js';
import { IssueTemplate } from '../modules/templates/issue-template.model.js';
import { RecurringTask } from '../modules/recurring-tasks/recurring-task.model.js';
import { SavedFilter } from '../modules/saved-filters/saved-filter.model.js';
import { WorkspaceSetting } from '../modules/workspace/workspace-setting.model.js';
import { ChatMessage, ChatMessageIssue } from '../modules/chat/chat.model.js';
import { StandupUpdate } from '../modules/standups/standup.model.js';
import { Organization, OrganizationMember } from '../modules/organizations/organization.model.js';
import { Plan } from '../modules/plans/plan.model.js';
import { Department, Team, TeamMember } from '../modules/departments/department.model.js';
import { CalendarEvent } from '../modules/calendar/calendar-event.model.js';
import { SupportMessage } from '../modules/support/support-message.model.js';
import { Conversation, ConversationHiddenMessage, ConversationMember, ConversationMessage } from '../modules/messages/conversation.model.js';
import {
  Meeting,
  MeetingChatMessage,
  MeetingParticipant,
  MeetingPoll,
  MeetingRecording,
  MeetingTranscriptLine,
  MeetingUpdate,
} from '../modules/meetings/meeting.model.js';
import { PushSubscription } from '../modules/push/push-subscription.model.js';

const cascade = { onDelete: 'CASCADE' };

// Organization structure: departments → teams → members
Organization.hasMany(Department, { as: 'departments', foreignKey: 'organizationId', ...cascade });
Department.belongsTo(Organization, { as: 'organization', foreignKey: 'organizationId' });
Department.belongsTo(User, { as: 'head', foreignKey: 'headId', onDelete: 'SET NULL' });
Department.hasMany(Team, { as: 'teams', foreignKey: 'departmentId', ...cascade });
Team.belongsTo(Department, { as: 'department', foreignKey: 'departmentId' });
Team.belongsTo(User, { as: 'lead', foreignKey: 'leadId', onDelete: 'SET NULL' });
Team.belongsToMany(User, { through: TeamMember, as: 'members', foreignKey: 'teamId', otherKey: 'userId' });
User.belongsToMany(Team, { through: TeamMember, as: 'teams', foreignKey: 'userId', otherKey: 'teamId' });
Team.hasMany(TeamMember, { as: 'memberships', foreignKey: 'teamId', ...cascade });
// Teams own projects (and their tasks); cleared in code when a team or its department is deleted.
Team.hasMany(Project, { as: 'projects', foreignKey: 'teamId', constraints: false });
Project.belongsTo(Team, { as: 'team', foreignKey: 'teamId', constraints: false });

// Plans: what each organization may use (no database constraint, so plans can be edited freely)
Organization.belongsTo(Plan, { as: 'plan', foreignKey: 'planId', constraints: false });
Plan.hasMany(Organization, { as: 'organizations', foreignKey: 'planId', constraints: false });

// Organizations: every person, project and setting belongs to one
Organization.hasMany(OrganizationMember, { as: 'memberships', foreignKey: 'organizationId', ...cascade });
User.hasMany(OrganizationMember, { as: 'organizationMemberships', foreignKey: 'userId', ...cascade });
OrganizationMember.belongsTo(Organization, { as: 'organization', foreignKey: 'organizationId' });
OrganizationMember.belongsTo(User, { as: 'user', foreignKey: 'userId' });
Organization.hasMany(Project, { as: 'projects', foreignKey: 'organizationId', ...cascade });
Project.belongsTo(Organization, { as: 'organization', foreignKey: 'organizationId' });

// Users & projects
User.hasMany(ProjectMember, { as: 'memberships', foreignKey: 'userId', ...cascade });
Project.hasMany(ProjectMember, { as: 'memberships', foreignKey: 'projectId', ...cascade });
ProjectMember.belongsTo(User, { as: 'user', foreignKey: 'userId' });
ProjectMember.belongsTo(Project, { as: 'project', foreignKey: 'projectId' });
Project.belongsTo(User, { as: 'lead', foreignKey: 'leadId', onDelete: 'SET NULL' });

// Workflow configuration
Project.hasMany(Status, { as: 'statuses', foreignKey: 'projectId', ...cascade });
Status.belongsTo(Project, { as: 'project', foreignKey: 'projectId' });
Project.hasMany(Label, { as: 'labels', foreignKey: 'projectId', ...cascade });
Label.belongsTo(Project, { as: 'project', foreignKey: 'projectId' });

// Sprints
Project.hasMany(Sprint, { as: 'sprints', foreignKey: 'projectId', ...cascade });
Sprint.belongsTo(Project, { as: 'project', foreignKey: 'projectId' });

// Issues
Project.hasMany(Issue, { as: 'issues', foreignKey: 'projectId', ...cascade });
Issue.belongsTo(Project, { as: 'project', foreignKey: 'projectId' });
Issue.belongsTo(Status, { as: 'status', foreignKey: 'statusId' });
Status.hasMany(Issue, { as: 'issues', foreignKey: 'statusId' });
Issue.belongsTo(Sprint, { as: 'sprint', foreignKey: 'sprintId', onDelete: 'SET NULL' });
Sprint.hasMany(Issue, { as: 'issues', foreignKey: 'sprintId' });
Issue.belongsTo(User, { as: 'assignee', foreignKey: 'assigneeId', onDelete: 'SET NULL' });
Issue.belongsTo(User, { as: 'reporter', foreignKey: 'reporterId', onDelete: 'SET NULL' });
Issue.belongsTo(Issue, { as: 'parent', foreignKey: 'parentId', ...cascade });
Issue.hasMany(Issue, { as: 'subtasks', foreignKey: 'parentId', ...cascade });

Issue.belongsToMany(Label, { through: IssueLabel, as: 'labels', foreignKey: 'issueId', otherKey: 'labelId' });
Label.belongsToMany(Issue, { through: IssueLabel, as: 'issues', foreignKey: 'labelId', otherKey: 'issueId' });
Issue.belongsToMany(User, { through: IssueWatcher, as: 'watchers', foreignKey: 'issueId', otherKey: 'userId' });
User.belongsToMany(Issue, { through: IssueWatcher, as: 'watchedIssues', foreignKey: 'userId', otherKey: 'issueId' });

Issue.hasMany(IssueLink, { as: 'outwardLinks', foreignKey: 'sourceIssueId', ...cascade });
Issue.hasMany(IssueLink, { as: 'inwardLinks', foreignKey: 'targetIssueId', ...cascade });
IssueLink.belongsTo(Issue, { as: 'sourceIssue', foreignKey: 'sourceIssueId' });
IssueLink.belongsTo(Issue, { as: 'targetIssue', foreignKey: 'targetIssueId' });

// Collaboration
Issue.hasMany(Comment, { as: 'comments', foreignKey: 'issueId', ...cascade });
Comment.belongsTo(Issue, { as: 'issue', foreignKey: 'issueId' });
Comment.belongsTo(User, { as: 'author', foreignKey: 'authorId', onDelete: 'SET NULL' });

Issue.hasMany(Attachment, { as: 'attachments', foreignKey: 'issueId', ...cascade });
Attachment.belongsTo(Issue, { as: 'issue', foreignKey: 'issueId' });
Attachment.belongsTo(User, { as: 'uploader', foreignKey: 'uploaderId', onDelete: 'SET NULL' });

Issue.hasMany(WorkLog, { as: 'workLogs', foreignKey: 'issueId', ...cascade });
WorkLog.belongsTo(Issue, { as: 'issue', foreignKey: 'issueId' });
WorkLog.belongsTo(User, { as: 'user', foreignKey: 'userId', onDelete: 'SET NULL' });

// Audit trail & inbox
Project.hasMany(Activity, { as: 'activities', foreignKey: 'projectId', ...cascade });
Issue.hasMany(Activity, { as: 'activities', foreignKey: 'issueId', ...cascade });
Activity.belongsTo(Issue, { as: 'issue', foreignKey: 'issueId' });
Activity.belongsTo(Project, { as: 'project', foreignKey: 'projectId' });
Activity.belongsTo(User, { as: 'actor', foreignKey: 'actorId', onDelete: 'SET NULL' });

User.hasMany(Notification, { as: 'notifications', foreignKey: 'userId', ...cascade });
Notification.belongsTo(User, { as: 'actor', foreignKey: 'actorId', onDelete: 'SET NULL' });
Notification.belongsTo(Issue, { as: 'issue', foreignKey: 'issueId', ...cascade });
Notification.belongsTo(Project, { as: 'project', foreignKey: 'projectId', ...cascade });

// Productivity: automation, templates, recurring work, saved filters
Project.hasMany(AutomationRule, { as: 'automationRules', foreignKey: 'projectId', ...cascade });
AutomationRule.belongsTo(Project, { as: 'project', foreignKey: 'projectId' });
AutomationRule.belongsTo(User, { as: 'createdBy', foreignKey: 'createdById', onDelete: 'SET NULL' });

Project.hasMany(IssueTemplate, { as: 'templates', foreignKey: 'projectId', ...cascade });
IssueTemplate.belongsTo(Project, { as: 'project', foreignKey: 'projectId' });

Project.hasMany(RecurringTask, { as: 'recurringTasks', foreignKey: 'projectId', ...cascade });
RecurringTask.belongsTo(Project, { as: 'project', foreignKey: 'projectId' });
RecurringTask.belongsTo(User, { as: 'assignee', foreignKey: 'assigneeId', onDelete: 'SET NULL' });

User.hasMany(SavedFilter, { as: 'savedFilters', foreignKey: 'userId', ...cascade });
SavedFilter.belongsTo(Project, { as: 'project', foreignKey: 'projectId', ...cascade });

// Team chat & daily standups
Project.hasMany(ChatMessage, { as: 'chatMessages', foreignKey: 'projectId', ...cascade });
ChatMessage.belongsTo(Project, { as: 'project', foreignKey: 'projectId' });
ChatMessage.belongsTo(User, { as: 'author', foreignKey: 'authorId', onDelete: 'SET NULL' });
ChatMessage.belongsToMany(Issue, { through: ChatMessageIssue, as: 'issues', foreignKey: 'messageId', otherKey: 'issueId' });
Issue.belongsToMany(ChatMessage, { through: ChatMessageIssue, as: 'chatMessages', foreignKey: 'issueId', otherKey: 'messageId' });

Project.hasMany(StandupUpdate, { as: 'standupUpdates', foreignKey: 'projectId', ...cascade });
User.hasMany(StandupUpdate, { as: 'standupUpdates', foreignKey: 'userId', ...cascade });
StandupUpdate.belongsTo(User, { as: 'user', foreignKey: 'userId' });
StandupUpdate.belongsTo(Project, { as: 'project', foreignKey: 'projectId' });

// Personal calendar: private to its owner; deleting a linked project keeps its events (the link just stops resolving)
Organization.hasMany(CalendarEvent, { as: 'calendarEvents', foreignKey: 'organizationId', ...cascade });
User.hasMany(CalendarEvent, { as: 'calendarEvents', foreignKey: 'ownerId', ...cascade });
CalendarEvent.belongsTo(Project, { as: 'project', foreignKey: 'projectId', constraints: false });

// Support chat between the super admin and each organization's admins
Organization.hasMany(SupportMessage, { as: 'supportMessages', foreignKey: 'organizationId', ...cascade });
SupportMessage.belongsTo(User, { as: 'author', foreignKey: 'authorId', onDelete: 'SET NULL' });

// Direct messages and team/department chats inside an organization
Organization.hasMany(Conversation, { as: 'conversations', foreignKey: 'organizationId', ...cascade });
Conversation.hasMany(ConversationMember, { as: 'members', foreignKey: 'conversationId', ...cascade });
Conversation.hasMany(ConversationMessage, { as: 'messages', foreignKey: 'conversationId', ...cascade });
ConversationMember.belongsTo(User, { as: 'user', foreignKey: 'userId', ...cascade });
ConversationMessage.belongsTo(User, { as: 'author', foreignKey: 'authorId', onDelete: 'SET NULL' });
ConversationMessage.hasMany(ConversationHiddenMessage, { as: 'hides', foreignKey: 'messageId', ...cascade });
User.hasMany(ConversationHiddenMessage, { as: 'hiddenMessages', foreignKey: 'userId', ...cascade });
// No database constraint: the chat of a deleted team or department simply stops being listed.
Conversation.belongsTo(Team, { as: 'team', foreignKey: 'teamId', constraints: false });
Conversation.belongsTo(Department, { as: 'department', foreignKey: 'departmentId', constraints: false });

// Video meetings
Organization.hasMany(Meeting, { as: 'meetings', foreignKey: 'organizationId', ...cascade });
Meeting.belongsTo(User, { as: 'host', foreignKey: 'hostId', onDelete: 'SET NULL' });
Meeting.hasMany(MeetingParticipant, { as: 'participants', foreignKey: 'meetingId', ...cascade });
MeetingParticipant.belongsTo(User, { as: 'user', foreignKey: 'userId', ...cascade });
Meeting.hasMany(MeetingUpdate, { as: 'updates', foreignKey: 'meetingId', ...cascade });
MeetingUpdate.belongsTo(User, { as: 'author', foreignKey: 'authorId', onDelete: 'SET NULL' });
Meeting.hasMany(MeetingPoll, { as: 'polls', foreignKey: 'meetingId', ...cascade });
MeetingPoll.belongsTo(User, { as: 'createdBy', foreignKey: 'createdById', onDelete: 'SET NULL' });
Meeting.hasMany(MeetingChatMessage, { as: 'chatMessages', foreignKey: 'meetingId', ...cascade });
Meeting.hasMany(MeetingTranscriptLine, { as: 'transcript', foreignKey: 'meetingId', ...cascade });
Meeting.hasMany(MeetingRecording, { as: 'recordings', foreignKey: 'meetingId', ...cascade });
MeetingRecording.belongsTo(User, { as: 'createdBy', foreignKey: 'createdById', onDelete: 'SET NULL' });

// Devices that receive this person's push notifications
User.hasMany(PushSubscription, { as: 'pushSubscriptions', foreignKey: 'userId', ...cascade });

// Portal-wide configuration
WorkspaceSetting.belongsTo(User, { as: 'updatedBy', foreignKey: 'updatedById', onDelete: 'SET NULL' });

export {
  sequelize,
  User,
  Project,
  ProjectMember,
  Status,
  Label,
  Issue,
  IssueLabel,
  IssueLink,
  IssueWatcher,
  Sprint,
  Comment,
  Attachment,
  WorkLog,
  Activity,
  Notification,
  AutomationRule,
  IssueTemplate,
  RecurringTask,
  SavedFilter,
  WorkspaceSetting,
  ChatMessage,
  ChatMessageIssue,
  StandupUpdate,
  Organization,
  OrganizationMember,
  Plan,
  Department,
  Team,
  TeamMember,
  CalendarEvent,
  SupportMessage,
  Conversation,
  ConversationHiddenMessage,
  ConversationMember,
  ConversationMessage,
  Meeting,
  MeetingParticipant,
  MeetingUpdate,
  MeetingPoll,
  MeetingChatMessage,
  MeetingTranscriptLine,
  MeetingRecording,
  PushSubscription,
};

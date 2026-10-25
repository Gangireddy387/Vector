import { IssueWatcher, ProjectMember, User } from '../../database/models.js';
import { DomainEvents, eventBus } from '../../shared/events/event-bus.js';
import { toDateOnly } from '../../shared/utils/query.js';
import { notifyUsers } from './notification.service.js';

const actorName = async (actorId) => (actorId ? (await User.findByPk(actorId, { attributes: ['name'] }))?.name : null) ?? 'Automation';
const watcherIds = async (issueId) => (await IssueWatcher.findAll({ where: { issueId }, raw: true })).map((row) => row.userId);
const issueLink = (issue) => `/issues/${issue.key}`;
const issueTarget = (issue) => ({ issueId: issue.id, projectId: issue.projectId, link: issueLink(issue) });

async function onIssueCreated({ issue, actorId, context }) {
  if (!issue.assigneeId) return;
  // Sub-tasks generated together with their parent (templates, AI drafts, rules) would only add noise.
  if (issue.type === 'subtask' && (context?.isSubtaskOf || context?.source === 'automation')) return;
  await notifyUsers({
    userIds: [issue.assigneeId],
    actorId,
    type: 'assigned',
    title: `${await actorName(actorId)} assigned you ${issue.key}`,
    body: issue.title,
    ...issueTarget(issue),
  });
}

async function onIssueUpdated({ issue, changes, actorId, context }) {
  const name = await actorName(actorId);
  if (changes.assigneeId?.to) {
    await notifyUsers({
      userIds: [changes.assigneeId.to],
      actorId,
      type: 'assigned',
      title: `${name} assigned you ${issue.key}`,
      body: issue.title,
      ...issueTarget(issue),
    });
  }
  if (changes.statusId && !context?.bulk) {
    await notifyUsers({
      userIds: await watcherIds(issue.id),
      actorId,
      type: 'status_changed',
      title: `${issue.key} moved to ${issue.status?.name}`,
      body: `${name} changed the status of "${issue.title}"`,
      email: issue.status?.category === 'done',
      ...issueTarget(issue),
    });
  }
}

async function onCommentCreated({ issue, comment, mentionedUserIds = [], actorId }) {
  const name = await actorName(actorId);
  const preview = String(comment.body).replace(/@\[([^\]]+)\]\([^)]+\)/g, '@$1').slice(0, 200);
  if (mentionedUserIds.length) {
    await notifyUsers({
      userIds: mentionedUserIds,
      actorId,
      type: 'mentioned',
      title: `${name} mentioned you on ${issue.key}`,
      body: preview,
      ...issueTarget(issue),
    });
  }
  const others = (await watcherIds(issue.id)).filter((id) => !mentionedUserIds.includes(id));
  await notifyUsers({
    userIds: others,
    actorId,
    type: 'commented',
    title: `${name} commented on ${issue.key}`,
    body: preview,
    email: false,
    ...issueTarget(issue),
  });
}

async function onIssueDueSoon({ issue }) {
  const today = toDateOnly(new Date());
  const when = issue.dueDate < today ? 'is overdue' : issue.dueDate === today ? 'is due today' : `is due on ${issue.dueDate}`;
  await notifyUsers({
    userIds: [issue.assigneeId ?? issue.reporterId],
    type: 'due_soon',
    title: `${issue.key} ${when}`,
    body: issue.title,
    ...issueTarget(issue),
  });
}

const notifySprintMembers = (verb) => async ({ sprint, actorId }) => {
  const members = await ProjectMember.findAll({ where: { projectId: sprint.projectId }, raw: true });
  await notifyUsers({
    userIds: members.map((member) => member.userId),
    actorId,
    type: `sprint_${verb}`,
    title: `${sprint.name} ${verb}`,
    body: sprint.goal ?? null,
    projectId: sprint.projectId,
    link: `/projects/${sprint.projectId}/backlog`,
    email: false,
  });
};

async function onMemberAdded({ project, user, actorId }) {
  await notifyUsers({
    userIds: [user.id],
    actorId,
    type: 'member_added',
    title: `You were added to ${project.name}`,
    projectId: project.id,
    link: `/projects/${project.id}/board`,
    email: false,
  });
}

export function registerNotificationListeners() {
  eventBus.subscribe(DomainEvents.ISSUE_CREATED, onIssueCreated);
  eventBus.subscribe(DomainEvents.ISSUE_UPDATED, onIssueUpdated);
  eventBus.subscribe(DomainEvents.COMMENT_CREATED, onCommentCreated);
  eventBus.subscribe(DomainEvents.ISSUE_DUE_SOON, onIssueDueSoon);
  eventBus.subscribe(DomainEvents.SPRINT_STARTED, notifySprintMembers('started'));
  eventBus.subscribe(DomainEvents.SPRINT_COMPLETED, notifySprintMembers('completed'));
  eventBus.subscribe(DomainEvents.MEMBER_ADDED, onMemberAdded);
}

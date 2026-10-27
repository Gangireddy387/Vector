import { AutomationRule, Issue, IssueWatcher, ProjectMember, Sprint, User } from '../../database/models.js';
import { sendEmail } from '../../shared/services/email.service.js';
import { notificationEmail } from '../../shared/services/email-templates.js';
import { addDays, interpolate, toDateOnly } from '../../shared/utils/query.js';
import { logActivity } from '../activity/activity.service.js';
import { createComment } from '../comments/comment.service.js';
import { pickAssignee } from '../issues/issue-assignment.js';
import { issueEventInclude } from '../issues/issue.queries.js';
import { createIssue, updateIssue } from '../issues/issue.service.js';
import { notifyUsers } from '../notifications/notification.service.js';
import { projectHasFeature } from '../plans/plan.service.js';
import { MAX_AUTOMATION_DEPTH } from './automation.constants.js';

// ---------------------------------------------------------------------------
// Conditions
// ---------------------------------------------------------------------------

function readField(field, issue, changes) {
  switch (field) {
    case 'statusCategory':
      return issue.status?.category ?? null;
    case 'fromStatusId':
      return changes.statusId?.from ?? null;
    case 'labelId':
      return (issue.labels ?? []).map((label) => label.id);
    default:
      return issue[field] ?? null;
  }
}

const asArray = (value) => (Array.isArray(value) ? value.map(String) : value == null ? [] : [String(value)]);
const isEmpty = (value) => value == null || value === '' || (Array.isArray(value) && value.length === 0);

export function conditionMatches({ field, operator, value }, issue, changes = {}) {
  const actual = readField(field, issue, changes);
  const actualList = asArray(actual);
  const expectedList = asArray(value);

  switch (operator) {
    case 'equals':
      return Array.isArray(actual) ? actualList.includes(String(value)) : String(actual) === String(value);
    case 'not_equals':
      return !conditionMatches({ field, operator: 'equals', value }, issue, changes);
    case 'in':
      return actualList.some((item) => expectedList.includes(item));
    case 'not_in':
      return !actualList.some((item) => expectedList.includes(item));
    case 'contains':
      return String(actual ?? '').toLowerCase().includes(String(value ?? '').toLowerCase());
    case 'is_empty':
      return isEmpty(actual);
    case 'is_not_empty':
      return !isEmpty(actual);
    case 'gt':
      return Number(actual) > Number(value);
    case 'lt':
      return Number(actual) < Number(value);
    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

async function resolveRecipients(issue, { recipients = [], userIds = [] }) {
  const ids = new Set(userIds);
  if (recipients.includes('assignee') && issue.assigneeId) ids.add(issue.assigneeId);
  if (recipients.includes('reporter') && issue.reporterId) ids.add(issue.reporterId);
  if (recipients.includes('watchers')) {
    (await IssueWatcher.findAll({ where: { issueId: issue.id }, raw: true })).forEach((row) => ids.add(row.userId));
  }
  if (recipients.includes('project_admins')) {
    (await ProjectMember.findAll({ where: { projectId: issue.projectId, role: 'admin' }, raw: true })).forEach((row) => ids.add(row.userId));
  }
  return [...ids];
}

const templateVariables = (issue, rule, actor) => ({
  issue: { key: issue.key, title: issue.title, priority: issue.priority, type: issue.type, status: issue.status?.name },
  rule: { name: rule.name },
  actor: { name: actor?.name ?? 'Someone' },
});

const ACTION_HANDLERS = {
  set_status: ({ issue, params, context }) => updateIssue(issue.id, { statusId: params.statusId }, null, context),
  set_priority: ({ issue, params, context }) => updateIssue(issue.id, { priority: params.priority }, null, context),
  set_story_points: ({ issue, params, context }) => updateIssue(issue.id, { storyPoints: params.storyPoints }, null, context),
  set_due_date: ({ issue, params, context }) =>
    updateIssue(issue.id, { dueDate: toDateOnly(addDays(new Date(), params.daysFromNow)) }, null, context),

  async assign({ issue, params, context }) {
    const strategies = {
      user: () => params.userId,
      reporter: () => issue.reporterId,
      unassign: () => null,
    };
    const assigneeId = strategies[params.strategy] ? strategies[params.strategy]() : await pickAssignee(issue.projectId, params.strategy);
    if (assigneeId === undefined) return;
    await updateIssue(issue.id, { assigneeId }, null, context);
  },

  add_labels: ({ issue, params, context }) =>
    updateIssue(issue.id, { labelIds: [...new Set([...issue.labels.map((label) => label.id), ...params.labelIds])] }, null, context),

  remove_labels: ({ issue, params, context }) =>
    updateIssue(issue.id, { labelIds: issue.labels.map((label) => label.id).filter((id) => !params.labelIds.includes(id)) }, null, context),

  async add_comment({ issue, params, context, variables }) {
    const record = await Issue.findByPk(issue.id);
    await createComment(record, null, interpolate(params.body, variables), context);
  },

  async notify({ issue, params, variables, rule }) {
    await notifyUsers({
      userIds: await resolveRecipients(issue, params),
      type: 'automation',
      title: `${issue.key} · ${rule.name}`,
      body: interpolate(params.message, variables),
      link: `/issues/${issue.key}`,
      issueId: issue.id,
      projectId: issue.projectId,
      email: false,
    });
  },

  async send_email({ issue, params, variables }) {
    if (!(await projectHasFeature(issue.projectId, 'emailAutomations'))) return;
    const users = await User.findAll({ where: { id: await resolveRecipients(issue, params), status: 'active' } });
    await Promise.all(
      users.map((user) =>
        sendEmail({
          to: user.email,
          ...notificationEmail({
            title: interpolate(params.subject, variables),
            body: interpolate(params.message, variables),
            link: `/issues/${issue.key}`,
          }),
        }),
      ),
    );
  },

  async move_to_active_sprint({ issue, context }) {
    const sprint = await Sprint.findOne({ where: { projectId: issue.projectId, state: 'active' } });
    if (sprint && sprint.id !== issue.sprintId) await updateIssue(issue.id, { sprintId: sprint.id }, null, context);
  },

  async create_subtasks({ issue, params, context }) {
    if (issue.type === 'subtask') return;
    const existing = await Issue.findAll({ where: { parentId: issue.id }, attributes: ['title'], raw: true });
    const existingTitles = new Set(existing.map((row) => row.title.trim().toLowerCase()));
    for (const title of params.titles.filter((item) => !existingTitles.has(item.trim().toLowerCase()))) {
      await createIssue({ projectId: issue.projectId, title, parentId: issue.id, type: 'subtask', assigneeId: issue.assigneeId }, null, context);
    }
  },
};

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

const loadIssueState = async (issueId) => (await Issue.findByPk(issueId, { include: issueEventInclude() }))?.toJSON();

/**
 * Runs every enabled rule of the issue's project that listens to `trigger`.
 * Changes made by a rule carry `source: 'automation'` and an increasing depth.
 */
export async function runAutomations(trigger, { issue: eventIssue, changes = {}, actorId = null, context = {} }) {
  const depth = context.automationDepth ?? 0;
  if (depth >= MAX_AUTOMATION_DEPTH) return;

  const rules = await AutomationRule.findAll({
    where: { projectId: eventIssue.projectId, trigger, enabled: true },
    order: [['createdAt', 'ASC']],
  });
  if (!rules.length) return;
  if (!(await projectHasFeature(eventIssue.projectId, 'automations'))) return;
  const actor = actorId ? await User.findByPk(actorId) : null;

  for (const rule of rules) {
    if (context.ruleId === rule.id) continue;
    let issue = await loadIssueState(eventIssue.id);
    if (!issue) return;
    if (!rule.conditions.every((condition) => conditionMatches(condition, issue, changes))) continue;

    const ruleContext = { source: 'automation', ruleId: rule.id, ruleName: rule.name, automationDepth: depth + 1 };
    try {
      for (const action of rule.actions) {
        issue = await loadIssueState(eventIssue.id);
        if (!issue) break;
        await ACTION_HANDLERS[action.type]?.({
          issue,
          params: action.params ?? {},
          context: ruleContext,
          rule,
          variables: templateVariables(issue, rule, actor),
        });
      }
      await rule.update({ runCount: rule.runCount + 1, lastRunAt: new Date(), lastError: null });
      await logActivity({
        projectId: eventIssue.projectId,
        issueId: eventIssue.id,
        action: 'automation_ran',
        toValue: rule.name,
        meta: { ruleId: rule.id, trigger },
      });
    } catch (error) {
      console.error(`[automation] rule "${rule.name}" failed:`, error.message);
      await rule.update({ lastRunAt: new Date(), lastError: String(error.message).slice(0, 500) });
    }
  }
}

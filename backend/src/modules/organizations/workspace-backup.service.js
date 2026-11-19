import {
  Attachment,
  AutomationRule,
  Comment,
  Department,
  Issue,
  IssueLink,
  IssueTemplate,
  Label,
  OrganizationMember,
  Project,
  ProjectMember,
  RecurringTask,
  Sprint,
  Status,
  Team,
  User,
  WorkLog,
} from '../../database/models.js';
import { USER_SUMMARY_ATTRIBUTES } from '../users/user.model.js';

const FORMAT = 'vector-org-backup';
const VERSION = 1;

const userBrief = (user) =>
  user
    ? {
        id: user.id,
        name: user.name,
        email: user.email,
        title: user.title ?? null,
        status: user.status,
      }
    : null;

/**
 * Full organization backup for offboarding / migration.
 * JSON only — attachment binaries stay on disk under UPLOAD_DIR (metadata + storageKey included).
 */
export async function buildOrganizationBackup(organization, actor) {
  const [members, departments, projects] = await Promise.all([
    OrganizationMember.findAll({
      where: { organizationId: organization.id },
      include: [{ model: User, as: 'user', attributes: [...USER_SUMMARY_ATTRIBUTES, 'email', 'status', 'title', 'timezone', 'createdAt'] }],
      order: [['createdAt', 'ASC']],
    }),
    Department.findAll({
      where: { organizationId: organization.id },
      include: [
        { model: User, as: 'head', attributes: USER_SUMMARY_ATTRIBUTES },
        {
          model: Team,
          as: 'teams',
          include: [{ model: User, as: 'members', attributes: USER_SUMMARY_ATTRIBUTES, through: { attributes: [] } }],
        },
      ],
      order: [['name', 'ASC']],
    }),
    Project.findAll({
      where: { organizationId: organization.id },
      order: [['name', 'ASC']],
    }),
  ]);

  const projectBackups = [];
  for (const project of projects) {
    projectBackups.push(await backupProject(project));
  }

  return {
    format: FORMAT,
    version: VERSION,
    exportedAt: new Date().toISOString(),
    exportedBy: userBrief(actor),
    notes: {
      attachments:
        'Binary files are not embedded. Back up the server UPLOAD_DIR as well; each attachment lists storageKey relative to that directory.',
    },
    organization: {
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      status: organization.status,
      defaultMode: organization.defaultMode,
      brandColor: organization.brandColor,
      logoUrl: organization.logoUrl,
      requireMfa: organization.requireMfa,
      planId: organization.planId,
      featureOverrides: organization.featureOverrides ?? null,
      billedSeats: organization.billedSeats,
      stripeCustomerId: organization.stripeCustomerId,
      stripeSubscriptionId: organization.stripeSubscriptionId,
      createdAt: organization.createdAt,
      updatedAt: organization.updatedAt,
    },
    members: members.map((membership) => ({
      id: membership.id,
      role: membership.role,
      status: membership.status,
      joinedAt: membership.createdAt,
      user: membership.user
        ? {
            id: membership.user.id,
            name: membership.user.name,
            email: membership.user.email,
            title: membership.user.title ?? null,
            status: membership.user.status,
            timezone: membership.user.timezone ?? null,
            createdAt: membership.user.createdAt,
          }
        : null,
    })),
    departments: departments.map((department) => ({
      id: department.id,
      name: department.name,
      head: userBrief(department.head),
      teams: (department.teams ?? []).map((team) => ({
        id: team.id,
        name: team.name,
        members: (team.members ?? []).map(userBrief).filter(Boolean),
      })),
    })),
    projects: projectBackups,
    stats: {
      members: members.length,
      departments: departments.length,
      projects: projectBackups.length,
      issues: projectBackups.reduce((total, project) => total + project.issues.length, 0),
      attachments: projectBackups.reduce(
        (total, project) => total + project.issues.reduce((sum, issue) => sum + (issue.attachments?.length ?? 0), 0),
        0,
      ),
    },
  };
}

async function backupProject(project) {
  const [statuses, labels, members, sprints, issues, templates, recurringTasks, automationRules] = await Promise.all([
    Status.findAll({ where: { projectId: project.id }, order: [['position', 'ASC']] }),
    Label.findAll({ where: { projectId: project.id }, order: [['name', 'ASC']] }),
    ProjectMember.findAll({
      where: { projectId: project.id },
      include: [{ model: User, as: 'user', attributes: USER_SUMMARY_ATTRIBUTES }],
    }),
    Sprint.findAll({ where: { projectId: project.id }, order: [['startDate', 'ASC']] }),
    Issue.findAll({
      where: { projectId: project.id },
      include: [
        { model: Label, as: 'labels', attributes: ['id', 'name', 'color'], through: { attributes: [] } },
        { model: User, as: 'assignee', attributes: USER_SUMMARY_ATTRIBUTES },
        { model: User, as: 'reporter', attributes: USER_SUMMARY_ATTRIBUTES },
        { model: User, as: 'watchers', attributes: USER_SUMMARY_ATTRIBUTES, through: { attributes: [] } },
        { model: Comment, as: 'comments', include: [{ model: User, as: 'author', attributes: USER_SUMMARY_ATTRIBUTES }] },
        { model: WorkLog, as: 'workLogs', include: [{ model: User, as: 'user', attributes: USER_SUMMARY_ATTRIBUTES }] },
        { model: Attachment, as: 'attachments' },
      ],
      order: [['number', 'ASC']],
    }),
    IssueTemplate.findAll({ where: { projectId: project.id }, order: [['name', 'ASC']] }),
    RecurringTask.findAll({
      where: { projectId: project.id },
      include: [{ model: User, as: 'assignee', attributes: USER_SUMMARY_ATTRIBUTES }],
      order: [['title', 'ASC']],
    }),
    AutomationRule.findAll({ where: { projectId: project.id }, order: [['createdAt', 'ASC']] }),
  ]);

  const issueIds = issues.map((issue) => issue.id);
  const links = issueIds.length
    ? await IssueLink.findAll({
        where: { sourceIssueId: issueIds },
        include: [{ model: Issue, as: 'targetIssue', attributes: ['id', 'key'] }],
      })
    : [];
  const linksBySource = new Map();
  for (const link of links) {
    const list = linksBySource.get(link.sourceIssueId) ?? [];
    list.push({
      id: link.id,
      type: link.type,
      targetIssueId: link.targetIssueId,
      targetKey: link.targetIssue?.key ?? null,
      createdAt: link.createdAt,
    });
    linksBySource.set(link.sourceIssueId, list);
  }

  return {
    id: project.id,
    key: project.key,
    name: project.name,
    description: project.description,
    type: project.type,
    color: project.color,
    leadId: project.leadId,
    teamId: project.teamId,
    settings: project.settings,
    archivedAt: project.archivedAt,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    statuses: statuses.map((status) => ({
      id: status.id,
      name: status.name,
      category: status.category,
      color: status.color,
      position: status.position,
      wipLimit: status.wipLimit ?? null,
    })),
    labels: labels.map((label) => ({ id: label.id, name: label.name, color: label.color })),
    members: members.map((member) => ({
      userId: member.userId,
      role: member.role,
      viaTeam: Boolean(member.viaTeam),
      user: userBrief(member.user),
    })),
    sprints: sprints.map((sprint) => ({
      id: sprint.id,
      name: sprint.name,
      goal: sprint.goal,
      state: sprint.state,
      startDate: sprint.startDate,
      endDate: sprint.endDate,
    })),
    templates: templates.map((template) => template.toJSON()),
    recurringTasks: recurringTasks.map((task) => ({
      ...task.toJSON(),
      assignee: userBrief(task.assignee),
    })),
    automationRules: automationRules.map((rule) => ({
      id: rule.id,
      name: rule.name,
      description: rule.description,
      enabled: rule.enabled,
      trigger: rule.trigger,
      conditions: rule.conditions,
      actions: rule.actions,
      runCount: rule.runCount,
      lastRunAt: rule.lastRunAt,
      lastError: rule.lastError,
      createdAt: rule.createdAt,
    })),
    issues: issues.map((issue) => ({
      id: issue.id,
      key: issue.key,
      number: issue.number,
      title: issue.title,
      description: issue.description,
      type: issue.type,
      priority: issue.priority,
      statusId: issue.statusId,
      assigneeId: issue.assigneeId,
      assignee: userBrief(issue.assignee),
      reporterId: issue.reporterId,
      reporter: userBrief(issue.reporter),
      parentId: issue.parentId,
      sprintId: issue.sprintId,
      storyPoints: issue.storyPoints,
      estimateMinutes: issue.estimateMinutes,
      startDate: issue.startDate,
      dueDate: issue.dueDate,
      position: issue.position,
      completedAt: issue.completedAt,
      createdAt: issue.createdAt,
      updatedAt: issue.updatedAt,
      labels: (issue.labels ?? []).map((label) => ({ id: label.id, name: label.name, color: label.color })),
      watchers: (issue.watchers ?? []).map(userBrief),
      comments: (issue.comments ?? []).map((comment) => ({
        id: comment.id,
        body: comment.body,
        author: userBrief(comment.author),
        createdAt: comment.createdAt,
        updatedAt: comment.updatedAt,
      })),
      workLogs: (issue.workLogs ?? []).map((log) => ({
        id: log.id,
        minutes: log.minutes,
        note: log.note,
        user: userBrief(log.user),
        loggedAt: log.loggedAt ?? log.createdAt,
        createdAt: log.createdAt,
      })),
      attachments: (issue.attachments ?? []).map((file) => ({
        id: file.id,
        fileName: file.fileName,
        mimeType: file.mimeType,
        size: file.size,
        storageKey: file.storageKey,
        uploaderId: file.uploaderId,
        createdAt: file.createdAt,
      })),
      links: linksBySource.get(issue.id) ?? [],
    })),
  };
}

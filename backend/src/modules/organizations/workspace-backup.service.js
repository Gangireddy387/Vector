import fs from 'node:fs/promises';
import {
  Attachment,
  AutomationRule,
  Comment,
  Component,
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
import { config } from '../../config/index.js';
import { resolveStoragePath } from '../attachments/attachment.storage.js';
import { USER_SUMMARY_ATTRIBUTES } from '../users/user.model.js';

const FORMAT = 'vector-org-backup';
/** v2 embeds attachment bytes as base64 when files fit the size budget. */
export const BACKUP_VERSION = 2;

/** Skip embedding a single file above this (matches typical upload caps). */
const MAX_EMBED_FILE_BYTES = () => Math.max(1, config.uploads.maxFileSizeMb) * 1024 * 1024;
/** Cap total embedded raw bytes so the JSON download/import stays manageable. */
const MAX_EMBED_TOTAL_BYTES = 60 * 1024 * 1024;

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
 * v2 embeds attachment file bytes (base64) when under size limits; oversized/missing files keep metadata only.
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

  const embedBudget = { used: 0, maxFile: MAX_EMBED_FILE_BYTES(), maxTotal: MAX_EMBED_TOTAL_BYTES };
  const projectBackups = [];
  for (const project of projects) {
    projectBackups.push(await backupProject(project, embedBudget));
  }

  const attachmentStats = projectBackups.reduce(
    (totals, project) => {
      for (const issue of project.issues ?? []) {
        for (const file of issue.attachments ?? []) {
          totals.total += 1;
          if (file.embedded) totals.embedded += 1;
          else totals.skipped += 1;
        }
      }
      return totals;
    },
    { total: 0, embedded: 0, skipped: 0 },
  );

  return {
    format: FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    exportedBy: userBrief(actor),
    notes: {
      attachments:
        attachmentStats.skipped > 0
          ? `${attachmentStats.embedded} file(s) embedded as base64; ${attachmentStats.skipped} skipped (missing, too large, or over the ${Math.round(MAX_EMBED_TOTAL_BYTES / (1024 * 1024))} MB total budget). Metadata is always included.`
          : 'Attachment binaries are embedded as base64 in this backup (v2).',
      billing: 'Stripe customer/subscription ids are included for reference only — restore never copies billing.',
      users: 'People are listed for remapping by email on restore; restore does not create login accounts.',
    },
    organization: {
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      status: organization.status,
      defaultMode: organization.defaultMode,
      brandColor: organization.brandColor,
      brandBrightness: organization.brandBrightness ?? null,
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
      attachments: attachmentStats.total,
      attachmentsEmbedded: attachmentStats.embedded,
      attachmentsSkipped: attachmentStats.skipped,
    },
  };
}

async function serializeAttachment(file, embedBudget) {
  const row = {
    id: file.id,
    fileName: file.fileName,
    mimeType: file.mimeType,
    size: file.size,
    storageKey: file.storageKey,
    thumbStorageKey: file.thumbStorageKey ?? null,
    uploaderId: file.uploaderId,
    createdAt: file.createdAt,
    embedded: false,
  };

  if (!file.storageKey) {
    row.embedSkipReason = 'missing';
    return row;
  }

  try {
    const absolute = resolveStoragePath(file.storageKey);
    const stat = await fs.stat(absolute);
    if (stat.size > embedBudget.maxFile) {
      row.embedSkipReason = 'too_large';
      return row;
    }
    if (embedBudget.used + stat.size > embedBudget.maxTotal) {
      row.embedSkipReason = 'budget';
      return row;
    }
    const content = await fs.readFile(absolute);
    row.contentBase64 = content.toString('base64');
    row.embedded = true;
    row.size = content.length;
    embedBudget.used += content.length;

    if (file.thumbStorageKey) {
      try {
        const thumb = await fs.readFile(resolveStoragePath(file.thumbStorageKey));
        row.thumbContentBase64 = thumb.toString('base64');
      } catch {
        // Thumb is optional.
      }
    }
  } catch {
    row.embedSkipReason = 'missing';
  }
  return row;
}

async function backupProject(project, embedBudget) {
  const [statuses, labels, components, members, sprints, issues, templates, recurringTasks, automationRules] = await Promise.all([
    Status.findAll({ where: { projectId: project.id }, order: [['position', 'ASC']] }),
    Label.findAll({ where: { projectId: project.id }, order: [['name', 'ASC']] }),
    Component.findAll({ where: { projectId: project.id }, order: [['name', 'ASC']] }),
    ProjectMember.findAll({
      where: { projectId: project.id },
      include: [{ model: User, as: 'user', attributes: USER_SUMMARY_ATTRIBUTES }],
    }),
    Sprint.findAll({ where: { projectId: project.id }, order: [['startDate', 'ASC']] }),
    Issue.findAll({
      where: { projectId: project.id },
      include: [
        { model: Label, as: 'labels', attributes: ['id', 'name', 'color'], through: { attributes: [] } },
        { model: Component, as: 'component', attributes: ['id', 'name', 'color', 'description'] },
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
    components: components.map((component) => ({
      id: component.id,
      name: component.name,
      description: component.description,
      color: component.color,
    })),
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
    issues: await Promise.all(
      issues.map(async (issue) => ({
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
        componentId: issue.componentId ?? null,
        component: issue.component
          ? { id: issue.component.id, name: issue.component.name, color: issue.component.color, description: issue.component.description }
          : null,
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
        attachments: await Promise.all((issue.attachments ?? []).map((file) => serializeAttachment(file, embedBudget))),
        links: linksBySource.get(issue.id) ?? [],
      })),
    ),
  };
}

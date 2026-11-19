import multer from 'multer';
import {
  AutomationRule,
  Comment,
  Department,
  Issue,
  IssueLabel,
  IssueLink,
  IssueTemplate,
  IssueWatcher,
  Label,
  OrganizationMember,
  Project,
  ProjectMember,
  RecurringTask,
  Sprint,
  Status,
  Team,
  TeamMember,
  User,
  WorkLog,
} from '../../database/models.js';
import { writeTransaction } from '../../database/connection.js';
import { ApiError } from '../../shared/errors/api-error.js';
import { ISSUE_PRIORITIES, ISSUE_TYPES } from '../issues/issue.model.js';
import { ISSUE_LINK_TYPES } from '../issues/issue-relations.model.js';
import { entitlementsFor, usageFor } from '../plans/plan.service.js';
import { PROJECT_TYPES, DEFAULT_PROJECT_SETTINGS } from '../projects/project.model.js';
import { SPRINT_STATES } from '../sprints/sprint.model.js';
import { STATUS_CATEGORIES } from '../statuses/status.model.js';
import { USER_SUMMARY_ATTRIBUTES } from '../users/user.model.js';
import { RECURRING_FREQUENCIES } from '../recurring-tasks/recurring-task.model.js';

export const BACKUP_IMPORT_MAX_BYTES = 25 * 1024 * 1024;
const FORMAT = 'vector-org-backup';
const VERSION = 1;

export const backupUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: BACKUP_IMPORT_MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    const name = (file.originalname || '').toLowerCase();
    const ok =
      file.mimetype === 'application/json' ||
      file.mimetype === 'application/octet-stream' ||
      file.mimetype === 'text/plain' ||
      name.endsWith('.json');
    cb(ok ? null : new ApiError(400, 'Upload a Vector organization backup (.json)'), ok);
  },
}).single('file');

/** Validates and returns a vector-org-backup payload (also used by unit tests). */
export function parseOrganizationBackup(bufferOrText) {
  let payload;
  try {
    payload = typeof bufferOrText === 'string' ? JSON.parse(bufferOrText) : JSON.parse(Buffer.from(bufferOrText).toString('utf8'));
  } catch {
    throw ApiError.badRequest('Backup file is not valid JSON');
  }
  if (!payload || payload.format !== FORMAT) {
    throw ApiError.badRequest('Not a Vector organization backup (expected format vector-org-backup)');
  }
  if (payload.version !== VERSION) {
    throw ApiError.badRequest(`Unsupported backup version ${payload.version}; this server imports version ${VERSION}`);
  }
  if (!Array.isArray(payload.projects)) throw ApiError.badRequest('Backup is missing projects');
  return payload;
}

function remapDeep(value, idMap) {
  if (typeof value === 'string' && idMap.has(value)) return idMap.get(value);
  if (Array.isArray(value)) return value.map((item) => remapDeep(item, idMap));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, item] of Object.entries(value)) out[key] = remapDeep(item, idMap);
    return out;
  }
  return value;
}

function pickEnum(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

function sanitizeKey(raw, max = 10) {
  const cleaned = String(raw || 'IMP')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, max);
  return cleaned || 'IMP';
}

async function allocateProjectKey(organizationId, preferred, transaction) {
  let base = sanitizeKey(preferred);
  const taken = new Set(
    (
      await Project.findAll({
        where: { organizationId },
        attributes: ['key'],
        raw: true,
        transaction,
      })
    ).map((row) => row.key),
  );
  if (!taken.has(base)) return base;
  for (let n = 2; n < 1000; n += 1) {
    const suffix = String(n);
    const candidate = `${base.slice(0, Math.max(1, 10 - suffix.length))}${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
  throw ApiError.badRequest(`Could not allocate a free project key for ${preferred}`);
}

function mapUser(brief, userIdMap, emailToUserId) {
  if (!brief) return null;
  if (brief.id && userIdMap.has(brief.id)) return userIdMap.get(brief.id);
  if (brief.email) {
    const id = emailToUserId.get(String(brief.email).toLowerCase());
    if (id) return id;
  }
  return null;
}

/**
 * Merge-import a Vector org backup into the current organization.
 * Creates new projects (new IDs/keys); matches people by email; skips attachment binaries and billing fields.
 */
export async function importOrganizationBackup(organization, actor, buffer) {
  const backup = parseOrganizationBackup(buffer);
  const warnings = [];
  const unknownEmails = new Set();
  let attachmentsSkipped = 0;
  let departmentsCreated = 0;
  let teamsCreated = 0;
  let projectsCreated = 0;
  let issuesCreated = 0;
  const remappedKeys = [];

  if (backup.organization?.id && backup.organization.id !== organization.id) {
    warnings.push(
      `Backup was exported from a different organization id (${backup.organization.slug || backup.organization.id}); importing as a merge into ${organization.slug}.`,
    );
  }

  const members = await OrganizationMember.findAll({
    where: { organizationId: organization.id, status: 'active' },
    include: [{ model: User, as: 'user', attributes: [...USER_SUMMARY_ATTRIBUTES, 'email'] }],
  });
  const emailToUserId = new Map();
  for (const membership of members) {
    if (membership.user?.email) emailToUserId.set(membership.user.email.toLowerCase(), membership.user.id);
  }

  const userIdMap = new Map();
  const rememberUser = (brief) => {
    if (!brief?.email) return;
    const email = String(brief.email).toLowerCase();
    const currentId = emailToUserId.get(email);
    if (!currentId) {
      unknownEmails.add(email);
      return;
    }
    if (brief.id) userIdMap.set(brief.id, currentId);
  };
  for (const row of backup.members ?? []) rememberUser(row.user);
  for (const project of backup.projects) {
    for (const member of project.members ?? []) rememberUser(member.user);
    for (const issue of project.issues ?? []) {
      rememberUser(issue.assignee);
      rememberUser(issue.reporter);
      for (const watcher of issue.watchers ?? []) rememberUser(watcher);
      for (const comment of issue.comments ?? []) rememberUser(comment.author);
      for (const log of issue.workLogs ?? []) rememberUser(log.user);
    }
    for (const task of project.recurringTasks ?? []) rememberUser(task.assignee);
  }

  const idMap = new Map(); // old UUID → new UUID (statuses, labels, sprints, issues, teams, …)

  const { planName, limits } = entitlementsFor(organization);
  if (limits.projects != null) {
    const usage = await usageFor(organization.id);
    if (usage.projects + backup.projects.length > limits.projects) {
      throw new ApiError(
        403,
        `Importing ${backup.projects.length} project(s) would exceed the ${planName} plan limit of ${limits.projects}. Archive or delete projects first, or upgrade.`,
        { code: 'plan_limit', limit: 'projects' },
      );
    }
  }

  await writeTransaction(async (transaction) => {
    // --- Departments & teams (by name) -----------------------------------------
    const existingDepartments = await Department.findAll({
      where: { organizationId: organization.id },
      include: [{ model: Team, as: 'teams' }],
      transaction,
    });
    const departmentByName = new Map(existingDepartments.map((department) => [department.name.toLowerCase(), department]));

    for (const dept of backup.departments ?? []) {
      let department = departmentByName.get(String(dept.name || '').toLowerCase());
      if (!department) {
        const headId = mapUser(dept.head, userIdMap, emailToUserId);
        department = await Department.create(
          {
            organizationId: organization.id,
            name: String(dept.name).slice(0, 80),
            headId,
          },
          { transaction },
        );
        departmentByName.set(department.name.toLowerCase(), department);
        departmentsCreated += 1;
      }
      if (dept.id) idMap.set(dept.id, department.id);

      const teamByName = new Map((department.teams ?? []).map((team) => [team.name.toLowerCase(), team]));
      for (const team of dept.teams ?? []) {
        let existing = teamByName.get(String(team.name || '').toLowerCase());
        if (!existing) {
          existing = await Team.create(
            {
              organizationId: organization.id,
              departmentId: department.id,
              name: String(team.name).slice(0, 80),
            },
            { transaction },
          );
          const memberIds = [...new Set((team.members ?? []).map((brief) => mapUser(brief, userIdMap, emailToUserId)).filter(Boolean))];
          if (memberIds.length) {
            await TeamMember.bulkCreate(
              memberIds.map((userId) => ({ teamId: existing.id, userId })),
              { transaction, ignoreDuplicates: true },
            );
          }
          teamByName.set(existing.name.toLowerCase(), existing);
          teamsCreated += 1;
        }
        if (team.id) idMap.set(team.id, existing.id);
      }
    }

    // --- Projects --------------------------------------------------------------
    for (const projectBackup of backup.projects) {
      const key = await allocateProjectKey(organization.id, projectBackup.key, transaction);
      if (key !== projectBackup.key) remappedKeys.push({ from: projectBackup.key, to: key });

      const leadId =
        mapUser(
          projectBackup.members?.find((member) => member.userId === projectBackup.leadId)?.user ||
            { id: projectBackup.leadId },
          userIdMap,
          emailToUserId,
        ) || actor.id;

      const teamId = projectBackup.teamId && idMap.has(projectBackup.teamId) ? idMap.get(projectBackup.teamId) : null;
      const settings = {
        ...DEFAULT_PROJECT_SETTINGS,
        ...(projectBackup.settings && typeof projectBackup.settings === 'object' ? projectBackup.settings : {}),
      };
      if (settings.defaultAssigneeId && userIdMap.has(settings.defaultAssigneeId)) {
        settings.defaultAssigneeId = userIdMap.get(settings.defaultAssigneeId);
      } else {
        settings.defaultAssigneeId = null;
      }
      settings.lastRoundRobinUserId = null;

      const project = await Project.create(
        {
          organizationId: organization.id,
          key,
          name: String(projectBackup.name || key).slice(0, 120),
          description: projectBackup.description ?? null,
          type: pickEnum(projectBackup.type, PROJECT_TYPES, 'kanban'),
          color: projectBackup.color || '#6366f1',
          leadId,
          teamId,
          settings,
          archivedAt: projectBackup.archivedAt ?? null,
          issueCounter: 0,
        },
        { transaction },
      );
      projectsCreated += 1;

      // Statuses
      const statusRows = Array.isArray(projectBackup.statuses) ? projectBackup.statuses : [];
      if (!statusRows.length) {
        throw ApiError.badRequest(`Project ${projectBackup.key} has no statuses in the backup`);
      }
      for (const [index, status] of statusRows.entries()) {
        const created = await Status.create(
          {
            projectId: project.id,
            name: String(status.name || `Status ${index + 1}`).slice(0, 60),
            category: pickEnum(status.category, STATUS_CATEGORIES, 'todo'),
            color: status.color || '#64748b',
            position: Number.isFinite(status.position) ? status.position : index,
            wipLimit: status.wipLimit ?? null,
          },
          { transaction },
        );
        if (status.id) idMap.set(status.id, created.id);
      }
      const fallbackStatusId = idMap.get(statusRows[0].id) || (await Status.findOne({ where: { projectId: project.id }, transaction })).id;

      // Labels
      for (const label of projectBackup.labels ?? []) {
        const created = await Label.create(
          {
            projectId: project.id,
            name: String(label.name || 'Label').slice(0, 40),
            color: label.color || '#64748b',
          },
          { transaction },
        );
        if (label.id) idMap.set(label.id, created.id);
      }

      // Sprints
      for (const sprint of projectBackup.sprints ?? []) {
        const created = await Sprint.create(
          {
            projectId: project.id,
            name: String(sprint.name || 'Sprint').slice(0, 120),
            goal: sprint.goal ?? null,
            state: pickEnum(sprint.state, SPRINT_STATES, 'planned'),
            startDate: sprint.startDate ?? null,
            endDate: sprint.endDate ?? null,
          },
          { transaction },
        );
        if (sprint.id) idMap.set(sprint.id, created.id);
      }

      // Project members
      const memberRows = [{ userId: actor.id, role: 'admin' }];
      for (const member of projectBackup.members ?? []) {
        const userId = mapUser(member.user || { id: member.userId }, userIdMap, emailToUserId);
        if (!userId) continue;
        if (memberRows.some((row) => row.userId === userId)) continue;
        memberRows.push({
          userId,
          role: member.role === 'admin' || member.role === 'viewer' ? member.role : 'member',
          viaTeam: Boolean(member.viaTeam),
        });
      }
      await ProjectMember.bulkCreate(
        memberRows.map((row) => ({ projectId: project.id, userId: row.userId, role: row.role, viaTeam: Boolean(row.viaTeam) })),
        { transaction, ignoreDuplicates: true },
      );

      // Issues (parents first by sorting: null parent first, then by number)
      const issues = [...(projectBackup.issues ?? [])].sort((a, b) => {
        if (!a.parentId && b.parentId) return -1;
        if (a.parentId && !b.parentId) return 1;
        return (a.number || 0) - (b.number || 0);
      });

      let maxNumber = 0;
      for (const issue of issues) {
        const number = Number(issue.number) || maxNumber + 1;
        maxNumber = Math.max(maxNumber, number);
        const statusId = (issue.statusId && idMap.get(issue.statusId)) || fallbackStatusId;
        const sprintId = issue.sprintId && idMap.has(issue.sprintId) ? idMap.get(issue.sprintId) : null;
        const parentId = issue.parentId && idMap.has(issue.parentId) ? idMap.get(issue.parentId) : null;
        const assigneeId = mapUser(issue.assignee || { id: issue.assigneeId }, userIdMap, emailToUserId);
        const reporterId =
          mapUser(issue.reporter || { id: issue.reporterId }, userIdMap, emailToUserId) || actor.id;

        const created = await Issue.create(
          {
            projectId: project.id,
            number,
            key: `${key}-${number}`,
            title: String(issue.title || 'Untitled').slice(0, 255),
            description: issue.description ?? null,
            type: pickEnum(issue.type, ISSUE_TYPES, 'task'),
            priority: pickEnum(issue.priority, ISSUE_PRIORITIES, 'medium'),
            statusId,
            assigneeId,
            reporterId,
            parentId,
            sprintId,
            storyPoints: issue.storyPoints ?? null,
            estimateMinutes: issue.estimateMinutes ?? null,
            startDate: issue.startDate ?? null,
            dueDate: issue.dueDate ?? null,
            position: Number.isFinite(issue.position) ? issue.position : number,
            completedAt: issue.completedAt ?? null,
          },
          { transaction },
        );
        if (issue.id) idMap.set(issue.id, created.id);
        issuesCreated += 1;

        const labelIds = (issue.labels ?? [])
          .map((label) => (label.id && idMap.get(label.id)) || null)
          .filter(Boolean);
        if (labelIds.length) {
          await IssueLabel.bulkCreate(
            labelIds.map((labelId) => ({ issueId: created.id, labelId })),
            { transaction, ignoreDuplicates: true },
          );
        }

        const watcherIds = [...new Set((issue.watchers ?? []).map((brief) => mapUser(brief, userIdMap, emailToUserId)).filter(Boolean))];
        if (watcherIds.length) {
          await IssueWatcher.bulkCreate(
            watcherIds.map((userId) => ({ issueId: created.id, userId })),
            { transaction, ignoreDuplicates: true },
          );
        }

        for (const comment of issue.comments ?? []) {
          if (!comment.body) continue;
          await Comment.create(
            {
              issueId: created.id,
              authorId: mapUser(comment.author, userIdMap, emailToUserId) || actor.id,
              body: String(comment.body),
            },
            { transaction },
          );
        }

        for (const log of issue.workLogs ?? []) {
          const minutes = Number(log.minutes);
          if (!Number.isFinite(minutes) || minutes < 1) continue;
          await WorkLog.create(
            {
              issueId: created.id,
              userId: mapUser(log.user, userIdMap, emailToUserId) || actor.id,
              minutes: Math.min(Math.floor(minutes), 24 * 60),
              note: log.note ? String(log.note).slice(0, 500) : null,
              loggedAt: log.loggedAt || log.createdAt || new Date(),
            },
            { transaction },
          );
        }

        attachmentsSkipped += (issue.attachments ?? []).length;
      }

      await project.update({ issueCounter: maxNumber }, { transaction });

      // Issue links (after all issues exist)
      for (const issue of issues) {
        const sourceId = issue.id && idMap.get(issue.id);
        if (!sourceId) continue;
        for (const link of issue.links ?? []) {
          const targetId = link.targetIssueId && idMap.get(link.targetIssueId);
          if (!targetId || targetId === sourceId) continue;
          await IssueLink.findOrCreate({
            where: {
              sourceIssueId: sourceId,
              targetIssueId: targetId,
              type: pickEnum(link.type, ISSUE_LINK_TYPES, 'relates_to'),
            },
            defaults: { createdById: actor.id },
            transaction,
          });
        }
      }

      // Templates
      for (const template of projectBackup.templates ?? []) {
        const labelIds = (template.labelIds ?? []).map((id) => idMap.get(id)).filter(Boolean);
        await IssueTemplate.create(
          {
            projectId: project.id,
            name: String(template.name || 'Template').slice(0, 120),
            issueType: pickEnum(template.issueType, ISSUE_TYPES, 'task'),
            titlePrefix: template.titlePrefix ?? null,
            body: template.body ?? null,
            priority: pickEnum(template.priority, ISSUE_PRIORITIES, 'medium'),
            storyPoints: template.storyPoints ?? null,
            labelIds,
            subtaskTitles: Array.isArray(template.subtaskTitles) ? template.subtaskTitles : [],
            createdById: actor.id,
          },
          { transaction },
        );
      }

      // Recurring tasks
      for (const task of projectBackup.recurringTasks ?? []) {
        const labelIds = (task.labelIds ?? []).map((id) => idMap.get(id)).filter(Boolean);
        await RecurringTask.create(
          {
            projectId: project.id,
            title: String(task.title || 'Recurring').slice(0, 255),
            description: task.description ?? null,
            issueType: pickEnum(task.issueType, ISSUE_TYPES, 'task'),
            priority: pickEnum(task.priority, ISSUE_PRIORITIES, 'medium'),
            assigneeId: mapUser(task.assignee || { id: task.assigneeId }, userIdMap, emailToUserId),
            labelIds,
            frequency: pickEnum(task.frequency, RECURRING_FREQUENCIES, 'weekly'),
            dayOfWeek: task.dayOfWeek ?? null,
            dayOfMonth: task.dayOfMonth ?? null,
            timeOfDay: task.timeOfDay || '09:00',
            dueInDays: task.dueInDays ?? null,
            nextRunAt: task.nextRunAt || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            enabled: task.enabled !== false,
            createdById: actor.id,
          },
          { transaction },
        );
      }

      // Automations (remap UUIDs inside trigger payload)
      for (const rule of projectBackup.automationRules ?? []) {
        await AutomationRule.create(
          {
            projectId: project.id,
            name: String(rule.name || 'Rule').slice(0, 120),
            description: rule.description ?? null,
            enabled: rule.enabled !== false,
            trigger: String(rule.trigger || 'issue_created').slice(0, 40),
            conditions: remapDeep(rule.conditions ?? [], idMap),
            actions: remapDeep(rule.actions ?? [], idMap),
            runCount: 0,
            lastRunAt: null,
            lastError: null,
            recentRuns: [],
            createdById: actor.id,
          },
          { transaction },
        );
      }
    }
  });

  return {
    projectsCreated,
    issuesCreated,
    departmentsCreated,
    teamsCreated,
    remappedKeys,
    skipped: {
      attachments: attachmentsSkipped,
      unknownEmails: [...unknownEmails].slice(0, 50),
      billing: true,
      users: true,
    },
    warnings,
  };
}

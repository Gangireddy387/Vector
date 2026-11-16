import { Op } from 'sequelize';
import { likeOperator } from '../../database/connection.js';
import { Comment, Issue, IssueLabel, Label, Project, Status, User } from '../../database/models.js';
import { ISSUE_PRIORITIES, ISSUE_TYPES } from '../issues/issue.model.js';
import { getMemberProjectIds } from '../projects/project-access.js';
import { searchUsers } from '../users/user.service.js';
import { USER_SUMMARY_ATTRIBUTES } from '../users/user.model.js';
import { STATUS_CATEGORIES } from '../statuses/status.model.js';

/** Strip LIKE wildcards so a typed `%` or `_` is literal text, not a pattern. */
const sanitizeTerm = (q) => q.replace(/[%_]/g, ' ').trim();

const issueIncludes = [
  { model: Status, as: 'status', attributes: ['id', 'name', 'category', 'color'] },
  { model: User, as: 'assignee', attributes: USER_SUMMARY_ATTRIBUTES },
  { model: Project, as: 'project', attributes: ['id', 'key', 'name', 'color'] },
];

/**
 * Parses advanced operators from q and returns them plus the free-text remainder.
 * Supported: assignee:me|email, is:open|done|in_progress, project:KEY, type:bug|task|…, priority:high|…
 */
export function parseSearchOperators(raw) {
  const operators = {
    assignee: null,
    statusCategory: null,
    projectKey: null,
    type: null,
    priority: null,
  };
  const tokens = String(raw || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const textParts = [];

  for (const token of tokens) {
    const match = /^([a-z]+):(.+)$/i.exec(token);
    if (!match) {
      textParts.push(token);
      continue;
    }
    const key = match[1].toLowerCase();
    const value = match[2].trim();
    if (!value) {
      textParts.push(token);
      continue;
    }

    if (key === 'assignee') {
      operators.assignee = value.toLowerCase() === 'me' ? 'me' : value.toLowerCase();
      continue;
    }
    if (key === 'is') {
      const normalized = value.toLowerCase().replace('-', '_');
      if (normalized === 'open') {
        operators.statusCategory = 'open';
        continue;
      }
      if (STATUS_CATEGORIES.includes(normalized)) {
        operators.statusCategory = normalized;
        continue;
      }
    }
    if (key === 'project') {
      operators.projectKey = value.toUpperCase();
      continue;
    }
    if (key === 'type') {
      const type = value.toLowerCase();
      if (ISSUE_TYPES.includes(type)) {
        operators.type = type;
        continue;
      }
    }
    if (key === 'priority') {
      const priority = value.toLowerCase();
      if (ISSUE_PRIORITIES.includes(priority)) {
        operators.priority = priority;
        continue;
      }
    }
    textParts.push(token);
  }

  return { operators, text: textParts.join(' ').trim() };
}

function scoreIssue(issue, q) {
  if (!q) return { score: 20, matchedOn: 'filter' };
  const needle = q.toLowerCase();
  const key = String(issue.key || '').toLowerCase();
  const title = String(issue.title || '').toLowerCase();
  if (key === needle) return { score: 100, matchedOn: 'key' };
  if (key.startsWith(needle) || key.includes(needle)) return { score: 90, matchedOn: 'key' };
  if (title === needle) return { score: 80, matchedOn: 'title' };
  if (title.includes(needle)) return { score: 70, matchedOn: 'title' };
  if (String(issue.description || '').toLowerCase().includes(needle)) return { score: 50, matchedOn: 'description' };
  if (issue._matchedOn === 'comment') return { score: 40, matchedOn: 'comment' };
  if (issue._matchedOn === 'label') return { score: 35, matchedOn: 'label' };
  return { score: 10, matchedOn: 'title' };
}

async function resolveAssigneeId(userId, assignee) {
  if (!assignee) return null;
  if (assignee === 'me') return userId;
  if (assignee === 'unassigned' || assignee === 'none') return 'unassigned';
  const people = await searchUsers(userId, { q: assignee });
  const exact = people.find((person) => person.email?.toLowerCase() === assignee || person.name?.toLowerCase() === assignee);
  return exact?.id ?? people[0]?.id ?? null;
}

async function searchIssues(userId, projectIds, q, operators, limit) {
  if (!projectIds.length) return [];

  let scopedProjectIds = projectIds;
  if (operators.projectKey) {
    const projects = await Project.findAll({
      where: { id: projectIds, key: { [likeOperator]: operators.projectKey } },
      attributes: ['id', 'key'],
    });
    // Prefer exact key match (case-insensitive).
    const exact = projects.filter((project) => project.key.toUpperCase() === operators.projectKey);
    scopedProjectIds = (exact.length ? exact : projects).map((project) => project.id);
    if (!scopedProjectIds.length) return [];
  }

  const where = { projectId: scopedProjectIds };
  if (operators.type) where.type = operators.type;
  if (operators.priority) where.priority = operators.priority;

  if (operators.assignee) {
    const assigneeId = await resolveAssigneeId(userId, operators.assignee);
    if (assigneeId === 'unassigned') where.assigneeId = null;
    else if (assigneeId) where.assigneeId = assigneeId;
    else return [];
  }

  if (operators.statusCategory) {
    const statusWhere =
      operators.statusCategory === 'open'
        ? { projectId: scopedProjectIds, category: { [Op.ne]: 'done' } }
        : { projectId: scopedProjectIds, category: operators.statusCategory };
    const statuses = await Status.findAll({ where: statusWhere, attributes: ['id'], raw: true });
    if (!statuses.length) return [];
    where.statusId = statuses.map((status) => status.id);
  }

  const text = sanitizeTerm(q);
  const hasText = Boolean(text);
  const term = hasText ? `%${text}%` : null;

  // Operators alone are enough to search; free text optionally narrows.
  const [direct, commentHits, labelHits] = await Promise.all([
    Issue.findAll({
      where: hasText
        ? {
            ...where,
            [Op.or]: [
              { title: { [likeOperator]: term } },
              { key: { [likeOperator]: term } },
              { description: { [likeOperator]: term } },
            ],
          }
        : where,
      attributes: ['id', 'key', 'title', 'description', 'type', 'priority', 'projectId', 'updatedAt'],
      include: issueIncludes,
      order: [['updatedAt', 'DESC']],
      limit: limit * 2,
    }),
    hasText
      ? Comment.findAll({
          where: { body: { [likeOperator]: term } },
          attributes: ['issueId'],
          include: [{ model: Issue, as: 'issue', attributes: ['id'], where, required: true }],
          limit: 40,
          order: [['updatedAt', 'DESC']],
        })
      : Promise.resolve([]),
    hasText
      ? Label.findAll({
          where: { projectId: scopedProjectIds, name: { [likeOperator]: term } },
          attributes: ['id'],
          limit: 20,
        })
      : Promise.resolve([]),
  ]);

  const byId = new Map();
  for (const issue of direct) {
    byId.set(issue.id, issue);
  }

  const commentIssueIds = [...new Set(commentHits.map((row) => row.issueId).filter((id) => !byId.has(id)))];
  const labelIds = labelHits.map((label) => label.id);
  let labelIssueIds = [];
  if (labelIds.length) {
    const tagged = await IssueLabel.findAll({ where: { labelId: labelIds }, attributes: ['issueId'], raw: true });
    labelIssueIds = [...new Set(tagged.map((row) => row.issueId).filter((id) => !byId.has(id) && !commentIssueIds.includes(id)))];
  }

  const extraIds = [...commentIssueIds, ...labelIssueIds].slice(0, limit * 2);
  if (extraIds.length) {
    const extras = await Issue.findAll({
      where: { id: extraIds, ...where },
      attributes: ['id', 'key', 'title', 'description', 'type', 'priority', 'projectId', 'updatedAt'],
      include: issueIncludes,
    });
    const commentSet = new Set(commentIssueIds);
    const labelSet = new Set(labelIssueIds);
    for (const issue of extras) {
      issue._matchedOn = commentSet.has(issue.id) ? 'comment' : labelSet.has(issue.id) ? 'label' : 'title';
      byId.set(issue.id, issue);
    }
  }

  return [...byId.values()]
    .map((issue) => {
      const { score, matchedOn } = scoreIssue(issue, text);
      return {
        id: issue.id,
        key: issue.key,
        title: issue.title,
        type: issue.type,
        priority: issue.priority,
        projectId: issue.projectId,
        status: issue.status,
        assignee: issue.assignee,
        project: issue.project,
        matchedOn,
        _score: score,
        _updatedAt: issue.updatedAt,
      };
    })
    .sort((a, b) => b._score - a._score || new Date(b._updatedAt) - new Date(a._updatedAt))
    .slice(0, limit)
    .map(({ _score, _updatedAt, ...rest }) => rest);
}

export async function globalSearch(userId, { q, limit, scope = 'all' }) {
  const { operators, text } = parseSearchOperators(q);
  const hasOperators = Object.values(operators).some(Boolean);
  const projectIds = await getMemberProjectIds(userId);
  const wantIssues = scope === 'all' || scope === 'issues';
  const wantProjects = scope === 'all' || scope === 'projects';
  const wantPeople = scope === 'all' || scope === 'people';
  const freeText = text || (!hasOperators ? sanitizeTerm(q) : '');
  const term = freeText ? `%${sanitizeTerm(freeText)}%` : null;

  // Issue operators only apply to the issues pane; projects/people still use free text.
  const [issues, projects, people] = await Promise.all([
    wantIssues && (freeText || hasOperators) ? searchIssues(userId, projectIds, freeText, operators, limit) : Promise.resolve([]),
    wantProjects && projectIds.length && term && term !== '%%'
      ? Project.findAll({
          where: {
            id: projectIds,
            ...(operators.projectKey ? { key: { [likeOperator]: operators.projectKey } } : {}),
            [Op.or]: [{ name: { [likeOperator]: term } }, { key: { [likeOperator]: term } }],
          },
          attributes: ['id', 'key', 'name', 'color', 'type'],
          limit: scope === 'projects' ? limit : 5,
        })
      : wantProjects && operators.projectKey && projectIds.length
        ? Project.findAll({
            where: { id: projectIds, key: { [likeOperator]: operators.projectKey } },
            attributes: ['id', 'key', 'name', 'color', 'type'],
            limit: scope === 'projects' ? limit : 5,
          })
        : Promise.resolve([]),
    wantPeople && freeText ? searchUsers(userId, { q: freeText }).then((rows) => rows.slice(0, scope === 'people' ? limit : 5)) : Promise.resolve([]),
  ]);

  return { issues, projects, people };
}

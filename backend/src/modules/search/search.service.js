import { Op } from 'sequelize';
import { likeOperator } from '../../database/connection.js';
import { Comment, Issue, IssueLabel, Label, Project, Status, User } from '../../database/models.js';
import { getMemberProjectIds } from '../projects/project-access.js';
import { searchUsers } from '../users/user.service.js';
import { USER_SUMMARY_ATTRIBUTES } from '../users/user.model.js';

/** Strip LIKE wildcards so a typed `%` or `_` is literal text, not a pattern. */
const sanitizeTerm = (q) => q.replace(/[%_]/g, ' ').trim();

const issueIncludes = [
  { model: Status, as: 'status', attributes: ['id', 'name', 'category', 'color'] },
  { model: User, as: 'assignee', attributes: USER_SUMMARY_ATTRIBUTES },
  { model: Project, as: 'project', attributes: ['id', 'key', 'name', 'color'] },
];

function scoreIssue(issue, q) {
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

async function searchIssues(projectIds, q, limit) {
  if (!projectIds.length) return [];

  const term = `%${sanitizeTerm(q)}%`;
  if (term === '%%') return [];

  const [direct, commentHits, labelHits] = await Promise.all([
    Issue.findAll({
      where: {
        projectId: projectIds,
        [Op.or]: [
          { title: { [likeOperator]: term } },
          { key: { [likeOperator]: term } },
          { description: { [likeOperator]: term } },
        ],
      },
      attributes: ['id', 'key', 'title', 'description', 'type', 'priority', 'projectId', 'updatedAt'],
      include: issueIncludes,
      order: [['updatedAt', 'DESC']],
      limit: limit * 2,
    }),
    Comment.findAll({
      where: { body: { [likeOperator]: term } },
      attributes: ['issueId'],
      include: [{ model: Issue, as: 'issue', attributes: ['id'], where: { projectId: projectIds }, required: true }],
      limit: 40,
      order: [['updatedAt', 'DESC']],
    }),
    Label.findAll({
      where: { projectId: projectIds, name: { [likeOperator]: term } },
      attributes: ['id'],
      limit: 20,
    }),
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
      where: { id: extraIds, projectId: projectIds },
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
      const { score, matchedOn } = scoreIssue(issue, q);
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
  const projectIds = await getMemberProjectIds(userId);
  const wantIssues = scope === 'all' || scope === 'issues';
  const wantProjects = scope === 'all' || scope === 'projects';
  const wantPeople = scope === 'all' || scope === 'people';
  const term = `%${sanitizeTerm(q)}%`;

  const [issues, projects, people] = await Promise.all([
    wantIssues ? searchIssues(projectIds, q, limit) : Promise.resolve([]),
    wantProjects && projectIds.length && term !== '%%'
      ? Project.findAll({
          where: { id: projectIds, [Op.or]: [{ name: { [likeOperator]: term } }, { key: { [likeOperator]: term } }] },
          attributes: ['id', 'key', 'name', 'color', 'type'],
          limit: scope === 'projects' ? limit : 5,
        })
      : Promise.resolve([]),
    wantPeople ? searchUsers(userId, { q }).then((rows) => rows.slice(0, scope === 'people' ? limit : 5)) : Promise.resolve([]),
  ]);

  return { issues, projects, people };
}

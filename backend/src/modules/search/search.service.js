import { Op } from 'sequelize';
import { likeOperator } from '../../database/connection.js';
import {
  Channel,
  ChatMessage,
  Comment,
  Conversation,
  ConversationMember,
  ConversationMessage,
  Department,
  Issue,
  IssueLabel,
  Label,
  Organization,
  Project,
  Status,
  Team,
  User,
  WikiPage,
} from '../../database/models.js';
import { currentOrganizationId } from '../../shared/context/request-context.js';
import { ISSUE_PRIORITIES, ISSUE_TYPES } from '../issues/issue.model.js';
import { entitlementsFor, withPlan } from '../plans/plan.service.js';
import { getMemberProjectIds } from '../projects/project-access.js';
import { searchUsers } from '../users/user.service.js';
import { USER_SUMMARY_ATTRIBUTES } from '../users/user.model.js';
import { STATUS_CATEGORIES } from '../statuses/status.model.js';
import {
  CHAT_VECTOR,
  ISSUE_VECTOR,
  MESSAGE_VECTOR,
  PROJECT_VECTOR,
  WIKI_VECTOR,
  ftsMatch,
  ftsRank,
  isPostgres,
  rankBonus,
  recencyBoost,
  sanitizeFtsTerm,
} from './search-fts.js';

const previewText = (text, max = 140) =>
  String(text || '')
    .replace(/@\[([^\]]+)\]\([0-9a-f-]{36}\)/gi, '@$1')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);

/** Strip LIKE wildcards so a typed `%` or `_` is literal text, not a pattern. */
const sanitizeTerm = (q) => sanitizeFtsTerm(q);

const issueIncludes = [
  { model: Status, as: 'status', attributes: ['id', 'name', 'category', 'color'] },
  { model: User, as: 'assignee', attributes: USER_SUMMARY_ATTRIBUTES },
  { model: Project, as: 'project', attributes: ['id', 'key', 'name', 'color'] },
];

/** Text match: FTS when Postgres, else ILIKE/LIKE; always OR title/key substring for keys like SRC-12. */
function textMatchClause(vectorSql, columns, text) {
  const term = `%${text}%`;
  const likes = columns.map((column) => ({ [column]: { [likeOperator]: term } }));
  if (!isPostgres || !vectorSql) return { [Op.or]: likes };
  return { [Op.or]: [ftsMatch(vectorSql, text), ...likes] };
}

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
  const freshness = recencyBoost(issue.updatedAt);
  const fts = rankBonus(issue.get?.('rank') ?? issue.dataValues?.rank ?? issue.rank);
  if (!q) return { score: 20 + freshness, matchedOn: 'filter' };
  const needle = q.toLowerCase();
  const key = String(issue.key || '').toLowerCase();
  const title = String(issue.title || '').toLowerCase();
  if (key === needle) return { score: 100 + freshness + fts, matchedOn: 'key' };
  if (key.startsWith(needle) || key.includes(needle)) return { score: 90 + freshness + fts, matchedOn: 'key' };
  if (title === needle) return { score: 80 + freshness + fts, matchedOn: 'title' };
  if (title.includes(needle)) return { score: 70 + freshness + fts, matchedOn: 'title' };
  if (String(issue.description || '').toLowerCase().includes(needle)) {
    return { score: 50 + freshness + fts, matchedOn: 'description' };
  }
  if (issue._matchedOn === 'comment') return { score: 40 + freshness, matchedOn: 'comment' };
  if (issue._matchedOn === 'label') return { score: 35 + freshness, matchedOn: 'label' };
  // FTS hit that substring heuristics missed (stemming) — still surface as title-ish.
  if (fts > 0) return { score: 55 + freshness + fts, matchedOn: 'title' };
  return { score: 10 + freshness, matchedOn: 'title' };
}

async function resolveAssigneeId(userId, assignee) {
  if (!assignee) return null;
  if (assignee === 'me') return userId;
  if (assignee === 'unassigned' || assignee === 'none') return 'unassigned';
  const people = await searchUsers(userId, { q: assignee });
  const exact = people.find((person) => person.email?.toLowerCase() === assignee || person.name?.toLowerCase() === assignee);
  return exact?.id ?? people[0]?.id ?? null;
}

async function searchIssues(userId, projectIds, q, operators, limit, offset = 0) {
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
  /** Pull enough ranked candidates so offset pages still have results to slice. */
  const candidateLimit = Math.min(200, Math.max(limit * 2, offset + limit));

  const issueAttributes = ['id', 'key', 'title', 'description', 'type', 'priority', 'projectId', 'updatedAt'];
  if (hasText && isPostgres) {
    issueAttributes.push([ftsRank(ISSUE_VECTOR, text), 'rank']);
  }

  // Operators alone are enough to search; free text optionally narrows (FTS + substring).
  const [direct, commentHits, labelHits] = await Promise.all([
    Issue.findAll({
      where: hasText ? { ...where, ...textMatchClause(ISSUE_VECTOR, ['title', 'key', 'description'], text) } : where,
      attributes: issueAttributes,
      include: issueIncludes,
      order: hasText && isPostgres ? [[ftsRank(ISSUE_VECTOR, text), 'DESC'], ['updatedAt', 'DESC']] : [['updatedAt', 'DESC']],
      limit: candidateLimit,
    }),
    hasText
      ? Comment.findAll({
          where: { body: { [likeOperator]: term } },
          attributes: ['issueId'],
          include: [{ model: Issue, as: 'issue', attributes: ['id'], where, required: true }],
          limit: Math.min(80, candidateLimit),
          order: [['updatedAt', 'DESC']],
        })
      : Promise.resolve([]),
    hasText
      ? Label.findAll({
          where: { projectId: scopedProjectIds, name: { [likeOperator]: term } },
          attributes: ['id'],
          limit: 40,
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

  const extraIds = [...commentIssueIds, ...labelIssueIds].slice(0, candidateLimit);
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
    .slice(offset, offset + limit)
    .map(({ _score, _updatedAt, ...rest }) => rest);
}

async function conversationTitles(userId, conversations) {
  const titles = new Map();
  if (!conversations.length) return titles;

  const directs = conversations.filter((row) => row.kind === 'direct');
  const teams = conversations.filter((row) => row.kind === 'team' && row.teamId);
  const departments = conversations.filter((row) => row.kind === 'department' && row.departmentId);
  const channels = conversations.filter((row) => row.kind === 'channel' && row.channelId);

  const [otherMembers, teamRows, departmentRows, channelRows] = await Promise.all([
    directs.length
      ? ConversationMember.findAll({
          where: { conversationId: directs.map((row) => row.id), userId: { [Op.ne]: userId } },
          include: [{ model: User, as: 'user', attributes: ['id', 'name'] }],
        })
      : [],
    teams.length ? Team.findAll({ where: { id: teams.map((row) => row.teamId) }, attributes: ['id', 'name'] }) : [],
    departments.length
      ? Department.findAll({ where: { id: departments.map((row) => row.departmentId) }, attributes: ['id', 'name'] })
      : [],
    channels.length ? Channel.findAll({ where: { id: channels.map((row) => row.channelId) }, attributes: ['id', 'name'] }) : [],
  ]);

  for (const member of otherMembers) titles.set(member.conversationId, member.user?.name ?? 'Direct message');
  const teamById = new Map(teamRows.map((row) => [row.id, row.name]));
  const deptById = new Map(departmentRows.map((row) => [row.id, row.name]));
  const channelById = new Map(channelRows.map((row) => [row.id, row.name]));
  for (const row of teams) titles.set(row.id, teamById.get(row.teamId) ?? 'Team');
  for (const row of departments) titles.set(row.id, deptById.get(row.departmentId) ?? 'Department');
  for (const row of channels) titles.set(row.id, channelById.get(row.channelId) ?? 'Channel');
  for (const row of conversations) if (!titles.has(row.id)) titles.set(row.id, 'Conversation');
  return titles;
}

async function searchMessages(userId, q, limit, offset = 0) {
  const text = sanitizeTerm(q);
  if (!text) return [];

  const organizationId = currentOrganizationId();
  const memberships = await ConversationMember.findAll({
    where: { userId },
    attributes: ['conversationId', 'clearedAt'],
    raw: true,
  });
  if (!memberships.length) return [];

  const conversations = await Conversation.findAll({
    where: {
      id: memberships.map((row) => row.conversationId),
      ...(organizationId ? { organizationId } : {}),
    },
    attributes: ['id', 'kind', 'teamId', 'departmentId', 'channelId'],
  });
  if (!conversations.length) return [];

  const conversationIds = conversations.map((row) => row.id);
  const allowed = new Set(conversationIds);
  const clearedByConversation = new Map(
    memberships.filter((row) => allowed.has(row.conversationId)).map((row) => [row.conversationId, row.clearedAt]),
  );
  const candidateLimit = Math.min(120, Math.max(limit * 2, offset + limit));
  const messageAttributes = ['id', 'conversationId', 'subject', 'body', 'createdAt'];
  if (isPostgres) messageAttributes.push([ftsRank(MESSAGE_VECTOR, text), 'rank']);

  const rows = await ConversationMessage.findAll({
    where: {
      conversationId: conversationIds,
      deletedAt: null,
      ...textMatchClause(MESSAGE_VECTOR, ['body', 'subject'], text),
    },
    attributes: messageAttributes,
    include: [{ model: User, as: 'author', attributes: USER_SUMMARY_ATTRIBUTES }],
    order: isPostgres
      ? [[ftsRank(MESSAGE_VECTOR, text), 'DESC'], ['createdAt', 'DESC']]
      : [['createdAt', 'DESC']],
    limit: candidateLimit,
  });

  const visible = rows
    .filter((row) => {
      const clearedAt = clearedByConversation.get(row.conversationId);
      return !clearedAt || new Date(row.createdAt) > new Date(clearedAt);
    })
    .map((row) => {
      const needle = text.toLowerCase();
      const subjectHit = String(row.subject || '')
        .toLowerCase()
        .includes(needle);
      const score =
        (subjectHit ? 70 : 40) +
        rankBonus(row.get?.('rank') ?? row.dataValues?.rank) +
        recencyBoost(row.createdAt);
      return { row, score };
    })
    .sort((a, b) => b.score - a.score || new Date(b.row.createdAt) - new Date(a.row.createdAt));

  const byId = new Map(conversations.map((row) => [row.id, row]));
  const titles = await conversationTitles(userId, conversations);

  return visible.slice(offset, offset + limit).map(({ row }) => ({
    id: row.id,
    conversationId: row.conversationId,
    kind: byId.get(row.conversationId)?.kind ?? 'direct',
    title: titles.get(row.conversationId) ?? 'Conversation',
    subject: row.subject,
    snippet: previewText(row.subject ? `${row.subject}: ${row.body}` : row.body),
    author: row.author,
    createdAt: row.createdAt,
  }));
}

async function searchProjectChat(projectIds, q, limit, offset = 0) {
  const text = sanitizeTerm(q);
  if (!text || !projectIds.length) return [];

  const chatAttributes = ['id', 'projectId', 'body', 'createdAt'];
  if (isPostgres) chatAttributes.push([ftsRank(CHAT_VECTOR, text), 'rank']);
  /** Fetch a window then rank so offset pages stay meaningful. */
  const candidateLimit = Math.min(120, Math.max(limit * 2, offset + limit));

  const rows = await ChatMessage.findAll({
    where: { projectId: projectIds, ...textMatchClause(CHAT_VECTOR, ['body'], text) },
    attributes: chatAttributes,
    include: [
      { model: User, as: 'author', attributes: USER_SUMMARY_ATTRIBUTES },
      { model: Project, as: 'project', attributes: ['id', 'key', 'name', 'color'] },
    ],
    order: isPostgres ? [[ftsRank(CHAT_VECTOR, text), 'DESC'], ['createdAt', 'DESC']] : [['createdAt', 'DESC']],
    limit: candidateLimit,
  });

  return rows
    .map((row) => ({
      row,
      score: 40 + rankBonus(row.get?.('rank') ?? row.dataValues?.rank) + recencyBoost(row.createdAt),
    }))
    .sort((a, b) => b.score - a.score || new Date(b.row.createdAt) - new Date(a.row.createdAt))
    .slice(offset, offset + limit)
    .map(({ row }) => ({
      id: row.id,
      projectId: row.projectId,
      project: row.project,
      snippet: previewText(row.body),
      author: row.author,
      createdAt: row.createdAt,
    }));
}

async function searchWikiPages(q, limit, offset = 0) {
  const text = sanitizeTerm(q);
  const organizationId = currentOrganizationId();
  if (!text || !organizationId) return [];

  const organization = await Organization.findByPk(organizationId, { include: withPlan() });
  if (!organization || !entitlementsFor(organization).features.wiki) return [];

  const needle = text.toLowerCase();
  const wikiAttributes = ['id', 'title', 'body', 'updatedAt'];
  if (isPostgres) wikiAttributes.push([ftsRank(WIKI_VECTOR, text), 'rank']);

  const rows = await WikiPage.findAll({
    where: {
      organizationId,
      ...textMatchClause(WIKI_VECTOR, ['title', 'body'], text),
    },
    attributes: wikiAttributes,
    order: isPostgres ? [[ftsRank(WIKI_VECTOR, text), 'DESC'], ['updatedAt', 'DESC']] : [['updatedAt', 'DESC']],
    limit: Math.min(80, Math.max(limit * 3, offset + limit)),
  });

  return rows
    .map((page) => {
      const title = String(page.title || '');
      const body = String(page.body || '');
      const titleHit = title.toLowerCase().includes(needle);
      const base = titleHit ? (title.toLowerCase() === needle ? 100 : 80) : 50;
      const score = base + rankBonus(page.get?.('rank') ?? page.dataValues?.rank) + recencyBoost(page.updatedAt);
      return {
        id: page.id,
        title,
        excerpt: previewText(body, 160),
        matchedOn: titleHit ? 'title' : 'body',
        updatedAt: page.updatedAt,
        _score: score,
      };
    })
    .sort((a, b) => b._score - a._score || new Date(b.updatedAt) - new Date(a.updatedAt))
    .slice(offset, offset + limit)
    .map(({ _score, ...rest }) => rest);
}

export async function globalSearch(userId, { q, limit, offset = 0, scope = 'all' }) {
  const { operators, text } = parseSearchOperators(q);
  const hasOperators = Object.values(operators).some(Boolean);
  const projectIds = await getMemberProjectIds(userId);
  const wantIssues = scope === 'all' || scope === 'issues';
  const wantProjects = scope === 'all' || scope === 'projects';
  const wantPeople = scope === 'all' || scope === 'people';
  const wantMessages = scope === 'all' || scope === 'messages';
  const wantChat = scope === 'all' || scope === 'chat';
  const wantWiki = scope === 'all' || scope === 'wiki';
  const freeText = text || (!hasOperators ? sanitizeTerm(q) : '');
  const projectLimit = scope === 'projects' ? limit : 5;
  const peopleLimit = scope === 'people' ? limit : 5;
  const messageLimit = scope === 'messages' ? limit : 5;
  const chatLimit = scope === 'chat' ? limit : 5;
  const wikiLimit = scope === 'wiki' ? limit : 5;

  const projectText = sanitizeTerm(freeText);
  const searchProjects = async () => {
    if (!wantProjects || !projectIds.length) return [];
    if (projectText) {
      const projectAttributes = ['id', 'key', 'name', 'color', 'type', 'updatedAt'];
      if (isPostgres) projectAttributes.push([ftsRank(PROJECT_VECTOR, projectText), 'rank']);
      const rows = await Project.findAll({
        where: {
          id: projectIds,
          ...(operators.projectKey ? { key: { [likeOperator]: operators.projectKey } } : {}),
          ...textMatchClause(PROJECT_VECTOR, ['name', 'key'], projectText),
        },
        attributes: projectAttributes,
        order: isPostgres
          ? [[ftsRank(PROJECT_VECTOR, projectText), 'DESC'], ['updatedAt', 'DESC']]
          : [['updatedAt', 'DESC']],
        limit: Math.min(40, Math.max(projectLimit * 2, (scope === 'projects' ? offset : 0) + projectLimit)),
      });
      return rows
        .map((row) => {
          const needle = projectText.toLowerCase();
          const key = String(row.key || '').toLowerCase();
          const name = String(row.name || '').toLowerCase();
          let base = 40;
          if (key === needle || name === needle) base = 100;
          else if (key.includes(needle)) base = 90;
          else if (name.includes(needle)) base = 80;
          return {
            row,
            score: base + rankBonus(row.get?.('rank') ?? row.dataValues?.rank) + recencyBoost(row.updatedAt),
          };
        })
        .sort((a, b) => b.score - a.score)
        .slice(scope === 'projects' ? offset : 0, (scope === 'projects' ? offset : 0) + projectLimit)
        .map(({ row }) => ({ id: row.id, key: row.key, name: row.name, color: row.color, type: row.type }));
    }
    if (operators.projectKey) {
      return Project.findAll({
        where: { id: projectIds, key: { [likeOperator]: operators.projectKey } },
        attributes: ['id', 'key', 'name', 'color', 'type'],
        limit: projectLimit,
        offset: scope === 'projects' ? offset : 0,
      });
    }
    return [];
  };

  // Issue operators only apply to the issues pane; projects/people/messages still use free text.
  const [issues, projectRows, peopleRows, messageRows, chatRows, wikiRows] = await Promise.all([
    wantIssues && (freeText || hasOperators)
      ? searchIssues(userId, projectIds, freeText, operators, limit, offset)
      : Promise.resolve([]),
    searchProjects(),
    wantPeople && freeText
      ? searchUsers(userId, { q: freeText }).then((rows) =>
          scope === 'people' ? rows.slice(offset, offset + peopleLimit) : rows.slice(0, peopleLimit),
        )
      : Promise.resolve([]),
    wantMessages && freeText
      ? searchMessages(userId, freeText, messageLimit, scope === 'messages' ? offset : 0)
      : Promise.resolve([]),
    wantChat && freeText
      ? searchProjectChat(projectIds, freeText, chatLimit, scope === 'chat' ? offset : 0)
      : Promise.resolve([]),
    wantWiki && freeText ? searchWikiPages(freeText, wikiLimit, scope === 'wiki' ? offset : 0) : Promise.resolve([]),
  ]);

  return {
    issues,
    projects: projectRows,
    people: peopleRows,
    messages: messageRows,
    chat: chatRows,
    wiki: wikiRows,
    hasMore: {
      issues: wantIssues && issues.length === limit,
      projects: wantProjects && scope === 'projects' && projectRows.length === limit,
      people: wantPeople && scope === 'people' && peopleRows.length === limit,
      messages: wantMessages && (scope === 'messages' || scope === 'all') && messageRows.length === messageLimit,
      chat: wantChat && (scope === 'chat' || scope === 'all') && chatRows.length === chatLimit,
      wiki: wantWiki && (scope === 'wiki' || scope === 'all') && wikiRows.length === wikiLimit,
    },
  };
}

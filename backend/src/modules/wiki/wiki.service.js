import { Op } from 'sequelize';
import { likeOperator } from '../../database/connection.js';
import { WikiPage, WikiPageRevision, User } from '../../database/models.js';
import { ApiError } from '../../shared/errors/api-error.js';
import { currentOrganizationId } from '../../shared/context/request-context.js';
import { resolveIssueRefs } from '../../shared/utils/issue-refs.js';
import { USER_SUMMARY_ATTRIBUTES } from '../users/user.model.js';
import { resolveWikiGraph } from './wiki-refs.js';
import { WIKI_KINDS } from './wiki.model.js';
import { getWikiTemplates, resolveWikiTemplate } from './wiki.templates.js';

const MAX_TITLE = 150;
const MAX_BODY = 50_000;
const MAX_REVISIONS = 50;

function orgId() {
  const id = currentOrganizationId();
  if (!id) throw ApiError.badRequest('Choose an organization first');
  return id;
}

const pageIncludes = [
  { model: User, as: 'createdBy', attributes: USER_SUMMARY_ATTRIBUTES },
  { model: User, as: 'updatedBy', attributes: USER_SUMMARY_ATTRIBUTES },
];

function excerptOf(body) {
  return String(body ?? '')
    .replace(/[#>*_`\[\]()!-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
}

function pageView(page, { withBody = true } = {}) {
  const json = page.toJSON ? page.toJSON() : page;
  return {
    id: json.id,
    title: json.title,
    body: withBody ? json.body : undefined,
    excerpt: json.kind === 'folder' ? undefined : excerptOf(json.body),
    parentId: json.parentId ?? null,
    kind: json.kind === 'folder' ? 'folder' : 'page',
    position: json.position ?? 0,
    createdById: json.createdById,
    updatedById: json.updatedById,
    createdBy: json.createdBy ?? null,
    updatedBy: json.updatedBy ?? null,
    createdAt: json.createdAt,
    updatedAt: json.updatedAt,
  };
}

async function loadPage(pageId) {
  const page = await WikiPage.findOne({
    where: { id: pageId, organizationId: orgId() },
    include: pageIncludes,
  });
  if (!page) throw ApiError.notFound('Page not found');
  return page;
}

/** Ensure parentId points at a folder in this org and does not create a cycle. */
async function assertParentFolder(parentId, { selfId = null } = {}) {
  if (parentId == null || parentId === '') return null;
  const parent = await WikiPage.findOne({
    where: { id: parentId, organizationId: orgId() },
    attributes: ['id', 'kind', 'parentId'],
  });
  if (!parent) throw ApiError.badRequest('Parent folder not found');
  if (parent.kind !== 'folder') throw ApiError.badRequest('Parent must be a folder');
  if (selfId && parent.id === selfId) throw ApiError.badRequest('A page cannot be inside itself');

  let cursor = parent.parentId;
  const seen = new Set([parent.id]);
  while (cursor) {
    if (selfId && cursor === selfId) throw ApiError.badRequest('That would create a folder loop');
    if (seen.has(cursor)) throw ApiError.badRequest('That would create a folder loop');
    seen.add(cursor);
    const next = await WikiPage.findOne({
      where: { id: cursor, organizationId: orgId() },
      attributes: ['id', 'parentId'],
    });
    cursor = next?.parentId ?? null;
  }
  return parent.id;
}

export async function listPages({ q } = {}) {
  const where = { organizationId: orgId() };
  const term = String(q ?? '').trim();
  if (term) {
    const like = `%${term.replace(/[%_]/g, '\\$&')}%`;
    where[Op.or] = [{ title: { [likeOperator]: like } }, { body: { [likeOperator]: like } }];
  }
  const pages = await WikiPage.findAll({
    where,
    include: pageIncludes,
    order: term
      ? [['updatedAt', 'DESC']]
      : [
          ['position', 'ASC'],
          ['title', 'ASC'],
        ],
    limit: term ? 50 : 200,
  });
  return pages.map((page) => pageView(page, { withBody: false }));
}

export async function getPage(pageId, userId) {
  const page = pageView(await loadPage(pageId));
  if (page.kind === 'folder') {
    return { ...page, referencedIssues: [], linkedPages: [], backlinks: [] };
  }
  const emptyLinks = { linkedPages: [], backlinks: [] };
  if (!page.body) {
    return { ...page, referencedIssues: [], ...emptyLinks };
  }

  const organizationId = orgId();
  const [issues, graph] = await Promise.all([
    userId ? resolveIssueRefs(userId, page.body) : Promise.resolve([]),
    resolveWikiGraph(organizationId, { pageId: page.id, title: page.title, body: page.body }),
  ]);

  return {
    ...page,
    referencedIssues: issues.map((issue) => ({
      id: issue.id,
      key: issue.key,
      title: issue.title,
      projectId: issue.projectId,
    })),
    linkedPages: graph.linkedPages,
    backlinks: graph.backlinks,
  };
}

export async function listTemplates() {
  return getWikiTemplates();
}

export async function createPage(actor, { title, body, templateId, parentId, kind } = {}) {
  const nextKind = kind === 'folder' ? 'folder' : 'page';
  if (nextKind === 'folder' && templateId) throw ApiError.badRequest('Folders do not use templates');

  const template = templateId ? resolveWikiTemplate(templateId) : null;
  if (templateId && !template) throw ApiError.badRequest('Unknown wiki template');

  const cleaned = String(title ?? template?.pageTitle ?? '').trim();
  if (!cleaned) throw ApiError.badRequest(nextKind === 'folder' ? 'Give the folder a name' : 'Give the page a title');

  const resolvedParentId = await assertParentFolder(parentId ?? null);

  const siblings = await WikiPage.count({
    where: { organizationId: orgId(), parentId: resolvedParentId },
  });

  const created = await WikiPage.create({
    organizationId: orgId(),
    parentId: resolvedParentId,
    kind: nextKind,
    position: siblings,
    title: cleaned.slice(0, MAX_TITLE),
    body: nextKind === 'folder' ? '' : String(body !== undefined ? body : (template?.body ?? '')).slice(0, MAX_BODY),
    createdById: actor.id,
    updatedById: actor.id,
  });
  return pageView(await WikiPage.findByPk(created.id, { include: pageIncludes }));
}

export async function updatePage(pageId, actor, { title, body, parentId } = {}) {
  const page = await WikiPage.findOne({ where: { id: pageId, organizationId: orgId() } });
  if (!page) throw ApiError.notFound('Page not found');

  const changes = { updatedById: actor.id };
  let contentChanging = false;

  if (title !== undefined) {
    const cleaned = String(title).trim();
    if (!cleaned) throw ApiError.badRequest(page.kind === 'folder' ? 'Give the folder a name' : 'Give the page a title');
    const nextTitle = cleaned.slice(0, MAX_TITLE);
    if (nextTitle !== page.title) contentChanging = true;
    changes.title = nextTitle;
  }

  if (body !== undefined) {
    if (page.kind === 'folder') throw ApiError.badRequest('Folders do not have a body');
    const nextBody = String(body).slice(0, MAX_BODY);
    if (nextBody !== page.body) contentChanging = true;
    changes.body = nextBody;
  }

  if (parentId !== undefined) {
    const resolvedParentId = await assertParentFolder(parentId, { selfId: page.id });
    changes.parentId = resolvedParentId;
  }

  if (page.kind === 'page' && contentChanging) {
    await WikiPageRevision.create({
      pageId: page.id,
      organizationId: page.organizationId,
      editorId: actor.id,
      title: page.title,
      body: page.body,
    });
  }

  await page.update(changes);
  return pageView(await WikiPage.findByPk(page.id, { include: pageIncludes }));
}

export async function deletePage(pageId, actor, { organizationRole } = {}) {
  const page = await WikiPage.findOne({ where: { id: pageId, organizationId: orgId() } });
  if (!page) throw ApiError.notFound('Page not found');
  const isAuthor = page.createdById === actor.id;
  const isAdmin = organizationRole === 'admin' || actor.workspaceRole === 'admin';
  if (!isAuthor && !isAdmin) throw ApiError.forbidden('Only the author or an organization admin can delete this page');

  if (page.kind === 'folder') {
    const childCount = await WikiPage.count({ where: { parentId: page.id, organizationId: orgId() } });
    if (childCount > 0) {
      throw ApiError.badRequest('Move or delete everything inside this folder first');
    }
  }

  await page.destroy();
  return { deleted: true };
}

export async function listHistory(pageId) {
  const page = await WikiPage.findOne({
    where: { id: pageId, organizationId: orgId() },
    attributes: ['id', 'kind'],
  });
  if (!page) throw ApiError.notFound('Page not found');
  if (page.kind === 'folder') return [];

  const revisions = await WikiPageRevision.findAll({
    where: { pageId: page.id },
    include: [{ model: User, as: 'editor', attributes: USER_SUMMARY_ATTRIBUTES }],
    order: [['createdAt', 'DESC']],
    limit: MAX_REVISIONS,
  });

  return revisions.map((row) => {
    const json = row.toJSON();
    return {
      id: json.id,
      title: json.title,
      body: json.body,
      createdAt: json.createdAt,
      editor: json.editor ?? null,
    };
  });
}

export async function restoreRevision(pageId, revisionId, actor) {
  const page = await WikiPage.findOne({ where: { id: pageId, organizationId: orgId() } });
  if (!page) throw ApiError.notFound('Page not found');
  if (page.kind === 'folder') throw ApiError.badRequest('Folders do not have version history');

  const revision = await WikiPageRevision.findOne({
    where: { id: revisionId, pageId: page.id, organizationId: orgId() },
  });
  if (!revision) throw ApiError.notFound('Version not found');

  await WikiPageRevision.create({
    pageId: page.id,
    organizationId: page.organizationId,
    editorId: actor.id,
    title: page.title,
    body: page.body,
  });

  await page.update({
    title: revision.title,
    body: revision.body,
    updatedById: actor.id,
  });

  return getPage(page.id, actor.id);
}

export { WIKI_KINDS };

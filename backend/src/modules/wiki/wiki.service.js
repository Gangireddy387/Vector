import { Op } from 'sequelize';
import { likeOperator } from '../../database/connection.js';
import { WikiPage, User } from '../../database/models.js';
import { ApiError } from '../../shared/errors/api-error.js';
import { currentOrganizationId } from '../../shared/context/request-context.js';
import { resolveIssueRefs } from '../../shared/utils/issue-refs.js';
import { USER_SUMMARY_ATTRIBUTES } from '../users/user.model.js';
import { resolveWikiGraph } from './wiki-refs.js';
import { getWikiTemplates, resolveWikiTemplate } from './wiki.templates.js';

const MAX_TITLE = 150;
const MAX_BODY = 50_000;

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
    excerpt: excerptOf(json.body),
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
    order: [['updatedAt', 'DESC']],
    limit: term ? 50 : 200,
  });
  return pages.map((page) => pageView(page, { withBody: false }));
}

export async function getPage(pageId, userId) {
  const page = pageView(await loadPage(pageId));
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

export async function createPage(actor, { title, body, templateId } = {}) {
  const template = templateId ? resolveWikiTemplate(templateId) : null;
  if (templateId && !template) throw ApiError.badRequest('Unknown wiki template');

  const cleaned = String(title ?? template?.pageTitle ?? '').trim();
  if (!cleaned) throw ApiError.badRequest('Give the page a title');
  const created = await WikiPage.create({
    organizationId: orgId(),
    title: cleaned.slice(0, MAX_TITLE),
    body: String(body !== undefined ? body : (template?.body ?? '')).slice(0, MAX_BODY),
    createdById: actor.id,
    updatedById: actor.id,
  });
  return pageView(await WikiPage.findByPk(created.id, { include: pageIncludes }));
}

export async function updatePage(pageId, actor, { title, body }) {
  const page = await WikiPage.findOne({ where: { id: pageId, organizationId: orgId() } });
  if (!page) throw ApiError.notFound('Page not found');
  const changes = { updatedById: actor.id };
  if (title !== undefined) {
    const cleaned = String(title).trim();
    if (!cleaned) throw ApiError.badRequest('Give the page a title');
    changes.title = cleaned.slice(0, MAX_TITLE);
  }
  if (body !== undefined) changes.body = String(body).slice(0, MAX_BODY);
  await page.update(changes);
  return pageView(await WikiPage.findByPk(page.id, { include: pageIncludes }));
}

export async function deletePage(pageId, actor, { organizationRole } = {}) {
  const page = await WikiPage.findOne({ where: { id: pageId, organizationId: orgId() } });
  if (!page) throw ApiError.notFound('Page not found');
  const isAuthor = page.createdById === actor.id;
  const isAdmin = organizationRole === 'admin' || actor.workspaceRole === 'admin';
  if (!isAuthor && !isAdmin) throw ApiError.forbidden('Only the author or an organization admin can delete this page');
  await page.destroy();
  return { deleted: true };
}

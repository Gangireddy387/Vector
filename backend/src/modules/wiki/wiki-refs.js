import { Op } from 'sequelize';
import { WikiPage } from '../../database/models.js';

/** `[[Page title]]` or `[[Page title|uuid]]` wiki links. */
const WIKI_BRACKET = /\[\[([^\[\]|#]+)(?:\|([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}))?\]\]/gi;
/** Absolute-ish wiki ids in prose: `/wiki/:id` or `wiki:uuid`. */
const WIKI_ID = /(?:\/wiki\/|wiki:)([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/gi;

export function extractWikiRefs(body) {
  const titles = [];
  const pageIds = [];
  const text = String(body ?? '');
  for (const match of text.matchAll(WIKI_BRACKET)) {
    const title = String(match[1] ?? '').trim();
    if (match[2]) pageIds.push(match[2].toLowerCase());
    else if (title) titles.push(title);
  }
  for (const match of text.matchAll(WIKI_ID)) {
    pageIds.push(match[1].toLowerCase());
  }
  return {
    titles: [...new Set(titles)],
    pageIds: [...new Set(pageIds)],
  };
}

function excerptOf(body) {
  return String(body ?? '')
    .replace(/[#>*_`\[\]()!-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

function linkView(page) {
  return {
    id: page.id,
    title: page.title,
    excerpt: excerptOf(page.body),
  };
}

function refsHitPage(refs, { pageId, title }) {
  const needle = String(title ?? '')
    .trim()
    .toLowerCase();
  if (refs.pageIds.includes(pageId)) return true;
  return refs.titles.some((titleRef) => titleRef.trim().toLowerCase() === needle);
}

/**
 * Resolve outgoing wiki links from a page body and find other pages that link back.
 * Scans up to 200 org pages (same cap as the wiki list).
 */
export async function resolveWikiGraph(organizationId, { pageId, title, body }) {
  const pages = await WikiPage.findAll({
    where: { organizationId },
    attributes: ['id', 'title', 'body'],
    order: [['updatedAt', 'DESC']],
    limit: 200,
  });

  const byId = new Map(pages.map((page) => [page.id, page]));
  const byTitle = new Map();
  for (const page of pages) {
    const key = String(page.title ?? '')
      .trim()
      .toLowerCase();
    if (key && !byTitle.has(key)) byTitle.set(key, page);
  }

  const { titles, pageIds } = extractWikiRefs(body);
  const linked = new Map();
  for (const refTitle of titles) {
    const hit = byTitle.get(refTitle.trim().toLowerCase());
    if (hit && hit.id !== pageId) linked.set(hit.id, hit);
  }
  for (const id of pageIds) {
    const hit = byId.get(id);
    if (hit && hit.id !== pageId) linked.set(hit.id, hit);
  }

  // Also resolve ids that weren't in the list sample (rare when >200 pages).
  const missingIds = pageIds.filter((id) => id !== pageId && !byId.has(id));
  if (missingIds.length) {
    const extras = await WikiPage.findAll({
      where: { organizationId, id: { [Op.in]: missingIds.slice(0, 25) } },
      attributes: ['id', 'title', 'body'],
    });
    for (const page of extras) linked.set(page.id, page);
  }

  const backlinks = pages
    .filter((page) => page.id !== pageId && refsHitPage(extractWikiRefs(page.body), { pageId, title }))
    .map(linkView);

  return {
    linkedPages: [...linked.values()].map(linkView),
    backlinks,
  };
}

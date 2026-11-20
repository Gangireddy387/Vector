import { Organization, Project } from '../../database/models.js';
import { currentOrganizationId } from '../../shared/context/request-context.js';
import { entitlementsFor, withPlan } from '../plans/plan.service.js';
import { globalSearch } from '../search/search.service.js';

const MAX_INSTRUCTIONS = 4_000;
const STOP_WORDS = new Set([
  'a',
  'an',
  'the',
  'and',
  'or',
  'to',
  'of',
  'in',
  'on',
  'for',
  'with',
  'is',
  'are',
  'be',
  'this',
  'that',
  'it',
  'as',
  'at',
  'by',
  'from',
  'we',
  'our',
  'you',
  'your',
]);

const clip = (text, size) => {
  const value = String(text ?? '').trim();
  if (!value) return '';
  return value.length > size ? `${value.slice(0, size)}…` : value;
};

/** Public shape for org settings / API responses. */
export function publicAiGrounding(organization) {
  const raw = organization?.aiGrounding && typeof organization.aiGrounding === 'object' ? organization.aiGrounding : {};
  const instructions = typeof raw.instructions === 'string' ? raw.instructions.trim().slice(0, MAX_INSTRUCTIONS) : '';
  return { instructions };
}

/** Normalize admin input before save. */
export function normalizeAiGrounding(input) {
  const raw = input && typeof input === 'object' ? input : {};
  const instructions =
    typeof raw.instructions === 'string' ? raw.instructions.trim().slice(0, MAX_INSTRUCTIONS) : '';
  return { instructions };
}

/** Pull a short search query from draft / question text. */
export function searchQueryFromText(text, { maxWords = 8 } = {}) {
  const words = String(text ?? '')
    .replace(/[`*_#>[\](){}|\\]/g, ' ')
    .split(/[^a-zA-Z0-9@.-]+/)
    .map((word) => word.trim())
    .filter((word) => word.length >= 2 && !STOP_WORDS.has(word.toLowerCase()));
  return words.slice(0, maxWords).join(' ').slice(0, 120);
}

function formatRetrieval(wiki = [], issues = []) {
  const lines = [];
  if (wiki.length) {
    lines.push('Relevant wiki pages:');
    for (const page of wiki) {
      lines.push(`- ${page.title}: ${clip(page.excerpt, 140)}`);
    }
  }
  if (issues.length) {
    lines.push('Relevant tasks:');
    for (const issue of issues) {
      const status =
        typeof issue.status === 'string'
          ? issue.status
          : issue.status?.name || issue.statusName || '';
      lines.push(`- ${issue.key} “${clip(issue.title, 80)}”${status ? ` [${status}]` : ''}`);
    }
  }
  return lines.join('\n');
}

/**
 * Org + optional project AI instructions, plus light FTS retrieval (wiki + issues).
 * Safe to call when AI is off — returns an empty string when nothing useful is configured.
 */
export async function buildGroundingBlock({
  userId = null,
  projectId = null,
  queryText = '',
  includeRetrieval = true,
} = {}) {
  const organizationId = currentOrganizationId();
  const parts = [];

  let organization = null;
  if (organizationId) {
    organization = await Organization.findByPk(organizationId, {
      attributes: ['id', 'name', 'aiGrounding', 'planId', 'featureOverrides'],
      include: withPlan(),
    });
  }

  const orgInstructions = publicAiGrounding(organization).instructions;
  if (orgInstructions) {
    parts.push(`Organization AI instructions:\n${clip(orgInstructions, MAX_INSTRUCTIONS)}`);
  }

  let projectKey = null;
  if (projectId) {
    const project = await Project.findByPk(projectId, {
      attributes: ['id', 'key', 'name', 'settings', 'organizationId'],
    });
    if (project && (!organizationId || project.organizationId === organizationId)) {
      projectKey = project.key;
      const projectInstructions =
        typeof project.settings?.aiInstructions === 'string' ? project.settings.aiInstructions.trim() : '';
      if (projectInstructions) {
        parts.push(`Project “${project.name}” AI instructions:\n${clip(projectInstructions, 2_000)}`);
      }
    }
  }

  const canRetrieve =
    includeRetrieval &&
    userId &&
    organization &&
    entitlementsFor(organization).features?.aiAssistant;

  if (canRetrieve) {
    const seed = searchQueryFromText(queryText);
    if (seed) {
      try {
        const wikiQuery = seed;
        const issueQuery = projectKey ? `project:${projectKey} ${seed}` : seed;
        const [wikiResult, issueResult] = await Promise.all([
          globalSearch(userId, { q: wikiQuery, limit: 4, scope: 'wiki' }).catch(() => ({ wiki: [] })),
          globalSearch(userId, { q: issueQuery, limit: 6, scope: 'issues' }).catch(() => ({ issues: [] })),
        ]);
        const retrieval = formatRetrieval(wikiResult.wiki ?? [], issueResult.issues ?? []);
        if (retrieval) parts.push(`Retrieved workspace context (use only if relevant; do not invent):\n${retrieval}`);
      } catch {
        // Search failures must not break writing assist.
      }
    }
  }

  return parts.join('\n\n');
}

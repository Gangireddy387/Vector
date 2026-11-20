import { Organization, Project, Department, Team } from '../../database/models.js';
import { ApiError } from '../../shared/errors/api-error.js';
import { currentOrganizationId } from '../../shared/context/request-context.js';
import { buildGroundingBlock } from '../ai/ai.grounding.js';
import { completeJsonDetailed, isAiEnabled } from '../ai/openai.client.js';
import { listMembers } from '../organizations/organization.service.js';
import { entitlementsFor, withPlan } from '../plans/plan.service.js';
import { resolveWikiTemplate } from './wiki.templates.js';
import * as wikiService from './wiki.service.js';

const MAX_BODY = 50_000;
const KINDS = new Set(['handbook', 'runbook', 'meeting-notes', 'faq', 'project-brief', 'how-to', 'custom']);

const clip = (text, size) => {
  const value = String(text ?? '');
  return value.length > size ? `${value.slice(0, size)}\n[…]` : value;
};

const sourceOf = (result) => (result.ok ? 'openai' : result.reason === 'error' ? 'degraded' : 'heuristic');

async function orgContext(actor) {
  const organizationId = currentOrganizationId();
  if (!organizationId) throw ApiError.badRequest('Choose an organization first');
  const organization = await Organization.findByPk(organizationId, {
    include: withPlan(),
    attributes: ['id', 'name', 'slug', 'brandColor', 'status', 'planId', 'featureOverrides', 'aiGrounding'],
  });
  if (!organization) throw ApiError.notFound('Organization not found');

  const [members, projects, departments, pages, grounding] = await Promise.all([
    listMembers(organizationId).catch(() => []),
    Project.findAll({
      where: { organizationId, archivedAt: null },
      attributes: ['key', 'name', 'description'],
      order: [['updatedAt', 'DESC']],
      limit: 12,
    }),
    Department.findAll({
      where: { organizationId },
      attributes: ['id', 'name'],
      include: [{ model: Team, as: 'teams', attributes: ['name'], required: false }],
      limit: 20,
    }).catch(() => []),
    wikiService.listPages({}).catch(() => []),
    buildGroundingBlock({ userId: actor?.id, queryText: '', includeRetrieval: false }),
  ]);
  const teams = departments.flatMap((department) => department.teams ?? []);

  const people = members
    .filter((member) => member.status === 'active')
    .slice(0, 24)
    .map((member) => ({
      name: member.name,
      role: member.customRole?.name || member.workspaceRole,
      title: member.title || null,
    }));

  return {
    organization,
    aiEnabled: Boolean(entitlementsFor(organization).features.aiAssistant),
    actorName: actor?.name || 'A teammate',
    contextBlock: [
      `Organization: ${organization.name}`,
      `People (${people.length}): ${people.map((person) => `${person.name}${person.role ? ` (${person.role})` : ''}`).join('; ') || 'none listed'}`,
      `Projects: ${projects.map((project) => `${project.key} ${project.name}`).join('; ') || 'none'}`,
      `Departments: ${departments.map((row) => row.name).join(', ') || 'none'}`,
      `Teams: ${teams.map((row) => row.name).join(', ') || 'none'}`,
      `Existing wiki pages: ${pages
        .slice(0, 15)
        .map((page) => page.title)
        .join('; ') || 'none'}`,
      grounding || null,
    ]
      .filter(Boolean)
      .join('\n'),
    people,
    projects,
  };
}

function heuristicGenerate({ kind, brief, title, ctx }) {
  const template = resolveWikiTemplate(kind === 'custom' ? 'blank' : kind) || resolveWikiTemplate('blank');
  const org = ctx.organization.name;
  const lead = ctx.people.find((person) => person.role === 'admin')?.name || ctx.people[0]?.name || ctx.actorName;
  const projectLine = ctx.projects.map((project) => `- **${project.key}** — ${project.name}`).join('\n') || '- _Add your first project in Vector_';
  const peopleTable = ctx.people
    .slice(0, 8)
    .map((person) => `| ${person.title || 'General'} | ${person.name} | | |`)
    .join('\n');

  let body = String(template?.body || '');
  const replacements = [
    [/_Who this handbook is for[^_]*_/gi, `New hires and everyone at ${org}. Clear ownership, fast answers, and kind collaboration.`],
    [/_Where day-to-day talk happens[^_]*_/gi, 'Vector Messages / project chat'],
    [/_How to escalate[^_]*_/gi, `@mention ${lead} or start a Vector meeting`],
    [/_When to write a doc vs\. a chat message_/gi, 'Decisions and how-tos → wiki; quick questions → chat'],
    [/_e\.g\. 10:00–16:00 local_/gi, 'Agree core hours with your team lead'],
    [/_Day, time, link_/gi, 'Use Vector standups on each active project'],
    [/_Agenda required\? Notes owner\?_/gi, 'Agenda in the meeting invite; notes go in this wiki'],
    [/_Who proposes_/gi, 'Anyone closest to the work'],
    [/_Who decides_/gi, lead],
    [/_Where the decision is written down_/gi, 'This wiki or the related Vector task'],
    [/_Name_/g, lead],
    [/_list systems_/gi, 'Vector, email, and your team tools'],
    [/_One or two sentences:[^_]*_/gi, brief || `Internal knowledge for ${org}.`],
    [/_Point 1_/gi, brief ? `Focus: ${brief.slice(0, 120)}` : `How ${org} works day to day`],
    [/_Point 2_/gi, 'Owners, links, and next steps'],
    [/_Add useful links or owners here_/gi, `Ask ${lead} if something is missing`],
    [/_Symptoms or alerts[^_]*_/gi, brief || 'When the related alert fires or customers report the issue'],
    [/_e\.g\. SEV-2 \/ high_/gi, 'High'],
    [/_Who feels it and how_/gi, 'Internal team and affected customers'],
    [/_VPN, admin console, cloud account_/gi, 'Required production access'],
    [/_dashboard URL, log query, status page_/gi, 'Monitoring dashboards and Vector incident channel'],
    [/_#incidents channel or on-call lead_/gi, lead],
    [/_Date · time · timezone_/gi, new Date().toLocaleString()],
    [/_Names_/gi, ctx.people.slice(0, 5).map((person) => person.name).join(', ') || ctx.actorName],
    [/_In one sentence:[^_]*_/gi, brief || `Ship a clear outcome for ${org}`],
    [/_Business or customer reason[^_]*_/gi, brief || 'Priority this quarter'],
    [/_Must-have 1_/gi, 'Core workflow works end to end'],
    [/_Must-have 2_/gi, 'Owners and success metrics agreed'],
    [/_Must-have 3_/gi, 'Documented in this wiki'],
    [/_Explicitly not doing this_/gi, 'Out-of-scope ideas parked for later'],
    [/_Deferred to later_/gi, 'Nice-to-haves after launch'],
    [/_What you will have finished after these steps\._/gi, brief || 'A completed, verified outcome'],
    [/_e\.g\. 15 minutes_/gi, '15–30 minutes'],
    [/_tools \/ roles_/gi, 'Vector access'],
    [/_Steps or who to ask\. Link the access form if you have one\._/gi, `Ask ${lead} or an org admin in Vector`],
    [/_e\.g\. Vector project “X”\. How to create a task\._/gi, 'Create tasks in the relevant Vector project'],
    [/_Reset steps or IT contact\._/gi, 'Use your SSO provider reset, or ask an admin'],
    [/_Policy \+ who approves \+ how to invite\._/gi, 'Org admins invite from Workspace settings'],
    [/_PR → review → deploy\. Link the runbook if needed\._/gi, 'Open a Vector task, review, then ship with your team’s checklist'],
    [/_Who is on-call and which runbook to open\._/gi, `Ping ${lead}; check Wiki runbooks`],
  ];

  for (const [pattern, value] of replacements) body = body.replace(pattern, value);
  body = body.replace(/^> \*\*Tip:\*\*.+\n?/gm, '');
  body = body.replace(/_([^_\n]{2,80})_/g, '$1');

  if (kind === 'handbook' || kind === 'blank' || kind === 'custom') {
    if (!body.includes(projectLine.split('\n')[0])) {
      body += `\n\n## Active projects\n${projectLine}\n`;
    }
    if (peopleTable && body.includes('| Area | Owner |')) {
      body = body.replace(
        /\|\s*Product\s*\|\s*.+\n\|\s*Engineering\s*\|\s*.+\n\|\s*Support\s*\|\s*.+\n/,
        `${peopleTable}\n`,
      );
    }
  }

  if (brief?.trim() && !body.toLowerCase().includes(brief.trim().slice(0, 40).toLowerCase())) {
    body = `## Brief\n${brief.trim()}\n\n${body}`;
  }

  const pageTitle =
    title?.trim() ||
    (kind === 'custom' || kind === 'blank'
      ? brief?.trim().slice(0, 80) || `${org} notes`
      : `${template?.pageTitle || 'Page'}${kind === 'meeting-notes' || kind === 'runbook' || kind === 'project-brief' || kind === 'how-to' ? (brief?.trim().slice(0, 60) || org) : ''}`.trim()) ||
    template?.pageTitle ||
    'Wiki page';

  return { title: pageTitle.slice(0, 150), body: body.slice(0, MAX_BODY) };
}

function heuristicFill(body, ctx) {
  let next = String(body ?? '');
  next = next.replace(/^> \*\*Tip:\*\*.+\n?/gm, '');
  const lead = ctx.people.find((person) => person.role === 'admin')?.name || ctx.people[0]?.name || ctx.actorName;
  next = next.replace(/_Name_/g, lead);
  next = next.replace(/_Date_/g, new Date().toLocaleDateString());
  next = next.replace(/_URL_/g, '');
  next = next.replace(/_([^_\n]{2,100})_/g, (_, prompt) => {
    const lower = prompt.toLowerCase();
    if (lower.includes('who') || lower.includes('owner') || lower.includes('ping')) return lead;
    if (lower.includes('chat') || lower.includes('slack')) return 'Vector Messages';
    if (lower.includes('project')) return ctx.projects[0] ? `${ctx.projects[0].key} — ${ctx.projects[0].name}` : 'Your Vector project';
    if (lower.includes('organization') || lower.includes('company') || lower.includes('team')) return ctx.organization.name;
    return prompt.replace(/\?$/, '').trim();
  });
  return next.slice(0, MAX_BODY);
}

/**
 * Create a finished wiki page from a short brief — AI writes, people edit.
 */
export async function generateWikiPage(actor, { kind = 'custom', brief = '', title, parentId } = {}) {
  const normalizedKind = KINDS.has(kind) ? kind : 'custom';
  const ctx = await orgContext(actor);
  const template = resolveWikiTemplate(normalizedKind === 'custom' ? 'blank' : normalizedKind);
  const folder = parentId === undefined ? {} : { parentId };

  if (ctx.aiEnabled && isAiEnabled()) {
    const result = await completeJsonDetailed({
      system:
        'You write internal company wiki pages in clean GitHub-flavored markdown. Be specific using the provided organization context. Never leave italic placeholder prompts. No tip callouts. Keep it practical and scannable. When you reference another existing wiki page from context, link it as [[Exact Page Title]]. Always respond with valid JSON only.',
      temperature: 0.4,
      maxTokens: 3500,
      user: `Write a complete wiki page for ${ctx.organization.name}.
Kind: ${normalizedKind}${template ? ` (${template.title})` : ''}
User brief: ${clip(brief || 'General internal documentation', 2000)}
Preferred title (optional): ${title || 'none'}
Organization context:
${ctx.contextBlock}

Return JSON: {"title": string, "body": string}
Body rules:
- Use ## and ### headings, bullet lists, and checklists where helpful
- For any grid of data (roles, tools, milestones), use a REAL GFM markdown table with pipes and a separator row, e.g.:
| Area | Owner | Backup |
| --- | --- | --- |
| Product | Ada | Beau |
- Never write fake tables as space-separated words on a line
- Prefer real names/projects from context; if unknown, write a clear sensible default and mark uncertainty with "(confirm)"
- Do not include "_placeholder_" italics or "> **Tip:**" blocks
- Length: useful but not bloated (roughly 400-1200 words)`,
    });

    if (typeof result.data?.title === 'string' && typeof result.data?.body === 'string' && result.data.body.trim()) {
      const page = await wikiService.createPage(actor, {
        title: result.data.title.trim().slice(0, 150),
        body: result.data.body.slice(0, MAX_BODY),
        ...folder,
      });
      return { page, source: sourceOf(result) };
    }
  }

  const drafted = heuristicGenerate({ kind: normalizedKind, brief, title, ctx });
  const page = await wikiService.createPage(actor, { ...drafted, ...folder });
  return { page, source: ctx.aiEnabled && isAiEnabled() ? 'degraded' : 'heuristic' };
}

/**
 * Rewrite a draft page: remove prompts/tips and produce a finished document.
 */
export async function fillWikiPage(actor, pageId, { brief = '' } = {}) {
  const existing = await wikiService.getPage(pageId);
  if (existing.kind === 'folder') throw ApiError.badRequest('Folders do not have page content');
  const ctx = await orgContext(actor);

  if (ctx.aiEnabled && isAiEnabled()) {
    const result = await completeJsonDetailed({
      system:
        'You finish incomplete internal wiki drafts. Replace placeholders with concrete content using organization context. Preserve useful structure the author already wrote. When you reference another existing wiki page from context, link it as [[Exact Page Title]]. Always respond with valid JSON only.',
      temperature: 0.35,
      maxTokens: 3500,
      user: `Finish this wiki page for ${ctx.organization.name}.
Extra notes from the author: ${clip(brief || 'none', 1500)}
Organization context:
${ctx.contextBlock}

Current title: ${existing.title}
Current markdown:
"""
${clip(existing.body, 12_000)}
"""

Return JSON: {"title": string, "body": string}
Rules:
- Remove "> **Tip:**" callouts and italic _prompts_
- Keep headings the author already has when they still make sense
- Convert any space-aligned “tables” into real GFM pipe tables with a | --- | separator row
- Use real people/projects from context when relevant
- Do not invent private facts; use "(confirm)" when guessing`,
    });

    if (typeof result.data?.body === 'string' && result.data.body.trim()) {
      const page = await wikiService.updatePage(pageId, actor, {
        title: typeof result.data.title === 'string' && result.data.title.trim() ? result.data.title.trim().slice(0, 150) : existing.title,
        body: result.data.body.slice(0, MAX_BODY),
      });
      return { page, source: sourceOf(result) };
    }
  }

  const page = await wikiService.updatePage(pageId, actor, {
    title: existing.title,
    body: heuristicFill(existing.body, ctx),
  });
  return { page, source: ctx.aiEnabled && isAiEnabled() ? 'degraded' : 'heuristic' };
}

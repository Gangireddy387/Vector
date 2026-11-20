import { Issue, IssueExternalLink, Organization, Project, Status } from '../../../database/models.js';
import { config } from '../../../config/index.js';
import { ApiError } from '../../../shared/errors/api-error.js';
import { encryptSecret, decryptSecret } from '../../auth/mfa.js';
import { createComment } from '../../comments/comment.service.js';
import { updateIssue } from '../../issues/issue.service.js';
import { entitlementsFor } from '../../plans/plan.service.js';
import { newGithubWebhookSecret, secretPrefixOf, verifyGithubSignature } from './github-webhook.verify.js';

function webhookUrlFor(org) {
  const base = (config.calendar?.publicApiUrl || 'http://localhost:4000').replace(/\/$/, '');
  return `${base}/api/integrations/github/webhook/${org.slug}`;
}

function settingsOf(org) {
  return org.githubWebhook && typeof org.githubWebhook === 'object' ? org.githubWebhook : {};
}

function publicView(org, { secret } = {}) {
  const settings = settingsOf(org);
  return {
    available: Boolean(entitlementsFor(org).features?.vcsLinks),
    enabled: Boolean(settings.enabled),
    webhookUrl: webhookUrlFor(org),
    secretPrefix: settings.secretPrefix ?? null,
    lastDeliveryAt: settings.lastDeliveryAt ?? null,
    lastEvent: settings.lastEvent ?? null,
    lastError: settings.lastError ?? null,
    ...(secret ? { secret } : {}),
  };
}

async function assertVcsFeature(org) {
  if (!entitlementsFor(org).features?.vcsLinks) {
    throw ApiError.forbidden('The current plan does not include GitHub & GitLab links');
  }
}

export async function getGithubIntegration(organization) {
  await assertVcsFeature(organization);
  return publicView(organization);
}

export async function enableGithubIntegration(organization) {
  await assertVcsFeature(organization);
  const secret = newGithubWebhookSecret();
  const next = {
    ...settingsOf(organization),
    enabled: true,
    secretEncrypted: encryptSecret(secret),
    secretPrefix: secretPrefixOf(secret),
    lastError: null,
  };
  await organization.update({ githubWebhook: next });
  return publicView(organization, { secret });
}

export async function disableGithubIntegration(organization) {
  await assertVcsFeature(organization);
  const previous = settingsOf(organization);
  await organization.update({
    githubWebhook: {
      ...previous,
      enabled: false,
      lastError: null,
    },
  });
  return publicView(organization);
}

export async function regenerateGithubSecret(organization) {
  await assertVcsFeature(organization);
  const previous = settingsOf(organization);
  if (!previous.enabled) throw ApiError.badRequest('Enable GitHub sync before regenerating the secret');
  const secret = newGithubWebhookSecret();
  await organization.update({
    githubWebhook: {
      ...previous,
      secretEncrypted: encryptSecret(secret),
      secretPrefix: secretPrefixOf(secret),
      lastError: null,
    },
  });
  return publicView(organization, { secret });
}

async function markDelivery(org, { event, error = null }) {
  const previous = settingsOf(org);
  await org.update({
    githubWebhook: {
      ...previous,
      lastDeliveryAt: new Date().toISOString(),
      lastEvent: event ?? previous.lastEvent ?? null,
      lastError: error,
    },
  });
}

async function findLinkedIssues(organizationId, { owner, repo, number, kind }) {
  if (!owner || !repo || !number) return [];
  const where = {
    provider: 'github',
    owner,
    repo,
    number: Number(number),
  };
  if (kind) where.kind = kind;

  const links = await IssueExternalLink.findAll({
    where,
    include: [
      {
        model: Issue,
        as: 'issue',
        required: true,
        include: [{ model: Project, as: 'project', required: true, where: { organizationId } }],
      },
    ],
  });
  return links.map((link) => link.issue).filter(Boolean);
}

async function markDone(issue) {
  const done = await Status.findOne({
    where: { projectId: issue.projectId, category: 'done' },
    order: [['position', 'ASC']],
  });
  if (!done || issue.statusId === done.id) return;
  await updateIssue(issue.id, { statusId: done.id }, null, { source: 'github' });
}

function repoFromPayload(payload) {
  const full = payload?.repository?.full_name || '';
  const [owner, repo] = String(full).split('/');
  return { owner: owner || null, repo: repo || null };
}

/**
 * Handle a verified GitHub webhook delivery for one organization.
 * Returns quickly; comments/status updates are awaited but failures are recorded on the org.
 */
export async function handleGithubWebhook({ orgSlug, rawBody, signature, event, deliveryId }) {
  const organization = await Organization.findOne({ where: { slug: orgSlug } });
  if (!organization) throw ApiError.notFound('Organization not found');

  const settings = settingsOf(organization);
  if (!settings.enabled || !settings.secretEncrypted) {
    throw ApiError.forbidden('GitHub sync is not enabled for this organization');
  }
  if (!entitlementsFor(organization).features?.vcsLinks) {
    throw ApiError.forbidden('GitHub sync is not available on this plan');
  }

  let secret;
  try {
    secret = decryptSecret(settings.secretEncrypted);
  } catch {
    throw ApiError.badRequest('Stored webhook secret is unreadable — regenerate it in Integrations');
  }

  if (!verifyGithubSignature(rawBody, signature, secret)) {
    throw ApiError.unauthorized('Invalid GitHub signature');
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody));
  } catch {
    throw ApiError.badRequest('Invalid JSON payload');
  }

  try {
    if (event === 'ping') {
      await markDelivery(organization, { event: 'ping' });
      return { ok: true, handled: 'ping' };
    }

    const { owner, repo } = repoFromPayload(payload);
    let touched = 0;

    if (event === 'issue_comment' && payload.action === 'created' && payload.comment) {
      const number = payload.issue?.number;
      const kind = payload.issue?.pull_request ? 'pull' : 'issue';
      const issues = await findLinkedIssues(organization.id, { owner, repo, number, kind });
      const author = payload.comment.user?.login || 'GitHub';
      const body = [
        `**${author}** commented on GitHub [${owner}/${repo}#${number}](${payload.comment.html_url}):`,
        '',
        payload.comment.body || '_(empty comment)_',
      ].join('\n');
      for (const issue of issues) {
        await createComment(issue, null, body, { source: 'github', deliveryId });
        touched += 1;
      }
    }

    if (event === 'pull_request' && payload.action === 'closed' && payload.pull_request) {
      const number = payload.pull_request.number;
      const issues = await findLinkedIssues(organization.id, { owner, repo, number, kind: 'pull' });
      const merged = Boolean(payload.pull_request.merged);
      const title = payload.pull_request.title || `PR #${number}`;
      const url = payload.pull_request.html_url;
      const body = merged
        ? `GitHub pull request [#${number} ${title}](${url}) was **merged**.`
        : `GitHub pull request [#${number} ${title}](${url}) was closed without merging.`;
      for (const issue of issues) {
        await createComment(issue, null, body, { source: 'github', deliveryId });
        if (merged) await markDone(issue);
        touched += 1;
      }
    }

    if (event === 'issues' && payload.action === 'closed' && payload.issue) {
      const number = payload.issue.number;
      const issues = await findLinkedIssues(organization.id, { owner, repo, number, kind: 'issue' });
      const title = payload.issue.title || `Issue #${number}`;
      const url = payload.issue.html_url;
      const body = `GitHub issue [#${number} ${title}](${url}) was **closed**.`;
      for (const issue of issues) {
        await createComment(issue, null, body, { source: 'github', deliveryId });
        touched += 1;
      }
    }

    await markDelivery(organization, { event });
    return { ok: true, handled: event, touched };
  } catch (error) {
    await markDelivery(organization, { event, error: error.message || 'Webhook handler failed' }).catch(() => {});
    throw error;
  }
}

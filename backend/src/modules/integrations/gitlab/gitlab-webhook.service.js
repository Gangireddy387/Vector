import { Issue, IssueExternalLink, Organization, Project, Status } from '../../../database/models.js';
import { config } from '../../../config/index.js';
import { ApiError } from '../../../shared/errors/api-error.js';
import { encryptSecret, decryptSecret } from '../../auth/mfa.js';
import { createComment } from '../../comments/comment.service.js';
import { updateIssue } from '../../issues/issue.service.js';
import { entitlementsFor } from '../../plans/plan.service.js';
import { mergeClosesIssueOf, planGitlabWebhookActions } from './gitlab-webhook.messages.js';
import { newGitlabWebhookSecret, secretPrefixOf, verifyGitlabToken } from './gitlab-webhook.verify.js';

function webhookUrlFor(org) {
  const base = (config.calendar?.publicApiUrl || 'http://localhost:4000').replace(/\/$/, '');
  return `${base}/api/integrations/gitlab/webhook/${org.slug}`;
}

function settingsOf(org) {
  return org.gitlabWebhook && typeof org.gitlabWebhook === 'object' ? org.gitlabWebhook : {};
}

function publicView(org, { secret } = {}) {
  const settings = settingsOf(org);
  return {
    available: Boolean(entitlementsFor(org).features?.vcsLinks),
    enabled: Boolean(settings.enabled),
    mergeClosesIssue: mergeClosesIssueOf(settings),
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

export async function getGitlabIntegration(organization) {
  await assertVcsFeature(organization);
  return publicView(organization);
}

export async function enableGitlabIntegration(organization, { mergeClosesIssue } = {}) {
  await assertVcsFeature(organization);
  const previous = settingsOf(organization);
  const secret = newGitlabWebhookSecret();
  const next = {
    ...previous,
    enabled: true,
    mergeClosesIssue: mergeClosesIssue !== undefined ? Boolean(mergeClosesIssue) : mergeClosesIssueOf(previous),
    secretEncrypted: encryptSecret(secret),
    secretPrefix: secretPrefixOf(secret),
    lastError: null,
  };
  await organization.update({ gitlabWebhook: next });
  return publicView(organization, { secret });
}

export async function disableGitlabIntegration(organization) {
  await assertVcsFeature(organization);
  const previous = settingsOf(organization);
  await organization.update({
    gitlabWebhook: {
      ...previous,
      enabled: false,
      lastError: null,
    },
  });
  return publicView(organization);
}

export async function updateGitlabIntegrationSettings(organization, { mergeClosesIssue } = {}) {
  await assertVcsFeature(organization);
  const previous = settingsOf(organization);
  if (!previous.enabled) throw ApiError.badRequest('Enable GitLab sync before changing options');
  const next = { ...previous };
  if (mergeClosesIssue !== undefined) next.mergeClosesIssue = Boolean(mergeClosesIssue);
  await organization.update({ gitlabWebhook: next });
  return publicView(organization);
}

export async function regenerateGitlabSecret(organization) {
  await assertVcsFeature(organization);
  const previous = settingsOf(organization);
  if (!previous.enabled) throw ApiError.badRequest('Enable GitLab sync before regenerating the secret');
  const secret = newGitlabWebhookSecret();
  await organization.update({
    gitlabWebhook: {
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
    gitlabWebhook: {
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
    provider: 'gitlab',
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
  await updateIssue(issue.id, { statusId: done.id }, null, { source: 'gitlab' });
}

/**
 * Handle a verified GitLab webhook delivery for one organization.
 */
export async function handleGitlabWebhook({ orgSlug, rawBody, token, event, deliveryId }) {
  const organization = await Organization.findOne({ where: { slug: orgSlug } });
  if (!organization) throw ApiError.notFound('Organization not found');

  const settings = settingsOf(organization);
  if (!settings.enabled || !settings.secretEncrypted) {
    throw ApiError.forbidden('GitLab sync is not enabled for this organization');
  }
  if (!entitlementsFor(organization).features?.vcsLinks) {
    throw ApiError.forbidden('GitLab sync is not available on this plan');
  }

  let secret;
  try {
    secret = decryptSecret(settings.secretEncrypted);
  } catch {
    throw ApiError.badRequest('Stored webhook secret is unreadable — regenerate it in Integrations');
  }

  if (!verifyGitlabToken(token, secret)) {
    throw ApiError.unauthorized('Invalid GitLab token');
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody));
  } catch {
    throw ApiError.badRequest('Invalid JSON payload');
  }

  const eventLabel = event || payload?.object_kind || 'unknown';

  try {
    const { actions } = planGitlabWebhookActions(eventLabel, payload, settings);
    let touched = 0;

    for (const action of actions) {
      if (action.type === 'ping') {
        await markDelivery(organization, { event: 'ping' });
        return { ok: true, handled: 'ping' };
      }
      if (action.type !== 'comment') continue;

      const issues = await findLinkedIssues(organization.id, {
        owner: action.owner,
        repo: action.repo,
        number: action.number,
        kind: action.kind,
      });
      for (const issue of issues) {
        await createComment(issue, null, action.body, { source: 'gitlab', deliveryId });
        if (action.markDone) await markDone(issue);
        touched += 1;
      }
    }

    await markDelivery(organization, { event: eventLabel });
    return { ok: true, handled: eventLabel, touched };
  } catch (error) {
    await markDelivery(organization, { event: eventLabel, error: error.message || 'Webhook handler failed' }).catch(() => {});
    throw error;
  }
}

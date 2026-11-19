import { Organization, Project, User } from '../../database/models.js';
import { logger } from '../../shared/logger.js';
import { appUrl } from '../../shared/services/email-templates.js';
import { withPlan } from '../plans/plan.service.js';
import { channelNotifyDeliveryConfig } from './organization-channel-notify.js';

const TIMEOUT_MS = 8_000;

async function postJson(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Webhook failed (${response.status}): ${text.slice(0, 200)}`);
  }
}

function slackPayload({ title, body, link }) {
  const lines = [`*${title}*`, body ? String(body).slice(0, 500) : null, link ? `<${link}|Open in Vector>` : null].filter(Boolean);
  return { text: lines.join('\n') };
}

function teamsPayload({ title, body, link }) {
  return {
    '@type': 'MessageCard',
    '@context': 'https://schema.org/extensions',
    summary: title,
    themeColor: '6366F1',
    title,
    text: body ? String(body).slice(0, 500) : undefined,
    ...(link
      ? {
          potentialAction: [
            {
              '@type': 'OpenUri',
              name: 'Open in Vector',
              targets: [{ os: 'default', uri: link }],
            },
          ],
        }
      : {}),
  };
}

async function loadOrganizationForProject(projectId) {
  if (!projectId) return null;
  const project = await Project.findByPk(projectId, { attributes: ['id', 'organizationId', 'name', 'key'] });
  if (!project?.organizationId) return null;
  const organization = await Organization.findByPk(project.organizationId, { include: withPlan() });
  return { organization, project };
}

async function actorLabel(actorId) {
  if (!actorId) return 'Vector';
  const user = await User.findByPk(actorId, { attributes: ['name'] });
  return user?.name || 'Someone';
}

/**
 * Posts a channel message for one org event. Fire-and-forget friendly (errors are logged).
 * @param {'assigned'|'commented'|'due_soon'|'sprint_started'} eventKey
 */
export async function deliverChannelNotification(organization, eventKey, message) {
  const config = channelNotifyDeliveryConfig(organization);
  if (!config || !config.events[eventKey]) return { sent: false, reason: 'disabled' };

  const link = message.link ? appUrl(message.link) : null;
  const payload = { title: message.title, body: message.body ?? null, link };
  const results = [];

  if (config.slackWebhookUrl) {
    try {
      await postJson(config.slackWebhookUrl, slackPayload(payload));
      results.push({ channel: 'slack', ok: true });
    } catch (error) {
      logger.warn('slack webhook failed', { organizationId: organization.id, eventKey, error: error.message });
      results.push({ channel: 'slack', ok: false, error: error.message });
    }
  }
  if (config.teamsWebhookUrl) {
    try {
      await postJson(config.teamsWebhookUrl, teamsPayload(payload));
      results.push({ channel: 'teams', ok: true });
    } catch (error) {
      logger.warn('teams webhook failed', { organizationId: organization.id, eventKey, error: error.message });
      results.push({ channel: 'teams', ok: false, error: error.message });
    }
  }
  return { sent: results.some((row) => row.ok), results };
}

export async function notifyChannelsForProject(projectId, eventKey, buildMessage) {
  const loaded = await loadOrganizationForProject(projectId);
  if (!loaded?.organization) return;
  const message = typeof buildMessage === 'function' ? await buildMessage(loaded) : buildMessage;
  if (!message?.title) return;
  await deliverChannelNotification(loaded.organization, eventKey, message);
}

export async function formatActorName(actorId) {
  return actorLabel(actorId);
}

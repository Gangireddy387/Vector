import crypto from 'node:crypto';
import { Project, WebhookEndpoint } from '../../database/models.js';
import { ApiError } from '../../shared/errors/api-error.js';
import { logger } from '../../shared/logger.js';
import { decryptSecret, encryptSecret } from '../auth/mfa.js';
import { assertSafeWebhookUrl } from '../automations/automation.engine.js';
import { entitlementsFor } from '../plans/plan.service.js';
import { logWorkspaceAction } from '../workspace/workspace-audit.service.js';
import {
  MAX_WEBHOOK_ENDPOINTS,
  WEBHOOK_EVENT_SET,
  WEBHOOK_EVENTS,
  WEBHOOK_SECRET_PREFIX,
} from './webhook.constants.js';
import { signWebhookBody } from './webhook.sign.js';

const TIMEOUT_MS = 8_000;

function normalizeEvents(events) {
  const list = Array.isArray(events) ? events.map((e) => String(e).trim()).filter(Boolean) : [];
  const unique = [...new Set(list)];
  if (!unique.length) {
    throw ApiError.badRequest('Select at least one event', [{ path: 'events', message: 'Required' }]);
  }
  for (const event of unique) {
    if (!WEBHOOK_EVENT_SET.has(event)) {
      throw ApiError.badRequest(`Unknown event: ${event}`, [{ path: 'events', message: `Unknown event: ${event}` }]);
    }
  }
  return unique;
}

function normalizeUrl(raw) {
  let parsed;
  try {
    parsed = assertSafeWebhookUrl(raw);
  } catch (error) {
    throw ApiError.badRequest(error.message || 'Invalid webhook URL', [{ path: 'url', message: error.message || 'Invalid URL' }]);
  }
  if (parsed.protocol !== 'https:') {
    throw ApiError.badRequest('Webhook URL must use https', [{ path: 'url', message: 'Use https' }]);
  }
  return parsed.toString();
}

function toPublic(row) {
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    secretPrefix: row.secretPrefix,
    events: Array.isArray(row.events) ? row.events : [],
    enabled: Boolean(row.enabled),
    lastDeliveryAt: row.lastDeliveryAt,
    lastStatus: row.lastStatus,
    lastError: row.lastError,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function catalogEvents() {
  return [...WEBHOOK_EVENTS];
}

export async function listEndpoints(organizationId) {
  const rows = await WebhookEndpoint.findAll({
    where: { organizationId },
    order: [['createdAt', 'DESC']],
  });
  return { endpoints: rows.map(toPublic), events: catalogEvents() };
}

export async function createEndpoint(organization, actor, input) {
  if (!entitlementsFor(organization).features.webhooks) {
    throw ApiError.forbidden('Webhooks are not included in your plan. Ask the portal administrator to enable them.');
  }
  const name = String(input.name ?? '').trim().slice(0, 80);
  if (name.length < 2) {
    throw ApiError.badRequest('Name must be at least 2 characters', [{ path: 'name', message: 'Name must be at least 2 characters' }]);
  }
  const count = await WebhookEndpoint.count({ where: { organizationId: organization.id } });
  if (count >= MAX_WEBHOOK_ENDPOINTS) {
    throw ApiError.badRequest(`You can have at most ${MAX_WEBHOOK_ENDPOINTS} webhook endpoints`);
  }

  const url = normalizeUrl(input.url);
  const events = normalizeEvents(input.events);
  const secret = `${WEBHOOK_SECRET_PREFIX}${crypto.randomBytes(24).toString('base64url')}`;

  const row = await WebhookEndpoint.create({
    organizationId: organization.id,
    name,
    url,
    secretPrefix: secret.slice(0, 14),
    secretEncrypted: encryptSecret(secret),
    events,
    enabled: input.enabled !== false,
    createdById: actor.id,
  });

  await logWorkspaceAction({
    organizationId: organization.id,
    actorId: actor.id,
    action: 'webhook.created',
    targetType: 'webhook_endpoint',
    targetId: row.id,
    meta: { name, url, events },
  });

  return { secret, ...toPublic(row) };
}

export async function updateEndpoint(organization, actor, endpointId, input) {
  if (!entitlementsFor(organization).features.webhooks) {
    throw ApiError.forbidden('Webhooks are not included in your plan. Ask the portal administrator to enable them.');
  }
  const row = await WebhookEndpoint.findOne({ where: { id: endpointId, organizationId: organization.id } });
  if (!row) throw ApiError.notFound('Webhook endpoint not found');

  const updates = {};
  if (input.name !== undefined) {
    const name = String(input.name ?? '').trim().slice(0, 80);
    if (name.length < 2) {
      throw ApiError.badRequest('Name must be at least 2 characters', [{ path: 'name', message: 'Name must be at least 2 characters' }]);
    }
    updates.name = name;
  }
  if (input.url !== undefined) updates.url = normalizeUrl(input.url);
  if (input.events !== undefined) updates.events = normalizeEvents(input.events);
  if (input.enabled !== undefined) updates.enabled = Boolean(input.enabled);

  await row.update(updates);
  await logWorkspaceAction({
    organizationId: organization.id,
    actorId: actor.id,
    action: 'webhook.updated',
    targetType: 'webhook_endpoint',
    targetId: row.id,
    meta: { fields: Object.keys(updates) },
  });
  return toPublic(row);
}

export async function deleteEndpoint(organization, actor, endpointId) {
  const deleted = await WebhookEndpoint.destroy({ where: { id: endpointId, organizationId: organization.id } });
  if (!deleted) throw ApiError.notFound('Webhook endpoint not found');
  await logWorkspaceAction({
    organizationId: organization.id,
    actorId: actor.id,
    action: 'webhook.deleted',
    targetType: 'webhook_endpoint',
    targetId: endpointId,
    meta: {},
  });
  return { deleted: true };
}

async function postSigned(endpoint, envelope) {
  const secret = decryptSecret(endpoint.secretEncrypted);
  const body = JSON.stringify(envelope);
  const { signature, deliveryId, timestamp } = signWebhookBody(secret, body);
  const response = await fetch(endpoint.url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'user-agent': 'Vector-Webhooks/1.0',
      'x-vector-event': envelope.type,
      'x-vector-delivery-id': deliveryId,
      'x-vector-timestamp': timestamp,
      'x-vector-signature': signature,
    },
    body,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  return response;
}

async function recordDelivery(endpoint, response, errorMessage = null) {
  await endpoint.update({
    lastDeliveryAt: new Date(),
    lastStatus: response?.status ?? null,
    lastError: errorMessage ? String(errorMessage).slice(0, 500) : null,
  });
}

/**
 * Deliver one typed event to every enabled endpoint for the organization that subscribed to it.
 */
export async function deliverOrganizationEvent(organizationId, type, data, { actorId = null } = {}) {
  if (!organizationId || !WEBHOOK_EVENT_SET.has(type)) return { sent: 0 };

  const endpoints = await WebhookEndpoint.findAll({
    where: { organizationId, enabled: true },
  });
  const matching = endpoints.filter((row) => Array.isArray(row.events) && row.events.includes(type));
  if (!matching.length) return { sent: 0 };

  const envelope = {
    id: crypto.randomUUID(),
    type,
    createdAt: new Date().toISOString(),
    organizationId,
    actorId: actorId ?? null,
    data,
  };

  let sent = 0;
  for (const endpoint of matching) {
    try {
      const response = await postSigned(endpoint, envelope);
      if (!response.ok) {
        const text = await response.text().catch(() => '');
        await recordDelivery(endpoint, response, `HTTP ${response.status}: ${text.slice(0, 200)}`);
        logger.warn('webhook delivery failed', {
          organizationId,
          endpointId: endpoint.id,
          type,
          status: response.status,
        });
        continue;
      }
      await recordDelivery(endpoint, response, null);
      sent += 1;
    } catch (error) {
      await recordDelivery(endpoint, null, error.message);
      logger.warn('webhook delivery error', {
        organizationId,
        endpointId: endpoint.id,
        type,
        error: error.message,
      });
    }
  }
  return { sent };
}

export async function deliverProjectEvent(projectId, type, data, meta = {}) {
  if (!projectId) return { sent: 0 };
  const project = await Project.findByPk(projectId, { attributes: ['id', 'organizationId'] });
  if (!project?.organizationId) return { sent: 0 };
  return deliverOrganizationEvent(project.organizationId, type, { ...data, projectId: project.id }, meta);
}

export async function sendTestDelivery(organization, endpointId) {
  if (!entitlementsFor(organization).features.webhooks) {
    throw ApiError.forbidden('Webhooks are not included in your plan.');
  }
  const row = await WebhookEndpoint.findOne({ where: { id: endpointId, organizationId: organization.id } });
  if (!row) throw ApiError.notFound('Webhook endpoint not found');

  const envelope = {
    id: crypto.randomUUID(),
    type: 'webhook.test',
    createdAt: new Date().toISOString(),
    organizationId: organization.id,
    actorId: null,
    data: { message: 'Vector webhook test' },
  };

  try {
    const response = await postSigned(row, envelope);
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      await recordDelivery(row, response, `HTTP ${response.status}: ${text.slice(0, 200)}`);
      throw ApiError.badRequest(`Endpoint returned ${response.status}`);
    }
    await recordDelivery(row, response, null);
    return { ok: true, status: response.status, ...toPublic(await row.reload()) };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    await recordDelivery(row, null, error.message);
    throw ApiError.badRequest(error.message || 'Delivery failed');
  }
}

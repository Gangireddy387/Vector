import { ApiError } from '../../shared/errors/api-error.js';
import { assertSafeWebhookUrl } from '../automations/automation.engine.js';
import { entitlementsFor } from '../plans/plan.service.js';

export const CHANNEL_EVENTS = [
  'assigned',
  'commented',
  'due_soon',
  'status_changed',
  'sprint_started',
  'sprint_completed',
];

const DEFAULT_EVENTS = Object.freeze({
  assigned: true,
  commented: true,
  due_soon: true,
  status_changed: true,
  sprint_started: true,
  sprint_completed: true,
});

const SLACK_HOST = /(^|\.)hooks\.slack\.com$/i;
const TEAMS_HOST = /(^|\.)(webhook\.office\.com|office\.com|logic\.azure\.com)$/i;

function normalizeEvents(raw) {
  const next = { ...DEFAULT_EVENTS };
  if (raw && typeof raw === 'object') {
    for (const key of CHANNEL_EVENTS) {
      if (raw[key] !== undefined) next[key] = Boolean(raw[key]);
    }
  }
  return next;
}

function assertChannelUrl(raw, kind) {
  if (raw == null || raw === '') return null;
  const parsed = assertSafeWebhookUrl(raw);
  if (parsed.protocol !== 'https:') {
    throw ApiError.badRequest(`${kind} webhook must use https`, [
      { path: `channelNotifications.${kind}WebhookUrl`, message: 'Use an https webhook URL' },
    ]);
  }
  const host = parsed.hostname.toLowerCase();
  if (kind === 'slack' && !SLACK_HOST.test(host)) {
    throw ApiError.badRequest('Slack webhook must be a hooks.slack.com URL', [
      { path: 'channelNotifications.slackWebhookUrl', message: 'Paste a Slack Incoming Webhook URL' },
    ]);
  }
  if (kind === 'teams' && !TEAMS_HOST.test(host)) {
    throw ApiError.badRequest('Teams webhook must be a Microsoft Incoming Webhook URL', [
      { path: 'channelNotifications.teamsWebhookUrl', message: 'Paste a Teams Incoming Webhook URL' },
    ]);
  }
  return parsed.toString();
}

export function organizationHasChannelNotifyFeature(organization) {
  return Boolean(entitlementsFor(organization).features.channelNotifications);
}

function rawSettings(organization) {
  const value = organization?.channelNotifications;
  return value && typeof value === 'object' ? value : {};
}

/** Public settings shape (never includes full webhook URLs). */
export function publicChannelNotifications(organization) {
  const raw = rawSettings(organization);
  return {
    enabled: Boolean(raw.enabled),
    events: normalizeEvents(raw.events),
    slackConfigured: Boolean(raw.slackWebhookUrl),
    teamsConfigured: Boolean(raw.teamsWebhookUrl),
  };
}

export function channelNotifySettingsFor(organization) {
  if (!organizationHasChannelNotifyFeature(organization)) {
    return { available: false, ...publicChannelNotifications(null) };
  }
  return { available: true, ...publicChannelNotifications(organization) };
}

/**
 * Validates and returns the JSON to store.
 * Empty string for a webhook URL keeps the previously stored value; null clears it.
 */
export function cleanChannelNotifyInput(raw, organization) {
  if (!organizationHasChannelNotifyFeature(organization)) {
    throw ApiError.forbidden('Slack & Teams notifications are not included in your plan.');
  }
  const previous = rawSettings(organization);
  const incoming = raw && typeof raw === 'object' ? raw : {};
  const enabled = Boolean(incoming.enabled ?? previous.enabled);
  const events = normalizeEvents(incoming.events ?? previous.events);

  let slackWebhookUrl = previous.slackWebhookUrl ?? null;
  if (Object.prototype.hasOwnProperty.call(incoming, 'slackWebhookUrl')) {
    const value = incoming.slackWebhookUrl;
    if (value == null) slackWebhookUrl = null;
    else if (String(value).trim() === '') slackWebhookUrl = previous.slackWebhookUrl ?? null;
    else slackWebhookUrl = assertChannelUrl(value, 'slack');
  }

  let teamsWebhookUrl = previous.teamsWebhookUrl ?? null;
  if (Object.prototype.hasOwnProperty.call(incoming, 'teamsWebhookUrl')) {
    const value = incoming.teamsWebhookUrl;
    if (value == null) teamsWebhookUrl = null;
    else if (String(value).trim() === '') teamsWebhookUrl = previous.teamsWebhookUrl ?? null;
    else teamsWebhookUrl = assertChannelUrl(value, 'teams');
  }

  if (enabled && !slackWebhookUrl && !teamsWebhookUrl) {
    throw ApiError.badRequest('Add a Slack or Teams webhook URL before enabling channel notifications', [
      { path: 'channelNotifications.slackWebhookUrl', message: 'Add at least one webhook' },
    ]);
  }

  return {
    enabled,
    events,
    slackWebhookUrl,
    teamsWebhookUrl,
  };
}

/** Full config for delivery (includes secrets). */
export function channelNotifyDeliveryConfig(organization) {
  if (!organizationHasChannelNotifyFeature(organization)) return null;
  const raw = rawSettings(organization);
  if (!raw.enabled) return null;
  if (!raw.slackWebhookUrl && !raw.teamsWebhookUrl) return null;
  return {
    events: normalizeEvents(raw.events),
    slackWebhookUrl: raw.slackWebhookUrl || null,
    teamsWebhookUrl: raw.teamsWebhookUrl || null,
  };
}

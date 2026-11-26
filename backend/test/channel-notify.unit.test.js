/*
 * Slack / Teams channel notification settings helpers (no network).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  cleanChannelNotifyInput,
  publicChannelNotifications,
} from '../src/modules/integrations/organization-channel-notify.js';

describe('organization-channel-notify', () => {
  it('publicChannelNotifications redacts webhook URLs', () => {
    const published = publicChannelNotifications({
      channelNotifications: {
        enabled: true,
        slackWebhookUrl: 'https://hooks.slack.com/services/T/B/xxx',
        teamsWebhookUrl: null,
        events: { assigned: false },
      },
    });
    assert.equal(published.enabled, true);
    assert.equal(published.slackConfigured, true);
    assert.equal(published.teamsConfigured, false);
    assert.equal(published.events.assigned, false);
    assert.equal(published.events.commented, true);
    assert.equal(published.events.status_changed, true);
    assert.equal(published.events.sprint_completed, true);
    assert.equal(published.slackWebhookUrl, undefined);
  });

  it('cleanChannelNotifyInput requires the plan feature and a webhook when enabling', () => {
    const noFeature = { plan: { features: { channelNotifications: false } }, channelNotifications: null };
    assert.throws(() => cleanChannelNotifyInput({ enabled: true }, noFeature), /not included/);

    const org = { plan: { features: { channelNotifications: true } }, channelNotifications: null };
    assert.throws(() => cleanChannelNotifyInput({ enabled: true }, org), /webhook/i);

    const saved = cleanChannelNotifyInput(
      {
        enabled: true,
        slackWebhookUrl: 'https://hooks.slack.com/services/T000/B000/XXX',
        events: { assigned: true, commented: false },
      },
      org,
    );
    assert.equal(saved.enabled, true);
    assert.equal(saved.events.commented, false);
    assert.match(saved.slackWebhookUrl, /hooks\.slack\.com/);

    const kept = cleanChannelNotifyInput(
      { enabled: true, slackWebhookUrl: '', events: { assigned: true, commented: false, due_soon: true, sprint_started: true } },
      { plan: { features: { channelNotifications: true } }, channelNotifications: saved },
    );
    assert.equal(kept.slackWebhookUrl, saved.slackWebhookUrl);
  });

  it('rejects non-Slack hosts for the Slack field', () => {
    const org = { plan: { features: { channelNotifications: true } }, channelNotifications: null };
    assert.throws(
      () => cleanChannelNotifyInput({ enabled: true, slackWebhookUrl: 'https://example.com/hooks' }, org),
      /hooks\.slack\.com/i,
    );
  });
});

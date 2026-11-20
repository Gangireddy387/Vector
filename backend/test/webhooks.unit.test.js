/*
 * Outbound webhook signing helpers (no network).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { WEBHOOK_EVENTS } from '../src/modules/webhooks/webhook.constants.js';
import { signWebhookBody, verifyWebhookSignature } from '../src/modules/webhooks/webhook.sign.js';

describe('webhook.sign', () => {
  it('signs and verifies a delivery', () => {
    const secret = 'whsec_test_secret';
    const body = JSON.stringify({ type: 'issue.created', data: { issue: { key: 'VEC-1' } } });
    const { signature, deliveryId, timestamp } = signWebhookBody(secret, body);
    assert.equal(typeof signature, 'string');
    assert.equal(signature.length, 64);
    assert.ok(verifyWebhookSignature(secret, body, { signature, deliveryId, timestamp }));
    assert.equal(verifyWebhookSignature('wrong', body, { signature, deliveryId, timestamp }), false);
  });

  it('rejects stale timestamps', () => {
    const secret = 'whsec_test_secret';
    const body = '{}';
    const { signature, deliveryId } = signWebhookBody(secret, body, { deliveryId: 'abc' });
    assert.equal(
      verifyWebhookSignature(secret, body, {
        signature,
        deliveryId,
        timestamp: String(Math.floor(Date.now() / 1000) - 10_000),
        toleranceSec: 300,
      }),
      false,
    );
  });
});

describe('webhook.constants', () => {
  it('lists stable event types', () => {
    assert.ok(WEBHOOK_EVENTS.includes('issue.created'));
    assert.ok(WEBHOOK_EVENTS.includes('sprint.completed'));
    assert.ok(WEBHOOK_EVENTS.includes('project.member_added'));
    assert.ok(WEBHOOK_EVENTS.includes('workspace.audit.created'));
  });
});

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { recordFail, recordOk, resetSignals, signalsSnapshot } from '../src/shared/ops/signals.js';

describe('ops signals', () => {
  it('counts successes and failures per area', () => {
    resetSignals();
    recordOk('stripe', 'webhook');
    recordOk('jobs', 'daily-digest');
    recordFail('jobs', 'daily-digest', new Error('SMTP down'));
    recordFail('automations', 'rule', 'webhook blocked');

    const snap = signalsSnapshot();
    assert.equal(snap.stripe.webhook.ok, 1);
    assert.equal(snap.stripe.webhook.failed, 0);
    assert.equal(snap.jobs['daily-digest'].ok, 1);
    assert.equal(snap.jobs['daily-digest'].failed, 1);
    assert.match(snap.jobs['daily-digest'].lastError, /SMTP/);
    assert.equal(snap.automations.rule.failed, 1);
    assert.equal(snap.recent.length, 4);
    assert.equal(snap.recent[0].ok, false);
  });
});

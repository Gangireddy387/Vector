import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { describe, it } from 'node:test';
import { newGithubWebhookSecret, secretPrefixOf, verifyGithubSignature } from '../src/modules/integrations/github/github-webhook.verify.js';

describe('github webhook signature', () => {
  it('accepts a valid sha256 HMAC', () => {
    const secret = 'test-secret';
    const body = Buffer.from('{"zen":"Keep it logically awesome."}');
    const digest = crypto.createHmac('sha256', secret).update(body).digest('hex');
    assert.equal(verifyGithubSignature(body, `sha256=${digest}`, secret), true);
  });

  it('rejects a bad signature', () => {
    const body = Buffer.from('{"ok":true}');
    assert.equal(verifyGithubSignature(body, 'sha256=deadbeef', 'secret'), false);
    assert.equal(verifyGithubSignature(body, null, 'secret'), false);
  });

  it('creates secrets with a stable prefix', () => {
    const secret = newGithubWebhookSecret();
    assert.equal(secret.length, 64);
    assert.equal(secretPrefixOf(secret), secret.slice(0, 8));
  });
});

/*
 * Audit SIEM serialization (CloudEvents / JSONL) — no database.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { serializeAuditEvent } from '../src/modules/workspace/workspace-audit.service.js';

describe('serializeAuditEvent', () => {
  it('emits a CloudEvents-style envelope with org and client metadata', () => {
    const createdAt = new Date('2026-11-20T08:00:00.000Z');
    const event = serializeAuditEvent(
      {
        id: 'evt-1',
        action: 'auth.login',
        targetType: 'user',
        targetId: 'u-1',
        meta: { method: 'oidc', ip: '203.0.113.9', userAgent: 'curl/8' },
        createdAt,
        actor: { id: 'u-1', email: 'ada@acme.com', name: 'Ada' },
      },
      { id: 'org-1', slug: 'acme', name: 'Acme' },
    );

    assert.equal(event.specversion, '1.0');
    assert.equal(event.type, 'vector.workspace.audit');
    assert.equal(event.id, 'evt-1');
    assert.equal(event.time, createdAt.toISOString());
    assert.equal(event.data.organizationSlug, 'acme');
    assert.equal(event.data.category, 'auth');
    assert.equal(event.data.action, 'auth.login');
    assert.equal(event.data.actor.email, 'ada@acme.com');
    assert.equal(event.data.client.ip, '203.0.113.9');
    assert.equal(event.data.target.id, 'u-1');
  });

  it('marks non-auth actions as admin', () => {
    const event = serializeAuditEvent(
      {
        id: 'evt-2',
        action: 'member.invited',
        targetType: null,
        targetId: null,
        meta: { email: 'bob@acme.com' },
        createdAt: '2026-11-20T09:00:00.000Z',
        actor: null,
      },
      null,
    );
    assert.equal(event.data.category, 'admin');
    assert.equal(event.data.organizationId, null);
    assert.equal(event.data.actor, null);
  });
});

/* Unit tests for automation conditions and webhook SSRF checks. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { assertSafeWebhookUrl, conditionMatches } from '../src/modules/automations/automation.engine.js';

describe('conditionMatches', () => {
  const issue = {
    priority: 'high',
    type: 'bug',
    storyPoints: 5,
    title: 'Login fails on mobile',
    assigneeId: 'user-1',
    status: { category: 'in_progress' },
    labels: [{ id: 'label-a' }, { id: 'label-b' }],
  };

  it('matches equality and inequality', () => {
    assert.equal(conditionMatches({ field: 'priority', operator: 'equals', value: 'high' }, issue), true);
    assert.equal(conditionMatches({ field: 'priority', operator: 'not_equals', value: 'low' }, issue), true);
    assert.equal(conditionMatches({ field: 'priority', operator: 'equals', value: 'low' }, issue), false);
  });

  it('matches in / not_in lists', () => {
    assert.equal(conditionMatches({ field: 'type', operator: 'in', value: ['bug', 'task'] }, issue), true);
    assert.equal(conditionMatches({ field: 'type', operator: 'not_in', value: ['story'] }, issue), true);
  });

  it('matches contains, emptiness and numeric comparisons', () => {
    assert.equal(conditionMatches({ field: 'title', operator: 'contains', value: 'LOGIN' }, issue), true);
    assert.equal(conditionMatches({ field: 'assigneeId', operator: 'is_not_empty', value: null }, issue), true);
    assert.equal(conditionMatches({ field: 'reporterId', operator: 'is_empty', value: null }, issue), true);
    assert.equal(conditionMatches({ field: 'storyPoints', operator: 'gt', value: 3 }, issue), true);
    assert.equal(conditionMatches({ field: 'storyPoints', operator: 'lt', value: 3 }, issue), false);
  });

  it('reads status category and label membership', () => {
    assert.equal(conditionMatches({ field: 'statusCategory', operator: 'equals', value: 'in_progress' }, issue), true);
    assert.equal(conditionMatches({ field: 'labelId', operator: 'equals', value: 'label-a' }, issue), true);
    assert.equal(conditionMatches({ field: 'labelId', operator: 'equals', value: 'missing' }, issue), false);
  });

  it('reads fromStatusId from change history', () => {
    assert.equal(
      conditionMatches({ field: 'fromStatusId', operator: 'equals', value: 'status-old' }, issue, {
        statusId: { from: 'status-old', to: 'status-new' },
      }),
      true,
    );
  });

  it('matches custom field values by type', () => {
    const withCf = {
      ...issue,
      customFieldValues: [
        { fieldId: 'cf-text', value: 'Critical path' },
        { fieldId: 'cf-num', value: 42 },
        { fieldId: 'cf-date', value: '2026-11-20' },
        { fieldId: 'cf-select', value: 'High' },
        { fieldId: 'cf-multi', value: ['a', 'b'] },
        { fieldId: 'cf-check', value: true },
      ],
    };

    assert.equal(
      conditionMatches({ field: 'customField', customFieldId: 'cf-text', operator: 'contains', value: 'critical' }, withCf),
      true,
    );
    assert.equal(
      conditionMatches({ field: 'customField', customFieldId: 'cf-num', operator: 'gt', value: 40 }, withCf),
      true,
    );
    assert.equal(
      conditionMatches({ field: 'customField', customFieldId: 'cf-date', operator: 'lt', value: '2026-12-01' }, withCf),
      true,
    );
    assert.equal(
      conditionMatches({ field: 'customField', customFieldId: 'cf-select', operator: 'equals', value: 'High' }, withCf),
      true,
    );
    assert.equal(
      conditionMatches({ field: 'customField', customFieldId: 'cf-multi', operator: 'equals', value: 'a' }, withCf),
      true,
    );
    assert.equal(
      conditionMatches({ field: 'customField', customFieldId: 'cf-check', operator: 'equals', value: true }, withCf),
      true,
    );
    assert.equal(
      conditionMatches({ field: 'customField', customFieldId: 'cf-missing', operator: 'is_empty', value: null }, withCf),
      true,
    );
  });
});

describe('assertSafeWebhookUrl', () => {
  it('allows public https hosts', () => {
    assert.equal(assertSafeWebhookUrl('https://hooks.example.com/vector').hostname, 'hooks.example.com');
  });

  it('rejects localhost, private ranges and metadata hosts', () => {
    for (const url of [
      'http://localhost/hook',
      'http://127.0.0.1/hook',
      'http://10.0.0.5/hook',
      'http://192.168.1.10/hook',
      'http://172.16.0.2/hook',
      'http://metadata.google.internal/',
      'http://svc.internal/hook',
      'ftp://example.com/hook',
    ]) {
      assert.throws(() => assertSafeWebhookUrl(url), (error) => /private|local|http\(s\)/i.test(error.message));
    }
  });
});

/* Unit tests for automation conditions; run with `npm test` / `node --test test/automations.unit.test.js`. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { conditionMatches } from '../src/modules/automations/automation.engine.js';

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
});

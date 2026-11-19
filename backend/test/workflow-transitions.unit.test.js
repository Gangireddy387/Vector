import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ApiError } from '../src/shared/errors/api-error.js';

/** Lightweight stand-in for the DB-backed assert — mirrors whitelist + flag rules. */
function assertLocal(rule, issue, toStatusId, changes = {}, context = {}) {
  if (!toStatusId || toStatusId === issue.statusId) return;
  if (context.source === 'system') return;
  if (!rule) return;
  if (!(rule.toStatusIds ?? []).includes(toStatusId)) {
    throw new ApiError(400, 'Illegal transition');
  }
  if (rule.requireAssignee) {
    const nextAssignee = 'assigneeId' in changes ? changes.assigneeId : issue.assigneeId;
    if (!nextAssignee) throw new ApiError(400, 'Assign someone');
  }
  if (rule.requireComment) {
    const comment = typeof changes.transitionComment === 'string' ? changes.transitionComment.trim() : '';
    if (!comment) throw new ApiError(400, 'Add a comment', { code: 'transition_comment_required' });
  }
}

describe('workflow transition rules', () => {
  const issue = { statusId: 'todo', assigneeId: null };

  it('allows any move when no rule exists', () => {
    assert.doesNotThrow(() => assertLocal(null, issue, 'done'));
  });

  it('blocks targets outside the whitelist', () => {
    assert.throws(() => assertLocal({ toStatusIds: ['progress'] }, issue, 'done'), ApiError);
    assert.doesNotThrow(() => assertLocal({ toStatusIds: ['progress'] }, issue, 'progress'));
  });

  it('requires assignee and comment when flagged', () => {
    const rule = { toStatusIds: ['done'], requireAssignee: true, requireComment: true };
    assert.throws(() => assertLocal(rule, issue, 'done'), /Assign/);
    assert.throws(() => assertLocal(rule, { ...issue, assigneeId: 'u1' }, 'done'), /comment/i);
    assert.doesNotThrow(() =>
      assertLocal(rule, { ...issue, assigneeId: 'u1' }, 'done', { transitionComment: 'Shipped' }),
    );
  });

  it('bypasses rules for system updates', () => {
    assert.doesNotThrow(() =>
      assertLocal({ toStatusIds: [] }, issue, 'done', {}, { source: 'system' }),
    );
  });
});

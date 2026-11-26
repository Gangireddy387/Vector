import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildCfd } from '../src/modules/reports/report.service.js';

const day = (offset) => {
  const date = new Date(2025, 0, 1 + offset, 12, 0, 0, 0);
  return date;
};

describe('buildCfd', () => {
  const statuses = [
    { id: 's-todo', name: 'To Do', category: 'todo' },
    { id: 's-prog', name: 'In Progress', category: 'in_progress' },
    { id: 's-done', name: 'Done', category: 'done' },
  ];

  it('counts issues by category at each bucket using status history', () => {
    const issues = [
      { id: 'a', statusId: 's-done', createdAt: day(0) },
      { id: 'b', statusId: 's-prog', createdAt: day(0) },
    ];
    const changes = [
      { issueId: 'a', fromValue: 'To Do', toValue: 'In Progress', createdAt: day(1) },
      { issueId: 'a', fromValue: 'In Progress', toValue: 'Done', createdAt: day(3) },
      { issueId: 'b', fromValue: 'To Do', toValue: 'In Progress', createdAt: day(2) },
    ];

    const series = buildCfd(statuses, issues, changes, day(0), day(4), 1);
    assert.equal(series.length, 5);

    // End of first day (before moves at noon day 1): both still To Do.
    assert.deepEqual(
      { todo: series[0].todo, inProgress: series[0].inProgress, done: series[0].done },
      { todo: 2, inProgress: 0, done: 0 },
    );
    // Bucket ending day 2 start: a moved on day 1, b still To Do until day 2 noon.
    assert.deepEqual(
      { todo: series[1].todo, inProgress: series[1].inProgress, done: series[1].done },
      { todo: 1, inProgress: 1, done: 0 },
    );
    // Final bucket (through now): a Done, b In Progress.
    const last = series.at(-1);
    assert.deepEqual({ todo: last.todo, inProgress: last.inProgress, done: last.done }, { todo: 0, inProgress: 1, done: 1 });
  });

  it('ignores issues not yet created at a bucket end', () => {
    const issues = [{ id: 'late', statusId: 's-todo', createdAt: day(3) }];
    const series = buildCfd(statuses, issues, [], day(0), day(4), 1);
    assert.equal(series[0].total, 0);
    assert.equal(series.at(-1).todo, 1);
  });
});

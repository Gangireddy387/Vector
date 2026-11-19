import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildDependencyGraph, issueEffortMinutes } from '../src/modules/issues/issue-dependencies.js';

const issue = (id, overrides = {}) => ({
  id,
  key: id.toUpperCase(),
  title: id,
  type: 'task',
  priority: 'medium',
  statusCategory: 'todo',
  statusName: 'To do',
  assignee: null,
  estimateMinutes: null,
  storyPoints: null,
  ...overrides,
});

describe('issueEffortMinutes', () => {
  it('prefers estimate minutes, then story points, then a default day', () => {
    assert.equal(issueEffortMinutes({ estimateMinutes: 90 }), 90);
    assert.equal(issueEffortMinutes({ storyPoints: 2 }), 480);
    assert.equal(issueEffortMinutes({}), 480);
  });
});

describe('buildDependencyGraph', () => {
  it('finds the critical path along the longest unfinished blocks chain', () => {
    const issues = [
      issue('a', { estimateMinutes: 60 }),
      issue('b', { estimateMinutes: 120 }),
      issue('c', { estimateMinutes: 180 }),
      issue('d', { estimateMinutes: 30, statusCategory: 'done' }),
    ];
    const links = [
      { id: '1', type: 'blocks', sourceIssueId: 'a', targetIssueId: 'b' },
      { id: '2', type: 'blocks', sourceIssueId: 'b', targetIssueId: 'c' },
      { id: '3', type: 'blocks', sourceIssueId: 'd', targetIssueId: 'c' },
    ];

    const graph = buildDependencyGraph({ issues, links });
    assert.deepEqual(graph.criticalPath.issueIds, ['a', 'b', 'c']);
    assert.equal(graph.criticalPath.lengthMinutes, 60 + 120 + 180);
    assert.equal(graph.stats.openBlocked, 2);
    assert.ok(graph.nodes.find((node) => node.id === 'c').onCriticalPath);
    assert.equal(graph.nodes.find((node) => node.id === 'c').layer, 2);
  });

  it('lists open issues waiting on unfinished blockers', () => {
    const graph = buildDependencyGraph({
      issues: [issue('blocker'), issue('blocked')],
      links: [{ id: '1', type: 'blocks', sourceIssueId: 'blocker', targetIssueId: 'blocked' }],
    });
    assert.equal(graph.blockedNow.length, 1);
    assert.equal(graph.blockedNow[0].id, 'blocked');
    assert.equal(graph.blockedNow[0].waitingOn[0].id, 'blocker');
  });

  it('detects cycles in blocks links', () => {
    const graph = buildDependencyGraph({
      issues: [issue('a'), issue('b')],
      links: [
        { id: '1', type: 'blocks', sourceIssueId: 'a', targetIssueId: 'b' },
        { id: '2', type: 'blocks', sourceIssueId: 'b', targetIssueId: 'a' },
      ],
    });
    assert.ok(graph.cycles.length >= 1);
    assert.equal(graph.stats.cycleCount, graph.cycles.length);
  });

  it('ignores relates_to for the critical path', () => {
    const graph = buildDependencyGraph({
      issues: [issue('a'), issue('b')],
      links: [{ id: '1', type: 'relates_to', sourceIssueId: 'a', targetIssueId: 'b' }],
    });
    assert.equal(graph.edges.length, 0);
    assert.deepEqual(graph.criticalPath.issueIds, []);
  });
});

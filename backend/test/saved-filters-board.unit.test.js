import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  boardCriteriaSchema,
  createSavedFilterSchema,
  listSavedFiltersQuery,
} from '../src/modules/saved-filters/saved-filter.validation.js';

describe('board saved views', () => {
  it('accepts board criteria with filters and groupBy', () => {
    const parsed = boardCriteriaSchema.parse({
      types: 'bug,task',
      assigneeIds: 'unassigned,11111111-1111-4111-8111-111111111111',
      groupBy: 'assignee',
      density: 'compact',
    });
    assert.equal(parsed.groupBy, 'assignee');
    assert.equal(parsed.density, 'compact');
  });

  it('defaults list surface to issues and accepts board', () => {
    assert.equal(listSavedFiltersQuery.parse({}).surface, 'issues');
    assert.equal(listSavedFiltersQuery.parse({ surface: 'board' }).surface, 'board');
  });

  it('creates a board view payload', () => {
    const created = createSavedFilterSchema.parse({
      name: 'Overdue by epic',
      surface: 'board',
      criteria: { quick: 'overdue', groupBy: 'epic' },
    });
    assert.equal(created.surface, 'board');
    assert.equal(created.criteria.groupBy, 'epic');
  });

  it('rejects unknown board keys and empty criteria', () => {
    assert.throws(() => boardCriteriaSchema.parse({ hack: '1' }));
    assert.throws(() => boardCriteriaSchema.parse({}));
  });
});

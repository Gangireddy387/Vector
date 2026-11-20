import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { extractWikiRefs } from '../src/modules/wiki/wiki-refs.js';

describe('wiki refs', () => {
  it('extracts [[Title]] and [[Title|uuid]] links', () => {
    const id = '11111111-1111-4111-8111-111111111111';
    const refs = extractWikiRefs(`See [[Handbook]] and [[Runbook|${id}]] then wiki:${id}`);
    assert.deepEqual(refs.titles, ['Handbook']);
    assert.ok(refs.pageIds.includes(id));
  });

  it('extracts /wiki/:id forms', () => {
    const id = '22222222-2222-4222-8222-222222222222';
    const refs = extractWikiRefs(`Open /wiki/${id} for details`);
    assert.deepEqual(refs.pageIds, [id]);
    assert.deepEqual(refs.titles, []);
  });

  it('dedupes titles case-sensitively by exact text but keeps unique strings', () => {
    const refs = extractWikiRefs('[[A]] [[A]] [[B]]');
    assert.deepEqual(refs.titles, ['A', 'B']);
  });
});

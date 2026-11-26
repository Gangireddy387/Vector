import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ACCOUNT_EXPORT_FORMAT,
  ACCOUNT_EXPORT_VERSION,
  COLLECTION_LIMIT,
  clipCollection,
} from '../src/modules/auth/account-export.service.js';

describe('account export helpers', () => {
  it('exposes a stable portable-copy format', () => {
    assert.equal(ACCOUNT_EXPORT_FORMAT, 'vector-account-export');
    assert.equal(ACCOUNT_EXPORT_VERSION, 2);
    assert.ok(COLLECTION_LIMIT >= 1000);
  });

  it('clips oversized collections and reports truncation', () => {
    const rows = Array.from({ length: 12 }, (_, index) => ({ id: index }));
    const clipped = clipCollection(rows, 10);
    assert.equal(clipped.items.length, 10);
    assert.equal(clipped.truncated, true);
    assert.equal(clipped.total, 12);
    assert.deepEqual(
      clipped.items.map((row) => row.id),
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    );
  });

  it('leaves short collections untouched', () => {
    const rows = [{ id: 'a' }, { id: 'b' }];
    const clipped = clipCollection(rows, 10);
    assert.equal(clipped.truncated, false);
    assert.equal(clipped.items.length, 2);
    assert.equal(clipped.total, 2);
  });
});

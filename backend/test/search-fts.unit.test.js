import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { rankBonus, recencyBoost, sanitizeFtsTerm } from '../src/modules/search/search-fts.js';

describe('search FTS helpers', () => {
  it('strips LIKE wildcards and query operators', () => {
    assert.equal(sanitizeFtsTerm("  login%_ 'boom'  "), 'login boom');
  });

  it('caps rank bonus', () => {
    assert.equal(rankBonus(0), 0);
    assert.equal(rankBonus(0.1), 12);
    assert.equal(rankBonus(10), 40);
  });

  it('boosts recent dates more than old ones', () => {
    const fresh = recencyBoost(new Date());
    const stale = recencyBoost(new Date(Date.now() - 90 * 86_400_000));
    assert.ok(fresh > stale);
    assert.ok(fresh <= 15);
  });
});

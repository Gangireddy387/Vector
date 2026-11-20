import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  normalizeAiGrounding,
  publicAiGrounding,
  searchQueryFromText,
} from '../src/modules/ai/ai.grounding.js';

describe('AI grounding helpers', () => {
  it('normalizes and publishes org instructions', () => {
    assert.deepEqual(publicAiGrounding(null), { instructions: '' });
    assert.deepEqual(publicAiGrounding({ aiGrounding: { instructions: '  Prefer short sentences.  ' } }), {
      instructions: 'Prefer short sentences.',
    });
    assert.deepEqual(normalizeAiGrounding({ instructions: '  Keep keys like WEB-12.  ' }), {
      instructions: 'Keep keys like WEB-12.',
    });
    assert.equal(normalizeAiGrounding({ instructions: 'x'.repeat(5000) }).instructions.length, 4000);
  });

  it('builds a short search query from draft text', () => {
    const query = searchQueryFromText('The login crash on production for checkout flow is urgent');
    assert.match(query, /login/i);
    assert.match(query, /checkout/i);
    assert.doesNotMatch(query, /\bthe\b/i);
    assert.ok(query.split(/\s+/).length <= 8);
  });
});

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ApiError } from '../src/shared/errors/api-error.js';
import { normalizeFieldValue } from '../src/modules/custom-fields/custom-field.service.js';

const field = (overrides = {}) => ({
  name: 'Severity',
  type: 'text',
  options: [],
  required: false,
  ...overrides,
});

describe('custom field value normalization', () => {
  it('accepts text and clears empty optional values', () => {
    assert.equal(normalizeFieldValue(field(), '  hello  '), 'hello');
    assert.equal(normalizeFieldValue(field(), ''), null);
  });

  it('requires values when marked required', () => {
    assert.throws(() => normalizeFieldValue(field({ required: true }), ''), ApiError);
  });

  it('validates select options and multi-select lists', () => {
    const select = field({ type: 'select', options: ['Low', 'High'] });
    assert.equal(normalizeFieldValue(select, 'High'), 'High');
    assert.throws(() => normalizeFieldValue(select, 'Medium'), ApiError);

    const multi = field({ type: 'multi_select', options: ['A', 'B', 'C'] });
    assert.deepEqual(normalizeFieldValue(multi, ['A', 'C', 'A']), ['A', 'C']);
    assert.throws(() => normalizeFieldValue(multi, ['A', 'Z']), ApiError);
  });

  it('validates numbers, dates, checkboxes and urls', () => {
    assert.equal(normalizeFieldValue(field({ type: 'number' }), '12.5'), 12.5);
    assert.equal(normalizeFieldValue(field({ type: 'date' }), '2026-11-19'), '2026-11-19');
    assert.equal(normalizeFieldValue(field({ type: 'checkbox' }), true), true);
    assert.equal(normalizeFieldValue(field({ type: 'url' }), 'https://example.com/x'), 'https://example.com/x');
    assert.throws(() => normalizeFieldValue(field({ type: 'url' }), 'ftp://x'), ApiError);
  });
});

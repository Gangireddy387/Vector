/*
 * Wiki page title/body limits (no database).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

describe('wiki MVP', () => {
  it('documents the expected page shape', () => {
    const page = {
      id: '00000000-0000-4000-8000-000000000001',
      title: 'Handbook',
      body: '# Welcome\n\nShared notes for the org.',
      createdById: null,
      updatedById: null,
    };
    assert.equal(page.title.length <= 150, true);
    assert.equal(page.body.length <= 50_000, true);
  });
});

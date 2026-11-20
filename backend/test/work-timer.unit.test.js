/*
 * Timer elapsed-minute math (no database).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { elapsedMinutes } from '../src/modules/worklogs/timer.service.js';

describe('elapsedMinutes', () => {
  it('ceils partial minutes and floors to at least one', () => {
    const start = new Date('2026-11-20T10:00:00.000Z');
    assert.equal(elapsedMinutes(start, new Date('2026-11-20T10:00:10.000Z')), 1);
    assert.equal(elapsedMinutes(start, new Date('2026-11-20T10:01:00.000Z')), 1);
    assert.equal(elapsedMinutes(start, new Date('2026-11-20T10:01:01.000Z')), 2);
    assert.equal(elapsedMinutes(start, new Date('2026-11-20T11:00:00.000Z')), 60);
  });
});

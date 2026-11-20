import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { listTeamEventsQuery } from '../src/modules/calendar/calendar.validation.js';

describe('team calendar query', () => {
  it('defaults kinds and parses a subset', () => {
    const full = listTeamEventsQuery.parse({
      teamId: '11111111-1111-4111-8111-111111111111',
      from: '2026-11-01',
      to: '2026-11-30',
    });
    assert.deepEqual(full.kinds, ['meeting', 'due', 'other']);

    const subset = listTeamEventsQuery.parse({
      teamId: '11111111-1111-4111-8111-111111111111',
      from: '2026-11-01',
      to: '2026-11-07',
      kinds: 'meeting,due,personal,due',
    });
    assert.deepEqual(subset.kinds, ['meeting', 'due']);
  });

  it('rejects inverted ranges', () => {
    assert.throws(() =>
      listTeamEventsQuery.parse({
        teamId: '11111111-1111-4111-8111-111111111111',
        from: '2026-11-10',
        to: '2026-11-01',
      }),
    );
  });
});

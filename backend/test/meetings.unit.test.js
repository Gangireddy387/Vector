/* Unit tests for the meeting logic that needs no database or server: run with `npm run test:meetings:unit`. */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { config } from '../src/config/index.js';
import { decrypt, encrypt } from '../src/modules/calendar-sync/crypto.js';
import { PROVIDERS } from '../src/modules/calendar-sync/providers.js';
import { cleanBoardItem } from '../src/modules/meetings/meeting.collab.js';
import { meetingIcs } from '../src/modules/meetings/meeting.ics.js';
import { dialInFor, isPhoneIdentity, phoneCallerName } from '../src/modules/meetings/meeting.phone.js';
import { matchOwner } from '../src/modules/meetings/meeting.summary.js';
import { callCapacity, mediaFor, publishSources, sfuEnabled } from '../src/modules/meetings/meeting.media.js';
import { remindedAtFor, whenFor } from '../src/modules/meetings/meeting.notify.js';
import { nextStart } from '../src/modules/meetings/meeting.recurrence.js';
import { ringsNow } from '../src/modules/meetings/meeting.signaling.js';
import { effectiveStatus } from '../src/shared/realtime/presence.js';
import { shared } from '../src/shared/realtime/shared-state.js';

const meeting = {
  id: '11111111-2222-3333-4444-555555555555',
  title: 'Planning, Q4; budget',
  agenda: 'Line one\nLine two',
  startsAt: '2026-11-03T04:00:00.000Z',
  durationMinutes: 45,
  status: 'scheduled',
  updatedAt: '2026-10-30T10:00:00.000Z',
};

describe('calendar files', () => {
  const ics = meetingIcs({
    meeting,
    url: 'https://app.example.com/acme/meetings/1',
    organizer: { name: 'Host Person', email: 'host@example.com' },
    attendees: [{ name: 'Guest, One', email: 'one@example.com' }],
  });
  const lines = ics.split('\r\n');

  it('describes the event in UTC with its end time', () => {
    assert.ok(lines.includes('DTSTART:20261103T040000Z'));
    assert.ok(lines.includes('DTEND:20261103T044500Z'));
    assert.ok(lines.includes(`UID:${meeting.id}@vector`));
    assert.ok(lines.includes('METHOD:REQUEST'));
  });

  it('escapes commas, semicolons and line breaks', () => {
    assert.ok(lines.includes('SUMMARY:Planning\\, Q4\\; budget'));
    assert.ok(ics.includes('Line one\\nLine two'));
    assert.ok(ics.includes('CN=Guest\\, One'));
  });

  it('folds long lines at 75 bytes', () => {
    const long = meetingIcs({ meeting: { ...meeting, agenda: 'é'.repeat(200) }, url: 'https://x.test' });
    for (const line of long.split('\r\n')) assert.ok(Buffer.byteLength(line) <= 75, `line too long: ${line.length}`);
  });

  it('marks cancellations and drops the alarm', () => {
    const cancelled = meetingIcs({ meeting, url: 'https://x.test', method: 'CANCEL' });
    assert.ok(cancelled.includes('STATUS:CANCELLED'));
    assert.ok(cancelled.includes('METHOD:CANCEL'));
    assert.ok(!cancelled.includes('BEGIN:VALARM'));
  });

  it('raises the sequence when the meeting changes', () => {
    const later = meetingIcs({ meeting: { ...meeting, updatedAt: '2026-10-31T10:00:00.000Z' }, url: 'https://x.test' });
    const sequence = (text) => Number(text.match(/SEQUENCE:(\d+)/)[1]);
    assert.ok(sequence(later) > sequence(ics));
  });
});

describe('repeating meetings', () => {
  it('keeps the local time across a daylight-saving change', () => {
    // 09:30 in New York on Friday 30 October 2026 (EDT, UTC-4); clocks go back on 1 November.
    const startsAt = new Date('2026-10-30T13:30:00.000Z');
    const next = nextStart({ startsAt, recurrence: 'weekly', timeZone: 'America/New_York', after: startsAt });
    assert.equal(next.toISOString(), '2026-11-06T14:30:00.000Z');
  });

  it('skips weekends for weekday meetings', () => {
    const friday = new Date('2026-10-30T09:00:00.000Z');
    const next = nextStart({ startsAt: friday, recurrence: 'weekdays', timeZone: 'UTC', after: friday });
    assert.equal(next.toISOString(), '2026-11-02T09:00:00.000Z');
  });

  it('uses the last day of shorter months', () => {
    const jan31 = new Date('2027-01-31T09:00:00.000Z');
    const next = nextStart({ startsAt: jan31, recurrence: 'monthly', timeZone: 'UTC', anchorDay: 31, after: jan31 });
    assert.equal(next.toISOString(), '2027-02-28T09:00:00.000Z');
  });
});

describe('ringing and reminders', () => {
  const startsAt = new Date('2026-11-03T10:00:00.000Z');

  it('does not ring when a call is started long before its time', () => {
    assert.equal(ringsNow({ startsAt }, startsAt.getTime() - 60 * 60_000), false);
    assert.equal(ringsNow({ startsAt }, startsAt.getTime() - 10 * 60_000), true);
    assert.equal(ringsNow({ startsAt }, startsAt.getTime() + 5 * 60_000), true);
  });

  it('counts a meeting that starts soon as already reminded', () => {
    assert.ok(remindedAtFor(startsAt, startsAt.getTime() - 5 * 60_000) instanceof Date);
    assert.equal(remindedAtFor(startsAt, startsAt.getTime() - 60 * 60_000), null);
  });

  it('writes the time in the reader’s zone', () => {
    assert.match(whenFor(startsAt, 'Asia/Kolkata'), /15:30/);
    assert.match(whenFor(startsAt, 'Not/AZone'), /10:00/);
  });
});

describe('media server permissions', () => {
  const permissions = { chat: true, share: false, unmute: false };

  it('lets the people running the call send everything', () => {
    assert.deepEqual(publishSources({ canManage: true }, permissions), ['camera', 'microphone', 'screen_share', 'screen_share_audio']);
  });

  it('limits others to what the host allows', () => {
    assert.deepEqual(publishSources({ canManage: false }, permissions), ['camera']);
    assert.deepEqual(publishSources({ canManage: false }, { chat: true, share: true, unmute: true }), ['camera', 'microphone', 'screen_share', 'screen_share_audio']);
  });
});

describe('media routes', () => {
  const saved = { ...config.livekit };
  const peer = { socketId: 'sock-1', canManage: false, user: { id: 'user-1', name: 'Ada' } };
  after(() => Object.assign(config.livekit, saved));

  it('connects browsers directly without a media server', async () => {
    Object.assign(config.livekit, { url: '', apiKey: '', apiSecret: '' });
    assert.equal(sfuEnabled(), false);
    assert.equal(callCapacity(), config.meetings.directCallSize);
    assert.deepEqual(await mediaFor('m1', null, peer, { chat: true, share: true, unmute: true }), { mode: 'direct' });
  });

  it('gives a pass for the right media room with the host’s limits', async () => {
    Object.assign(config.livekit, { url: 'wss://media.example.com', apiKey: 'key', apiSecret: 'a-secret-long-enough-for-hmac-signing', callSize: 50 });
    assert.equal(callCapacity(), 50);
    const media = await mediaFor('m1', 'room-2', peer, { chat: true, share: false, unmute: true });
    assert.equal(media.mode, 'sfu');
    assert.equal(media.url, 'wss://media.example.com');
    const claims = JSON.parse(Buffer.from(media.token.split('.')[1], 'base64url').toString());
    assert.equal(claims.sub, 'sock-1');
    assert.equal(claims.name, 'Ada');
    assert.equal(claims.video.room, 'meeting-m1-room-2');
    assert.equal(claims.video.roomJoin, true);
    assert.deepEqual(claims.video.canPublishSources, ['camera', 'microphone']);
    assert.equal(JSON.parse(claims.metadata).userId, 'user-1');
  });
});

describe('shared state (Redis)', { skip: !process.env.REDIS_URL && 'set REDIS_URL to test against Redis' }, () => {
  let closeShared;
  before(async () => {
    const module = await import('../src/shared/realtime/shared-state.js');
    closeShared = module.closeSharedState;
    await module.initSharedState();
  });
  after(() => closeShared?.());

  it('serializes changes across concurrent writers', async () => {
    await shared.set('test:redis-counter', 0, 60);
    const bump = () =>
      shared.withLock('test:redis-counter', async () => {
        const value = await shared.get('test:redis-counter');
        await shared.set('test:redis-counter', value + 1, 60);
      });
    await Promise.all(Array.from({ length: 25 }, bump));
    assert.equal(await shared.get('test:redis-counter'), 25);
    await shared.del('test:redis-counter');
  });

  it('keeps hashes per field', async () => {
    await shared.hset('test:redis-hash', 'a', { n: 1 }, 60);
    assert.deepEqual(await shared.hget('test:redis-hash', 'a'), { n: 1 });
    assert.equal(await shared.hcount('test:redis-hash'), 1);
    await shared.del('test:redis-hash');
  });
});

describe('presence', () => {
  const active = { idle: false, inCall: false };
  const idle = { idle: true, inCall: false };
  const calling = { idle: false, inCall: true };

  it('follows activity when nothing was chosen', () => {
    assert.equal(effectiveStatus([], null), 'offline');
    assert.equal(effectiveStatus([active], null), 'available');
    assert.equal(effectiveStatus([idle, idle], null), 'away');
    assert.equal(effectiveStatus([idle, active], null), 'available');
    assert.equal(effectiveStatus([idle, calling], null), 'in-call');
  });

  it('lets a chosen status win, except calls over "busy"', () => {
    assert.equal(effectiveStatus([active], 'dnd'), 'dnd');
    assert.equal(effectiveStatus([calling], 'dnd'), 'dnd');
    assert.equal(effectiveStatus([calling], 'busy'), 'in-call');
    assert.equal(effectiveStatus([active], 'brb'), 'brb');
    assert.equal(effectiveStatus([active], 'offline'), 'offline');
    assert.equal(effectiveStatus([], 'busy'), 'offline');
  });
});

describe('shared state (in memory)', () => {
  it('stores JSON copies, not live objects', async () => {
    const value = { list: [1] };
    await shared.set('test:copy', value);
    value.list.push(2);
    assert.deepEqual(await shared.get('test:copy'), { list: [1] });
    await shared.del('test:copy');
    assert.equal(await shared.get('test:copy'), null);
  });

  it('runs changes to one key one after another', async () => {
    await shared.set('test:counter', 0);
    const bump = () =>
      shared.withLock('test:counter', async () => {
        const value = await shared.get('test:counter');
        await new Promise((resolve) => setTimeout(resolve, 2));
        await shared.set('test:counter', value + 1);
      });
    await Promise.all(Array.from({ length: 20 }, bump));
    assert.equal(await shared.get('test:counter'), 20);
  });

  it('keeps going after a failed change', async () => {
    await assert.rejects(shared.withLock('test:fail', async () => Promise.reject(new Error('boom'))));
    assert.equal(await shared.withLock('test:fail', async () => 'next'), 'next');
  });

  it('keeps hashes per field', async () => {
    await shared.hset('test:hash', 'a', { n: 1 });
    await shared.hset('test:hash', 'b', { n: 2 });
    assert.equal(await shared.hcount('test:hash'), 2);
    await shared.hdel('test:hash', 'a');
    assert.deepEqual(await shared.hvalues('test:hash'), [{ n: 2 }]);
    await shared.del('test:hash');
  });

  it('reads several keys at once', async () => {
    await shared.set('test:x', 1);
    assert.deepEqual(await shared.getMany(['test:x', 'test:missing']), [1, null]);
    await shared.del('test:x');
  });
});

describe('whiteboard items', () => {
  it('accepts freehand strokes, shapes, text and notes', () => {
    assert.deepEqual(cleanBoardItem({ points: [0.1, 0.2, 0.3, 0.4] }), { kind: 'path', points: [0.1, 0.2, 0.3, 0.4] });
    assert.equal(cleanBoardItem({ kind: 'arrow', points: [0, 0, 1, 1] }).kind, 'arrow');
    assert.deepEqual(cleanBoardItem({ kind: 'note', points: [0.5, 0.5], text: '  Ship it  ' }), { kind: 'note', points: [0.5, 0.5], text: 'Ship it' });
  });

  it('refuses unknown kinds, wrong point counts, empty text and points off the board', () => {
    assert.equal(cleanBoardItem({ kind: 'star', points: [0, 0, 1, 1] }), null);
    assert.equal(cleanBoardItem({ kind: 'rect', points: [0, 0] }), null);
    assert.equal(cleanBoardItem({ kind: 'text', points: [0.1, 0.1], text: '   ' }), null);
    assert.equal(cleanBoardItem({ kind: 'line', points: [0, 0, 2, 2] }), null);
    assert.equal(cleanBoardItem({ kind: 'path', points: [] }), null);
  });

  it('caps the text of an item', () => {
    assert.equal(cleanBoardItem({ kind: 'text', points: [0, 0], text: 'x'.repeat(900) }).text.length, 500);
  });
});

describe('calendar sync', () => {
  it('stores sign-ins encrypted, and refuses tampered ones', () => {
    const sealed = encrypt('ya29.secret-access-token');
    assert.notEqual(sealed, 'ya29.secret-access-token');
    assert.equal(decrypt(sealed), 'ya29.secret-access-token');
    assert.notEqual(encrypt('same'), encrypt('same'), 'each value gets its own nonce');
    const [version, iv, tag, data] = sealed.split('.');
    const flipped = `${version}.${iv}.${tag}.${data.slice(0, -2)}${data.slice(-2) === 'AA' ? 'AB' : 'AA'}`;
    assert.throws(() => decrypt(flipped));
    assert.equal(decrypt(null), null);
  });

  const event = {
    title: 'Planning',
    description: 'Agenda\n\nJoin the meeting: https://app.example.com/meetings/1',
    location: 'https://app.example.com/meetings/1',
    start: new Date('2026-11-03T04:00:00.000Z'),
    end: new Date('2026-11-03T04:45:00.000Z'),
    attendees: [{ email: 'one@example.com', name: 'One' }],
  };

  it('sends Google the times with their offset and everyone invited', () => {
    const body = PROVIDERS.google.eventBody(event);
    assert.equal(body.summary, 'Planning');
    assert.deepEqual(body.start, { dateTime: '2026-11-03T04:00:00.000Z' });
    assert.deepEqual(body.attendees, [{ email: 'one@example.com', displayName: 'One' }]);
  });

  it('sends Microsoft local times with the zone named separately', () => {
    const body = PROVIDERS.microsoft.eventBody(event);
    assert.equal(body.subject, 'Planning');
    assert.deepEqual(body.start, { dateTime: '2026-11-03T04:00:00', timeZone: 'UTC' });
    assert.deepEqual(body.end, { dateTime: '2026-11-03T04:45:00', timeZone: 'UTC' });
    assert.deepEqual(body.attendees, [{ emailAddress: { address: 'one@example.com', name: 'One' }, type: 'required' }]);
  });

  it('is off until an OAuth app is configured', () => {
    assert.equal(PROVIDERS.google.configured(), Boolean(config.calendar.google.clientId && config.calendar.google.clientSecret));
  });
});

describe('meeting summaries', () => {
  const people = [
    { id: 'a', name: 'Priya Sharma' },
    { id: 'b', name: 'Rahul Verma' },
    { id: 'c', name: 'Rahul Gupta' },
  ];

  it('matches action item owners to invited people by full or unique first name', () => {
    assert.equal(matchOwner('priya sharma', people), 'a');
    assert.equal(matchOwner('Priya', people), 'a');
    assert.equal(matchOwner('Rahul', people), null, 'two people are called Rahul');
    assert.equal(matchOwner('Rahul Gupta', people), 'c');
    assert.equal(matchOwner(null, people), null);
    assert.equal(matchOwner('Someone else', people), null);
  });
});

describe('dial-in', () => {
  it('shows phone callers without their whole number', () => {
    assert.equal(phoneCallerName({ identity: 'sip_+919876543210', name: '+919876543210', attributes: {} }), 'Phone (…3210)');
    assert.equal(phoneCallerName({ identity: 'sip_+919876543210', name: 'Reception desk', attributes: {} }), 'Reception desk');
    assert.equal(phoneCallerName({ identity: 'sip_x', name: '', attributes: {} }), 'Phone caller');
    assert.equal(isPhoneIdentity('sip_123'), true);
    assert.equal(isPhoneIdentity('AbCdEf123'), false);
  });

  it('gives no dial-in details when the server has none', () => {
    assert.equal(dialInFor({ dialInPin: '123456789' }), config.livekit.dialInNumber && sfuEnabled() ? { number: config.livekit.dialInNumber, pin: '123456789' } : null);
  });
});

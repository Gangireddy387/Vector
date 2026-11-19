import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  allowsNotificationEmail,
  allowsNotificationPush,
  isInQuietHours,
  parseHm,
} from '../src/modules/notifications/quiet-hours.js';

describe('parseHm', () => {
  it('parses valid HH:mm values', () => {
    assert.equal(parseHm('00:00'), 0);
    assert.equal(parseHm('22:30'), 22 * 60 + 30);
    assert.equal(parseHm('25:00'), null);
    assert.equal(parseHm('9:00'), null);
  });
});

describe('isInQuietHours', () => {
  const zone = 'UTC';

  it('is off when disabled or start equals end', () => {
    assert.equal(isInQuietHours({ quietHours: { enabled: false, start: '22:00', end: '07:00' } }, zone), false);
    assert.equal(isInQuietHours({ quietHours: { enabled: true, start: '10:00', end: '10:00' } }, zone), false);
  });

  it('handles same-day windows', () => {
    const prefs = { quietHours: { enabled: true, start: '13:00', end: '15:00' } };
    assert.equal(isInQuietHours(prefs, zone, new Date('2026-06-01T12:30:00Z')), false);
    assert.equal(isInQuietHours(prefs, zone, new Date('2026-06-01T13:00:00Z')), true);
    assert.equal(isInQuietHours(prefs, zone, new Date('2026-06-01T14:59:00Z')), true);
    assert.equal(isInQuietHours(prefs, zone, new Date('2026-06-01T15:00:00Z')), false);
  });

  it('handles overnight windows', () => {
    const prefs = { quietHours: { enabled: true, start: '22:00', end: '07:00' } };
    assert.equal(isInQuietHours(prefs, zone, new Date('2026-06-01T21:59:00Z')), false);
    assert.equal(isInQuietHours(prefs, zone, new Date('2026-06-01T22:00:00Z')), true);
    assert.equal(isInQuietHours(prefs, zone, new Date('2026-06-01T03:00:00Z')), true);
    assert.equal(isInQuietHours(prefs, zone, new Date('2026-06-01T07:00:00Z')), false);
  });
});

describe('allowsNotificationEmail / push', () => {
  const quietNow = new Date('2026-06-01T23:00:00Z');
  const user = {
    timezone: 'UTC',
    preferences: {
      emailNotifications: true,
      pushEnabled: true,
      quietHours: { enabled: true, start: '22:00', end: '07:00' },
    },
  };

  it('blocks email and push during quiet hours', () => {
    assert.equal(allowsNotificationEmail(user, quietNow), false);
    assert.equal(allowsNotificationPush(user, quietNow), false);
  });

  it('still respects the master email/push toggles outside quiet hours', () => {
    const afternoon = new Date('2026-06-01T15:00:00Z');
    assert.equal(allowsNotificationEmail(user, afternoon), true);
    assert.equal(
      allowsNotificationEmail({ ...user, preferences: { ...user.preferences, emailNotifications: false } }, afternoon),
      false,
    );
  });
});

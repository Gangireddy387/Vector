import { localDateTime } from '../../shared/utils/timezone.js';

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Parse `HH:mm` into minutes from midnight; invalid values return null. */
export function parseHm(value) {
  if (typeof value !== 'string' || !TIME_RE.test(value)) return null;
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

/**
 * Whether `now` falls inside the person's quiet-hours window in their timezone.
 * Overnight windows (e.g. 22:00→07:00) wrap past midnight. Equal start/end means off.
 */
export function isInQuietHours(preferences, timeZone, now = new Date()) {
  const quiet = preferences?.quietHours;
  if (!quiet?.enabled) return false;
  const start = parseHm(quiet.start ?? '22:00');
  const end = parseHm(quiet.end ?? '07:00');
  if (start == null || end == null || start === end) return false;

  const local = localDateTime(timeZone || 'UTC', now);
  const [h, m] = local.time.split(':').map(Number);
  const minutes = h * 60 + m;

  if (start < end) return minutes >= start && minutes < end;
  return minutes >= start || minutes < end;
}

/** Email mirrors of notifications — skipped during quiet hours. */
export function allowsNotificationEmail(user, now = new Date()) {
  if (user.preferences?.emailNotifications === false) return false;
  return !isInQuietHours(user.preferences, user.timezone, now);
}

/** Device push for notifyUsers types — skipped during quiet hours (calls still ring separately). */
export function allowsNotificationPush(user, now = new Date()) {
  if (user.preferences?.pushEnabled === false) return false;
  return !isInQuietHours(user.preferences, user.timezone, now);
}

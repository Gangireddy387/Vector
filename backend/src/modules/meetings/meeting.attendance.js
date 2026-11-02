import { Op } from 'sequelize';
import { MeetingAttendance } from '../../database/models.js';

/**
 * Attendance: every stay in a call is a row, from joining to leaving. The report adds them up per person (first join,
 * last leave, time in the call, how many times they joined), like a Teams attendance report.
 */

const PHONE_STAY_MAX_MS = 12 * 60 * 60_000;
const quietly = (promise) => promise.catch((error) => console.warn('[meetings] attendance not recorded:', error.message));

export const recordArrival = (meetingId, { userId = null, name, email = null, kind = 'member', sessionKey }) =>
  quietly(MeetingAttendance.create({ meetingId, userId, name: String(name ?? 'Someone').slice(0, 120), email, kind, sessionKey, joinedAt: new Date() }));

export const recordDeparture = (meetingId, sessionKey, at = new Date()) =>
  quietly(MeetingAttendance.update({ leftAt: at }, { where: { meetingId, sessionKey, leftAt: null } }));

/** Everyone still marked as present leaves now (the call ended or was closed). */
export const closeOpenAttendance = (meetingId, at = new Date()) => quietly(MeetingAttendance.update({ leftAt: at }, { where: { meetingId, leftAt: null } }));

/** Stays left open by a server that stopped without saying goodbye, in calls that nobody is in any more. */
export async function closeStaleAttendance(isInCall) {
  // Phone callers are not in the app's call state (LiveKit reports when they leave); only very old stays are closed.
  const [phones] = await MeetingAttendance.update({ leftAt: new Date() }, { where: { kind: 'phone', leftAt: null, joinedAt: { [Op.lt]: new Date(Date.now() - PHONE_STAY_MAX_MS) } } });
  const open = await MeetingAttendance.findAll({ where: { leftAt: null, kind: { [Op.ne]: 'phone' } }, attributes: ['meetingId'], group: ['meetingId'], raw: true });
  let closed = phones;
  for (const { meetingId } of open) {
    if (await isInCall(meetingId)) continue;
    const [count] = await MeetingAttendance.update(
      { leftAt: new Date() },
      { where: { meetingId, leftAt: null, kind: { [Op.ne]: 'phone' }, joinedAt: { [Op.lt]: new Date(Date.now() - 60_000) } } },
    );
    closed += count;
  }
  return closed;
}

/** Per person: name, kind, first join, last leave, seconds in the call (overlapping tabs counted once), sessions. */
export async function attendanceReport(meetingId) {
  const rows = await MeetingAttendance.findAll({ where: { meetingId }, order: [['joinedAt', 'ASC']] });
  const people = new Map();
  for (const row of rows) {
    const key = row.userId ?? `${row.kind}:${row.name}`;
    const entry = people.get(key) ?? { key, userId: row.userId, name: row.name, email: row.email, kind: row.kind, intervals: [] };
    entry.intervals.push([row.joinedAt.getTime(), (row.leftAt ?? new Date()).getTime(), !row.leftAt]);
    people.set(key, entry);
  }
  return [...people.values()]
    .map(({ intervals, ...person }) => {
      // Two tabs open at once are one presence: merge overlapping stays before adding them up.
      const sorted = intervals.sort((a, b) => a[0] - b[0]);
      let total = 0;
      let [start, end] = sorted[0];
      for (const [from, to] of sorted.slice(1)) {
        if (from <= end) end = Math.max(end, to);
        else {
          total += end - start;
          [start, end] = [from, to];
        }
      }
      total += end - start;
      return {
        ...person,
        firstJoinedAt: new Date(sorted[0][0]).toISOString(),
        lastLeftAt: sorted.some((interval) => interval[2]) ? null : new Date(Math.max(...sorted.map((interval) => interval[1]))).toISOString(),
        seconds: Math.round(total / 1000),
        sessions: sorted.length,
        inCall: sorted.some((interval) => interval[2]),
      };
    })
    .sort((a, b) => a.firstJoinedAt.localeCompare(b.firstJoinedAt));
}

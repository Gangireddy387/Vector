/**
 * Calendar files (iCalendar, RFC 5545) for meetings, so they land in Outlook, Google Calendar or Apple Calendar.
 * `REQUEST` invites or updates (the same UID with a higher SEQUENCE replaces the earlier copy), `CANCEL` removes it,
 * `PUBLISH` is a plain "add to my calendar" download.
 */

const escapeText = (value) =>
  String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');

const stamp = (date) => new Date(date).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

/** Lines longer than 75 bytes continue on the next line after a space (counted in UTF-8 bytes, not characters). */
function fold(line) {
  const parts = [];
  let current = '';
  let bytes = 0;
  for (const char of line) {
    const size = Buffer.byteLength(char);
    if (bytes + size > (parts.length ? 74 : 75)) {
      parts.push(current);
      current = '';
      bytes = 0;
    }
    current += char;
    bytes += size;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

const person = (kind, { name, email }, extra = '') => `${kind};CN=${escapeText(name)}${extra}:mailto:${email}`;

/**
 * `meeting`: { id, title, agenda, startsAt, durationMinutes, status, updatedAt }; `url`: where to join;
 * `organizer` / `attendees`: { name, email }.
 */
export function meetingIcs({ meeting, url, organizer = null, attendees = [], method = 'REQUEST' }) {
  const start = new Date(meeting.startsAt);
  const end = new Date(start.getTime() + meeting.durationMinutes * 60_000);
  const cancelled = method === 'CANCEL' || meeting.status === 'cancelled';
  const description = [meeting.agenda, `Join: ${url}`].filter(Boolean).join('\n\n');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Vector//Meetings//EN',
    'CALSCALE:GREGORIAN',
    `METHOD:${method}`,
    'BEGIN:VEVENT',
    `UID:${meeting.id}@vector`,
    // Seconds since 2020 always grow with each change, which is all calendars need from SEQUENCE.
    `SEQUENCE:${Math.max(0, Math.floor((new Date(meeting.updatedAt ?? Date.now()).getTime() - Date.UTC(2020, 0, 1)) / 1000))}`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${escapeText(meeting.title)}`,
    `DESCRIPTION:${escapeText(description)}`,
    `LOCATION:${escapeText(url)}`,
    `URL:${url}`,
    `STATUS:${cancelled ? 'CANCELLED' : 'CONFIRMED'}`,
    ...(organizer?.email ? [person('ORGANIZER', organizer)] : []),
    ...attendees.filter((attendee) => attendee.email).map((attendee) => person('ATTENDEE', attendee, ';ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=FALSE')),
    ...(cancelled
      ? []
      : ['BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escapeText(meeting.title)}`, 'TRIGGER:-PT10M', 'END:VALARM']),
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return `${lines.map(fold).join('\r\n')}\r\n`;
}

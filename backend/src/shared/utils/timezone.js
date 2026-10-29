/** True for IANA zone names the runtime understands, e.g. "Asia/Kolkata" or "UTC". */
export function isValidTimeZone(timeZone) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** The calendar date (YYYY-MM-DD), hour (0–23) and `HH:mm` time at `date` in the given zone; unknown zones fall back to UTC. */
export function localDateTime(timeZone, date = new Date()) {
  const zone = isValidTimeZone(timeZone) ? timeZone : 'UTC';
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour), time: `${parts.hour}:${parts.minute}` };
}

/** The instant at which clocks in `timeZone` show `dateOnly` (YYYY-MM-DD) at `time` (HH:mm), daylight saving included. */
export function zonedTimeToUtc(dateOnly, time, timeZone) {
  const zone = isValidTimeZone(timeZone) ? timeZone : 'UTC';
  const [year, month, day] = dateOnly.split('-').map(Number);
  const [hours, minutes] = time.split(':').map(Number);
  const wall = Date.UTC(year, month - 1, day, hours, minutes);
  let instant = wall;
  for (let pass = 0; pass < 2; pass += 1) {
    const shown = localDateTime(zone, new Date(instant));
    const [y, m, d] = shown.date.split('-').map(Number);
    const [h, min] = shown.time.split(':').map(Number);
    instant += wall - Date.UTC(y, m - 1, d, h, min);
  }
  return new Date(instant);
}

/** Adds whole days to a YYYY-MM-DD string without time-zone drift. */
export function addDaysToDate(dateOnly, days) {
  const value = new Date(`${dateOnly}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

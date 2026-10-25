/** True for IANA zone names the runtime understands, e.g. "Asia/Kolkata" or "UTC". */
export function isValidTimeZone(timeZone) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** The calendar date (YYYY-MM-DD) and hour (0–23) at `date` in the given zone; unknown zones fall back to UTC. */
export function localDateTime(timeZone, date = new Date()) {
  const zone = isValidTimeZone(timeZone) ? timeZone : 'UTC';
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
}

/** Adds whole days to a YYYY-MM-DD string without time-zone drift. */
export function addDaysToDate(dateOnly, days) {
  const value = new Date(`${dateOnly}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/**
 * Calculates the next run time for a recurring task strictly after `from`,
 * using the server's local time zone.
 */
export function computeNextRunAt({ frequency, timeOfDay = '09:00', dayOfWeek, dayOfMonth }, from = new Date()) {
  const [hours, minutes] = timeOfDay.split(':').map(Number);
  const candidate = new Date(from);
  candidate.setHours(hours, minutes, 0, 0);
  if (candidate <= from) candidate.setDate(candidate.getDate() + 1);

  const matches = {
    daily: () => true,
    weekdays: () => ![0, 6].includes(candidate.getDay()),
    weekly: () => candidate.getDay() === (dayOfWeek ?? 1),
    monthly: () => candidate.getDate() === (dayOfMonth ?? 1),
  }[frequency];

  for (let guard = 0; guard < 62 && !matches(); guard += 1) {
    candidate.setDate(candidate.getDate() + 1);
  }
  return candidate;
}

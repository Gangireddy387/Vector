import { ApiError } from '../../shared/errors/api-error.js';

/** Default weekly capacity: 40 hours. */
export const DEFAULT_CAPACITY_MINUTES_PER_WEEK = 40 * 60;

const DEFAULT_CAPACITY = Object.freeze({
  minutesPerWeek: DEFAULT_CAPACITY_MINUTES_PER_WEEK,
});

export function publicCapacity(organization) {
  const raw = organization?.capacity && typeof organization.capacity === 'object' ? organization.capacity : {};
  const minutes = Number(raw.minutesPerWeek);
  return {
    minutesPerWeek:
      Number.isFinite(minutes) && minutes > 0
        ? Math.min(7 * 24 * 60, Math.max(60, Math.round(minutes)))
        : DEFAULT_CAPACITY_MINUTES_PER_WEEK,
  };
}

export function normalizeCapacity(input) {
  const next = { ...DEFAULT_CAPACITY, ...(input && typeof input === 'object' ? input : {}) };
  const minutes = Number(next.minutesPerWeek);
  if (!Number.isFinite(minutes) || minutes < 60 || minutes > 7 * 24 * 60) {
    throw ApiError.badRequest('Weekly capacity must be between 1 and 168 hours', [
      { path: 'capacity.minutesPerWeek', message: 'Use minutes between 60 and 10080' },
    ]);
  }
  return { minutesPerWeek: Math.round(minutes) };
}

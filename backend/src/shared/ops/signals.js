/**
 * Process-local ops counters for money, jobs and automations.
 * Visible via GET /super-admin/ops. On several backends each process has its own totals —
 * use log aggregators for a fleet-wide view; automation rule errors also live in the database.
 */

const MAX_RECENT = 25;

/** @type {Map<string, { ok: number, failed: number, lastOkAt: string|null, lastFailedAt: string|null, lastError: string|null }>} */
const counters = new Map();
/** @type {Array<{ at: string, area: string, name: string, ok: boolean, error?: string }>} */
const recent = [];

function key(area, name) {
  return `${area}:${name}`;
}

function ensure(area, name) {
  const id = key(area, name);
  if (!counters.has(id)) {
    counters.set(id, { ok: 0, failed: 0, lastOkAt: null, lastFailedAt: null, lastError: null });
  }
  return counters.get(id);
}

function pushRecent(entry) {
  recent.unshift(entry);
  if (recent.length > MAX_RECENT) recent.length = MAX_RECENT;
}

export function recordOk(area, name) {
  const row = ensure(area, name);
  row.ok += 1;
  row.lastOkAt = new Date().toISOString();
  pushRecent({ at: row.lastOkAt, area, name, ok: true });
}

export function recordFail(area, name, error) {
  const row = ensure(area, name);
  row.failed += 1;
  row.lastFailedAt = new Date().toISOString();
  row.lastError = String(error?.message ?? error ?? 'unknown').slice(0, 500);
  pushRecent({ at: row.lastFailedAt, area, name, ok: false, error: row.lastError });
}

function group(area) {
  const out = {};
  for (const [id, row] of counters) {
    if (!id.startsWith(`${area}:`)) continue;
    out[id.slice(area.length + 1)] = { ...row };
  }
  return out;
}

/** Snapshot for the super-admin ops endpoint / tests. */
export function signalsSnapshot() {
  return {
    stripe: group('stripe'),
    jobs: group('jobs'),
    automations: group('automations'),
    recent: recent.map((entry) => ({ ...entry })),
  };
}

/** Test helper — clears counters between cases. */
export function resetSignals() {
  counters.clear();
  recent.length = 0;
}

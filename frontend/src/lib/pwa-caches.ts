/** Service-worker caches that may hold authenticated API GETs. Cleared on sign-out / session reset. */
export const PWA_API_CACHE_NAMES = ['vector-api', 'vector-critical-get'] as const

/** Drop short-lived NetworkFirst caches so the next account never sees the previous one's data. */
export async function clearPwaApiCaches() {
  if (!('caches' in window)) return
  await Promise.all(PWA_API_CACHE_NAMES.map((name) => caches.delete(name).catch(() => false)))
}

/** Fired by the offline banner Retry button and when the device comes back online. */
export const CRITICAL_RETRY_EVENT = 'vector:retry-critical'

export function requestCriticalRetry() {
  window.dispatchEvent(new Event(CRITICAL_RETRY_EVENT))
}

export function onCriticalRetry(handler: () => void) {
  window.addEventListener(CRITICAL_RETRY_EVENT, handler)
  return () => window.removeEventListener(CRITICAL_RETRY_EVENT, handler)
}

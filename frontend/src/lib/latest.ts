/**
 * Keeps only the newest answer when the same data is requested several times in a row (typing in a search, switching
 * projects, a filter change while the previous list still loads): older answers that arrive late are ignored.
 *
 *   const latest = latestRequest()
 *   const ticket = latest.start()
 *   const result = await api.list()
 *   if (!latest.isCurrent(ticket)) return
 */
export function latestRequest() {
  let counter = 0
  return {
    start: () => (counter += 1),
    isCurrent: (ticket: number) => ticket === counter,
  }
}

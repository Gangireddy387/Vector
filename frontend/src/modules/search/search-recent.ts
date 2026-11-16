const STORAGE_KEY = 'vector.search.recent'
const MAX_RECENT = 8

export function readRecentSearches(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0).slice(0, MAX_RECENT)
  } catch {
    return []
  }
}

export function rememberSearch(query: string): string[] {
  const term = query.trim()
  if (!term) return readRecentSearches()
  const next = [term, ...readRecentSearches().filter((entry) => entry.toLowerCase() !== term.toLowerCase())].slice(0, MAX_RECENT)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  return next
}

export function clearRecentSearches(): void {
  localStorage.removeItem(STORAGE_KEY)
}

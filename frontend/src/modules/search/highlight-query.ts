/** Split `text` into plain / match parts for query highlighting (case-insensitive substring). */
export function highlightParts(text: string, query: string): Array<{ text: string; hit: boolean }> {
  const source = String(text ?? '')
  const needle = String(query ?? '')
    .trim()
    .replace(/[%_]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 2)
    .sort((a, b) => b.length - a.length)[0]
  if (!source || !needle) return [{ text: source, hit: false }]

  const lower = source.toLowerCase()
  const find = needle.toLowerCase()
  const parts: Array<{ text: string; hit: boolean }> = []
  let cursor = 0
  while (cursor < source.length) {
    const at = lower.indexOf(find, cursor)
    if (at === -1) {
      parts.push({ text: source.slice(cursor), hit: false })
      break
    }
    if (at > cursor) parts.push({ text: source.slice(cursor, at), hit: false })
    parts.push({ text: source.slice(at, at + needle.length), hit: true })
    cursor = at + needle.length
  }
  return parts.length ? parts : [{ text: source, hit: false }]
}

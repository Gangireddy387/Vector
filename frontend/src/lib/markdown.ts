import DOMPurify from 'dompurify'
import { marked } from 'marked'

marked.setOptions({ gfm: true, breaks: true })

// Links that open a new tab cannot reach back into Vector's tab (and do not tell the other site where they came from).
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A' && node.getAttribute('target')) node.setAttribute('rel', 'noopener noreferrer')
})

const MENTION_PATTERN = /@\[([^\]]+)\]\(([0-9a-f-]{36})\)/gi
const PIPE_ROW = /^\s*\|.*\|\s*$/
const SEPARATOR_ROW = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/

/**
 * AI and paste often produce almost-tables that GFM will not parse (missing pipes,
 * missing separator, or no blank line before the block). Normalize those so columns align.
 */
export function normalizeMarkdownTables(source: string) {
  const lines = source.replace(/\r\n/g, '\n').split('\n')
  const out: string[] = []

  const isLooseHeader = (line: string) => {
    const cells = line
      .split(/\s{2,}|\t|\s\|\s/)
      .map((cell) => cell.replace(/^\||\|$/g, '').trim())
      .filter(Boolean)
    return cells.length >= 2 && cells.every((cell) => cell.length <= 40) && !/^[-*+]/.test(line.trim())
  }

  const toPipeRow = (line: string) => {
    if (PIPE_ROW.test(line)) return line.trim().startsWith('|') ? line.trim() : `| ${line.trim()} |`
    const cells = line
      .split(/\s{2,}|\t/)
      .map((cell) => cell.trim())
      .filter(Boolean)
    if (cells.length < 2) return null
    return `| ${cells.join(' | ')} |`
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? ''
    const next = lines[index + 1] ?? ''
    const looksLikeTableStart =
      (PIPE_ROW.test(line) && (SEPARATOR_ROW.test(next) || PIPE_ROW.test(next))) ||
      (isLooseHeader(line) && (isLooseHeader(next) || SEPARATOR_ROW.test(next) || PIPE_ROW.test(next)))

    if (!looksLikeTableStart) {
      out.push(line)
      continue
    }

    if (out.length && out[out.length - 1]!.trim() !== '') out.push('')

    const block: string[] = []
    while (index < lines.length) {
      const current = lines[index] ?? ''
      if (!current.trim()) break
      if (!(PIPE_ROW.test(current) || SEPARATOR_ROW.test(current) || isLooseHeader(current))) break
      const piped = SEPARATOR_ROW.test(current)
        ? current.trim().includes('|')
          ? current.trim()
          : `| ${current
              .trim()
              .split(/\s+/)
              .map(() => '---')
              .join(' | ')} |`
        : toPipeRow(current)
      if (!piped) break
      block.push(piped)
      index += 1
    }
    index -= 1

    if (block.length >= 2 && !SEPARATOR_ROW.test(block[1]!)) {
      const cols = (block[0]!.match(/\|/g)?.length ?? 1) - 1
      block.splice(1, 0, `| ${Array.from({ length: Math.max(cols, 2) }, () => '---').join(' | ')} |`)
    }
    out.push(...block, '')
  }

  return out.join('\n').replace(/\n{3,}/g, '\n\n')
}

function wrapMarkdownTables(html: string) {
  return html.replace(/<table[\s\S]*?<\/table>/gi, (table) => `<div class="table-wrap">${table}</div>`)
}

/** Renders user-authored markdown safely, turning `@[Name](id)` tokens into mention chips. */
export function renderMarkdown(source?: string | null) {
  if (!source) return ''
  const normalized = normalizeMarkdownTables(source)
  const withMentions = normalized.replace(MENTION_PATTERN, (_match, name: string) => `<span class="mention">@${name}</span>`)
  const html = marked.parse(withMentions, { async: false }) as string
  return DOMPurify.sanitize(wrapMarkdownTables(html), { ADD_ATTR: ['target'] })
}

const ISSUE_KEY_PATTERN = /(^|[^A-Za-z0-9/>-])#?([A-Za-z][A-Za-z0-9]{0,9}-\d{1,6})(?![A-Za-z0-9-])/g

const WIKI_BRACKET_PATTERN =
  /\[\[([^\[\]|#]+)(?:\|([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}))?\]\]/gi

export type WikiLinkTarget = { id: string; title: string }

function escapeHtml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/**
 * Markdown for chat and standups: mentions become chips and every known task key becomes a task link
 * (`data-issue-key`, so the app can route to it without a page reload).
 * Optional wiki pages turn `[[Title]]` into in-app wiki links (`data-wiki-id`).
 */
export function renderRichText(
  source: string | null | undefined,
  issueKeys: Iterable<string>,
  wikiPages: Iterable<WikiLinkTarget> = [],
) {
  if (!source) return ''
  const known = new Set([...issueKeys].map((key) => key.toUpperCase()))
  const wikiById = new Map([...wikiPages].map((page) => [page.id, page]))
  const wikiByTitle = new Map(
    [...wikiPages].map((page) => [page.title.trim().toLowerCase(), page] as const).filter(([title]) => Boolean(title)),
  )
  const normalized = normalizeMarkdownTables(source)
  const withMentions = normalized.replace(MENTION_PATTERN, (_match, name: string) => `<span class="mention">@${name}</span>`)
  const withWiki =
    wikiById.size || wikiByTitle.size
      ? withMentions.replace(WIKI_BRACKET_PATTERN, (match, title: string, id?: string) => {
          const page = (id && wikiById.get(id)) || wikiByTitle.get(String(title).trim().toLowerCase())
          if (!page) return match
          const label = escapeHtml(String(title).trim() || page.title)
          return `<a href="/wiki/${page.id}" data-wiki-id="${page.id}" class="wiki-ref">${label}</a>`
        })
      : withMentions
  const withIssues = known.size
    ? withWiki.replace(ISSUE_KEY_PATTERN, (match, prefix: string, key: string) =>
        known.has(key.toUpperCase())
          ? `${prefix}<a href="/issues/${key.toUpperCase()}" data-issue-key="${key.toUpperCase()}" class="issue-ref">${key.toUpperCase()}</a>`
          : match,
      )
    : withWiki
  const html = marked.parse(withIssues, { async: false }) as string
  return DOMPurify.sanitize(wrapMarkdownTables(html), { ADD_ATTR: ['target'] })
}

/** Plain-text preview of markdown, used in notifications and list rows. */
export function toPlainText(source?: string | null, maxLength = 160) {
  if (!source) return ''
  const text = source
    .replace(MENTION_PATTERN, '@$1')
    .replace(/[#>*_`~-]+/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text
}

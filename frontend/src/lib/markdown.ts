import DOMPurify from 'dompurify'
import { marked } from 'marked'

marked.setOptions({ gfm: true, breaks: true })

const MENTION_PATTERN = /@\[([^\]]+)\]\(([0-9a-f-]{36})\)/gi

/** Renders user-authored markdown safely, turning `@[Name](id)` tokens into mention chips. */
export function renderMarkdown(source?: string | null) {
  if (!source) return ''
  const withMentions = source.replace(MENTION_PATTERN, (_match, name: string) => `<span class="mention">@${name}</span>`)
  const html = marked.parse(withMentions, { async: false })
  return DOMPurify.sanitize(html, { ADD_ATTR: ['target'] })
}

const ISSUE_KEY_PATTERN = /(^|[^A-Za-z0-9/>-])#?([A-Za-z][A-Za-z0-9]{0,9}-\d{1,6})(?![A-Za-z0-9-])/g

/**
 * Markdown for chat and standups: mentions become chips and every known task key becomes a task link
 * (`data-issue-key`, so the app can route to it without a page reload).
 */
export function renderRichText(source: string | null | undefined, issueKeys: Iterable<string>) {
  if (!source) return ''
  const known = new Set([...issueKeys].map((key) => key.toUpperCase()))
  const withMentions = source.replace(MENTION_PATTERN, (_match, name: string) => `<span class="mention">@${name}</span>`)
  const withIssues = known.size
    ? withMentions.replace(ISSUE_KEY_PATTERN, (match, prefix: string, key: string) =>
        known.has(key.toUpperCase()) ? `${prefix}<a href="/issues/${key.toUpperCase()}" data-issue-key="${key.toUpperCase()}" class="issue-ref">${key.toUpperCase()}</a>` : match,
      )
    : withMentions
  const html = marked.parse(withIssues, { async: false })
  return DOMPurify.sanitize(html, { ADD_ATTR: ['target'] })
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

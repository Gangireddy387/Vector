import { addDays, nextDay, type Day } from 'date-fns'
import type { IssuePriority, IssueType, Label, UserSummary } from '@/types/models'
import { toDateInput } from './format'

export interface QuickAddToken {
  kind: 'assignee' | 'label' | 'priority' | 'due' | 'points' | 'type'
  raw: string
  display: string
}

export interface QuickAddResult {
  title: string
  assigneeId?: string | null
  labelIds: string[]
  priority?: IssuePriority
  dueDate?: string
  storyPoints?: number
  type?: IssueType
  tokens: QuickAddToken[]
}

const PRIORITY_ALIASES: Record<string, IssuePriority> = {
  highest: 'highest', urgent: 'highest', critical: 'highest', blocker: 'highest',
  high: 'high', important: 'high',
  medium: 'medium', normal: 'medium',
  low: 'low', minor: 'low',
  lowest: 'lowest', trivial: 'lowest',
}

const TYPE_ALIASES: Record<string, IssueType> = {
  bug: 'bug', defect: 'bug', story: 'story', feature: 'story', task: 'task', chore: 'task', epic: 'epic',
}

const WEEKDAYS: Record<string, Day> = {
  sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tuesday: 2, wed: 3, wednesday: 3,
  thu: 4, thursday: 4, fri: 5, friday: 5, sat: 6, saturday: 6,
}

export function parseDueDate(input: string, today = new Date()): string | null {
  const value = input.toLowerCase()
  if (value === 'today') return toDateInput(today)
  if (value === 'tomorrow' || value === 'tmr') return toDateInput(addDays(today, 1))
  if (value === 'nextweek') return toDateInput(addDays(today, 7))
  if (value === 'eow') return toDateInput(nextDay(addDays(today, -1), 5))
  const relative = /^\+?(\d+)([dw])$/.exec(value)
  if (relative) return toDateInput(addDays(today, Number(relative[1]) * (relative[2] === 'w' ? 7 : 1)))
  if (value in WEEKDAYS) return toDateInput(nextDay(today, WEEKDAYS[value]!))
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  return null
}

function findMember(handle: string, members: UserSummary[], currentUserId?: string) {
  const needle = handle.toLowerCase()
  if (needle === 'me' && currentUserId) return members.find((member) => member.id === currentUserId) ?? null
  return (
    members.find((member) => member.email.split('@')[0]?.toLowerCase() === needle) ??
    members.find((member) => member.name.toLowerCase().split(/\s+/)[0] === needle) ??
    members.find((member) => member.name.toLowerCase().replace(/\s+/g, '').startsWith(needle)) ??
    null
  )
}

/**
 * Parses a one-line quick-add string into issue fields.
 *
 *   @name / @me     assignee            #label        label
 *   !high / !urgent priority            ^friday ^+3d  due date (today, tomorrow, mon..sun, +Nd, +Nw, YYYY-MM-DD)
 *   ~5              story points        /bug /story   issue type
 */
export function parseQuickAdd(
  input: string,
  context: { members: UserSummary[]; labels: Label[]; currentUserId?: string },
): QuickAddResult {
  const result: QuickAddResult = { title: '', labelIds: [], tokens: [] }
  const words: string[] = []

  for (const word of input.split(/\s+/).filter(Boolean)) {
    const prefix = word[0]
    const body = word.slice(1)

    if (prefix === '@' && body) {
      const member = findMember(body, context.members, context.currentUserId)
      if (member) {
        result.assigneeId = member.id
        result.tokens.push({ kind: 'assignee', raw: word, display: member.name })
        continue
      }
    }
    if (prefix === '#' && body) {
      const label = context.labels.find((item) => item.name.toLowerCase() === body.toLowerCase())
      if (label) {
        if (!result.labelIds.includes(label.id)) result.labelIds.push(label.id)
        result.tokens.push({ kind: 'label', raw: word, display: label.name })
        continue
      }
    }
    if (prefix === '!' && (PRIORITY_ALIASES[body.toLowerCase()] || body === '!' || body === '')) {
      result.priority = body === '!' ? 'highest' : body === '' ? 'high' : PRIORITY_ALIASES[body.toLowerCase()]
      result.tokens.push({ kind: 'priority', raw: word, display: result.priority! })
      continue
    }
    if (prefix === '^' && body) {
      const dueDate = parseDueDate(body)
      if (dueDate) {
        result.dueDate = dueDate
        result.tokens.push({ kind: 'due', raw: word, display: dueDate })
        continue
      }
    }
    if (prefix === '~' && /^\d{1,3}$/.test(body)) {
      result.storyPoints = Number(body)
      result.tokens.push({ kind: 'points', raw: word, display: `${body} pts` })
      continue
    }
    if (prefix === '/' && TYPE_ALIASES[body.toLowerCase()]) {
      result.type = TYPE_ALIASES[body.toLowerCase()]
      result.tokens.push({ kind: 'type', raw: word, display: result.type! })
      continue
    }
    words.push(word)
  }

  result.title = words.join(' ').trim()
  return result
}

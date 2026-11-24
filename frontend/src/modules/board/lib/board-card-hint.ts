import { getDueState } from '@/lib/format'
import type { Issue } from '@/types/models'
import type { NextActionKind } from '@/modules/issues/api/ai.api'

export interface BoardCardHint {
  action: string
  kind: NextActionKind
}

/** Instant next-action hint from fields already on the board card (no network). */
export function boardCardHint(issue: Issue): BoardCardHint | null {
  if (issue.status.category === 'done') return null

  const due = getDueState(issue.dueDate, false)
  if (due === 'overdue') {
    return { action: 'Unblock or finish — due date has passed', kind: 'schedule' }
  }
  if (due === 'today') {
    return { action: 'Ship or update the due date today', kind: 'schedule' }
  }
  if (!issue.assigneeId && !issue.assignee) {
    return { action: 'Assign an owner so this does not stall', kind: 'assign' }
  }

  const total = issue.subtaskProgress?.total ?? 0
  const done = issue.subtaskProgress?.done ?? 0
  if (total > 0 && done < total) {
    const left = total - done
    return {
      action: left === 1 ? 'Close the last open sub-task' : `Knock out ${left} remaining sub-tasks`,
      kind: 'progress',
    }
  }

  if ((issue.priority === 'highest' || issue.priority === 'high') && issue.status.category === 'todo') {
    return { action: 'Start this — high priority still in the backlog', kind: 'progress' }
  }
  if (issue.status.category === 'in_progress' && !issue.dueDate) {
    return { action: 'Add a due date to keep the pace visible', kind: 'schedule' }
  }
  if (issue.type === 'bug') {
    return { action: 'Reproduce, then pin the root cause', kind: 'progress' }
  }
  if (issue.type === 'epic' && total === 0) {
    return { action: 'Break the epic into child stories', kind: 'breakdown' }
  }
  if (issue.status.category === 'todo') {
    return { action: `Start “${issue.title.slice(0, 42)}${issue.title.length > 42 ? '…' : ''}”`, kind: 'progress' }
  }
  return { action: `Push forward from ${issue.status.name}`, kind: 'progress' }
}

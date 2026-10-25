import {
  Bookmark,
  Bug,
  CheckSquare,
  ChevronDown,
  ChevronsDown,
  ChevronsUp,
  ChevronUp,
  Equal,
  type LucideIcon,
  Split,
  Zap,
} from 'lucide-vue-next'
import type { IssuePriority, IssueType, StatusCategory } from '@/types/models'

interface TypeMeta {
  label: string
  icon: LucideIcon
  color: string
}

export const ISSUE_TYPE_META: Record<IssueType, TypeMeta> = {
  epic: { label: 'Epic', icon: Zap, color: '#8b5cf6' },
  story: { label: 'Story', icon: Bookmark, color: '#22c55e' },
  task: { label: 'Task', icon: CheckSquare, color: '#3b82f6' },
  bug: { label: 'Bug', icon: Bug, color: '#ef4444' },
  subtask: { label: 'Sub-task', icon: Split, color: '#0ea5e9' },
}

export const ISSUE_TYPES = Object.keys(ISSUE_TYPE_META) as IssueType[]
export const TOP_LEVEL_ISSUE_TYPES = ISSUE_TYPES.filter((type) => type !== 'subtask')

interface PriorityMeta {
  label: string
  icon: LucideIcon
  color: string
  rank: number
}

export const PRIORITY_META: Record<IssuePriority, PriorityMeta> = {
  highest: { label: 'Highest', icon: ChevronsUp, color: '#dc2626', rank: 5 },
  high: { label: 'High', icon: ChevronUp, color: '#f97316', rank: 4 },
  medium: { label: 'Medium', icon: Equal, color: '#eab308', rank: 3 },
  low: { label: 'Low', icon: ChevronDown, color: '#3b82f6', rank: 2 },
  lowest: { label: 'Lowest', icon: ChevronsDown, color: '#64748b', rank: 1 },
}

export const PRIORITIES = Object.keys(PRIORITY_META) as IssuePriority[]

export const STATUS_CATEGORY_META: Record<StatusCategory, { label: string; color: string }> = {
  todo: { label: 'To do', color: '#64748b' },
  in_progress: { label: 'In progress', color: '#3b82f6' },
  done: { label: 'Done', color: '#22c55e' },
}

export const COLOR_SWATCHES = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444', '#f97316', '#f59e0b',
  '#eab308', '#22c55e', '#10b981', '#14b8a6', '#0ea5e9', '#3b82f6',
  '#64748b', '#78716c',
]

import {
  AlarmClock,
  AtSign,
  Bell,
  CircleAlert,
  CircleCheck,
  Inbox,
  MailOpen,
  MessageCircle,
  MessageSquare,
  MessagesSquare,
  Rocket,
  UserPlus,
  Video,
  VideoOff,
  Workflow,
} from 'lucide-vue-next'
import type { Component } from 'vue'
import type { AppNotification } from '@/types/models'

interface KindStyle {
  label: string
  icon: Component
  /** Icon tile colours. */
  tone: string
}

const KINDS: Record<string, KindStyle> = {
  assigned: { label: 'Assigned', icon: UserPlus, tone: 'bg-sky-500/15 text-sky-600 dark:text-sky-400' },
  mentioned: { label: 'Mention', icon: AtSign, tone: 'bg-violet-500/15 text-violet-600 dark:text-violet-400' },
  chat_mention: { label: 'Chat mention', icon: AtSign, tone: 'bg-violet-500/15 text-violet-600 dark:text-violet-400' },
  commented: { label: 'Comment', icon: MessageSquare, tone: 'bg-slate-500/15 text-slate-600 dark:text-slate-300' },
  status_changed: { label: 'Status', icon: CircleCheck, tone: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' },
  due_soon: { label: 'Due date', icon: AlarmClock, tone: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
  standup_blocker: { label: 'Blocker', icon: CircleAlert, tone: 'bg-red-500/15 text-red-600 dark:text-red-400' },
  automation: { label: 'Automation', icon: Workflow, tone: 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400' },
  sprint_started: { label: 'Sprint', icon: Rocket, tone: 'bg-fuchsia-500/15 text-fuchsia-600 dark:text-fuchsia-400' },
  sprint_completed: { label: 'Sprint', icon: Rocket, tone: 'bg-fuchsia-500/15 text-fuchsia-600 dark:text-fuchsia-400' },
  member_added: { label: 'Access', icon: UserPlus, tone: 'bg-teal-500/15 text-teal-600 dark:text-teal-400' },
  chat_task: { label: 'Chat', icon: MessagesSquare, tone: 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400' },
  support_message: { label: 'Vector team', icon: MessageCircle, tone: 'bg-[#00a884]/15 text-[#00a884]' },
  meeting_invite: { label: 'Meeting', icon: Video, tone: 'bg-rose-500/15 text-rose-600 dark:text-rose-400' },
  meeting_cancelled: { label: 'Meeting cancelled', icon: VideoOff, tone: 'bg-slate-500/15 text-slate-600 dark:text-slate-300' },
}
const FALLBACK: KindStyle = { label: 'Update', icon: Bell, tone: 'bg-primary/10 text-primary' }

export const kindOf = (type: string) => KINDS[type] ?? FALLBACK

export type InboxFilter = 'all' | 'unread' | 'assigned' | 'mentions' | 'updates' | 'reminders' | 'support'

/** The Inbox folders (chips on phones); each covers a few notification types. */
export const INBOX_FILTERS: Array<{ value: InboxFilter; label: string; icon: Component; types?: string[] }> = [
  { value: 'all', label: 'Inbox', icon: Inbox },
  { value: 'unread', label: 'Unread', icon: MailOpen },
  { value: 'assigned', label: 'Assigned', icon: UserPlus, types: ['assigned'] },
  { value: 'mentions', label: 'Mentions', icon: AtSign, types: ['mentioned', 'chat_mention'] },
  {
    value: 'updates',
    label: 'Updates',
    icon: CircleCheck,
    types: ['status_changed', 'commented', 'sprint_started', 'sprint_completed', 'member_added', 'automation', 'chat_task', 'meeting_invite', 'meeting_cancelled'],
  },
  { value: 'reminders', label: 'Reminders', icon: AlarmClock, types: ['due_soon', 'standup_blocker'] },
  { value: 'support', label: 'Vector team', icon: MessageCircle, types: ['support_message'] },
]

/** What the reading pane's main button says for a notification's link. */
export function openLabel(notification: AppNotification) {
  if (notification.type === 'support_message') return 'Open chat'
  if (notification.link?.startsWith('/meetings/')) return 'Open meeting'
  if (notification.link?.startsWith('/issues/') || notification.link?.includes('issue=')) return 'Open task'
  if (notification.link?.includes('/projects/')) return 'Open project'
  return 'Open'
}

export function matchesFilter(notification: AppNotification, filter: InboxFilter) {
  if (filter === 'all') return true
  if (filter === 'unread') return !notification.readAt
  const types = INBOX_FILTERS.find((item) => item.value === filter)?.types ?? []
  return types.includes(notification.type)
}

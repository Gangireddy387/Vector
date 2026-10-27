import { BarChart3, BellRing, Clock, LayoutTemplate, Mail, MailCheck, MessagesSquare, Newspaper, Paperclip, Repeat, Sparkles, Workflow } from 'lucide-vue-next'
import type { Component } from 'vue'

/** Features a plan can switch on or off. Keys mirror the server (backend/src/modules/plans/plan.constants.js). */
export type PlanFeatureKey =
  | 'aiAssistant'
  | 'automations'
  | 'recurringTasks'
  | 'templates'
  | 'reports'
  | 'chat'
  | 'attachments'
  | 'timeTracking'
  | 'emailNotifications'
  | 'emailReminders'
  | 'emailDigest'
  | 'emailAutomations'

export type PlanFeatureGroup = 'app' | 'email'

export const PLAN_FEATURES: Array<{ key: PlanFeatureKey; label: string; description: string; icon: Component; group: PlanFeatureGroup }> = [
  { key: 'aiAssistant', label: 'AI assistant', description: 'Draft tasks, summaries and sub-task breakdowns', icon: Sparkles, group: 'app' },
  { key: 'automations', label: 'Automation rules', description: 'When something happens, do the follow-up work', icon: Workflow, group: 'app' },
  { key: 'recurringTasks', label: 'Recurring tasks', description: 'Routine work that creates itself on schedule', icon: Repeat, group: 'app' },
  { key: 'templates', label: 'Task templates', description: 'Pre-filled formats for common tasks', icon: LayoutTemplate, group: 'app' },
  { key: 'reports', label: 'Reports & progress', description: 'Charts, velocity, burndown and team insights', icon: BarChart3, group: 'app' },
  { key: 'chat', label: 'Team chat & standups', description: 'Project chat, follow-ups and daily standups', icon: MessagesSquare, group: 'app' },
  { key: 'attachments', label: 'File attachments', description: 'Upload files to tasks', icon: Paperclip, group: 'app' },
  { key: 'timeTracking', label: 'Time tracking', description: 'Log work time on tasks', icon: Clock, group: 'app' },
  { key: 'emailNotifications', label: 'Work notification emails', description: 'Assigned a task, mentioned, a watched task completed', icon: Mail, group: 'email' },
  { key: 'emailReminders', label: 'Due date reminder emails', description: 'Daily emails for tasks due soon, today or overdue', icon: BellRing, group: 'email' },
  { key: 'emailDigest', label: 'Daily digest emails', description: '8:00 summary for people who turn it on', icon: Newspaper, group: 'email' },
  { key: 'emailAutomations', label: 'Automation emails', description: 'The “Send email” action in automation rules', icon: MailCheck, group: 'email' },
]

export const PLAN_FEATURE_GROUPS: Array<{ value: PlanFeatureGroup; label: string; hint: string }> = [
  { value: 'app', label: 'Features', hint: 'What people in the organization can use' },
  { value: 'email', label: 'Emails', hint: 'Sent through SendGrid. Sign-in, invitation and approval emails always send.' },
]

export const featureLabel = (key: PlanFeatureKey) => PLAN_FEATURES.find((feature) => feature.key === key)?.label ?? key

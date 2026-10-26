import { BarChart3, Clock, LayoutTemplate, MessagesSquare, Paperclip, Repeat, Sparkles, Workflow } from 'lucide-vue-next'
import type { Component } from 'vue'

/** Features a plan can switch on or off. Keys mirror the server (backend/src/modules/plans/plan.constants.js). */
export type PlanFeatureKey = 'aiAssistant' | 'automations' | 'recurringTasks' | 'templates' | 'reports' | 'chat' | 'attachments' | 'timeTracking'

export const PLAN_FEATURES: Array<{ key: PlanFeatureKey; label: string; description: string; icon: Component }> = [
  { key: 'aiAssistant', label: 'AI assistant', description: 'Draft tasks, summaries and sub-task breakdowns', icon: Sparkles },
  { key: 'automations', label: 'Automation rules', description: 'When something happens, do the follow-up work', icon: Workflow },
  { key: 'recurringTasks', label: 'Recurring tasks', description: 'Routine work that creates itself on schedule', icon: Repeat },
  { key: 'templates', label: 'Task templates', description: 'Pre-filled formats for common tasks', icon: LayoutTemplate },
  { key: 'reports', label: 'Reports & progress', description: 'Charts, velocity, burndown and team insights', icon: BarChart3 },
  { key: 'chat', label: 'Team chat & standups', description: 'Project chat, follow-ups and daily standups', icon: MessagesSquare },
  { key: 'attachments', label: 'File attachments', description: 'Upload files to tasks', icon: Paperclip },
  { key: 'timeTracking', label: 'Time tracking', description: 'Log work time on tasks', icon: Clock },
]

export const featureLabel = (key: PlanFeatureKey) => PLAN_FEATURES.find((feature) => feature.key === key)?.label ?? key

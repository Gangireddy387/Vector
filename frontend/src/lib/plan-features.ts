import {
  BarChart3,
  BellRing,
  BookOpen,
  CalendarDays,
  Clock,
  LayoutGrid,
  LayoutTemplate,
  ListTree,
  KeyRound,
  Mail,
  MailCheck,
  MessageCircle,
  MessagesSquare,
  Music,
  Newspaper,
  Paperclip,
  Repeat,
  Send,
  Shield,
  Sparkles,
  Target,
  UserCog,
  UsersRound,
  Video,
  Webhook,
  Workflow,
  GitBranch,
} from 'lucide-vue-next'
import type { Component } from 'vue'

/** Features a plan can switch on or off. Keys mirror the server (backend/src/modules/plans/plan.constants.js). */
export type PlanFeatureKey =
  | 'aiAssistant'
  | 'automations'
  | 'recurringTasks'
  | 'templates'
  | 'customFields'
  | 'customRoles'
  | 'reports'
  | 'roadmap'
  | 'goals'
  | 'portfolio'
  | 'wiki'
  | 'chat'
  | 'directMessages'
  | 'teamChat'
  | 'meetings'
  | 'calendar'
  | 'attachments'
  | 'timeTracking'
  | 'customSounds'
  | 'channelNotifications'
  | 'vcsLinks'
  | 'webhooks'
  | 'sso'
  | 'scim'
  | 'emailInvitations'
  | 'emailNotifications'
  | 'emailReminders'
  | 'emailDigest'
  | 'emailAutomations'

export type PlanFeatureGroup = 'app' | 'email'

/** One email a switch controls: what it is, who gets it and when. */
export interface EmailDetail {
  name: string
  detail: string
}

export interface PlanFeature {
  key: PlanFeatureKey
  label: string
  description: string
  icon: Component
  group: PlanFeatureGroup
  /** Email switches: the exact emails they cover. */
  includes?: EmailDetail[]
  /** Email switches: what happens instead when the plan leaves them out. */
  whenOff?: string
}

export const PLAN_FEATURES: PlanFeature[] = [
  {
    key: 'aiAssistant',
    label: 'AI assistant',
    description: 'Draft tasks, daily briefing, meeting summaries, and sub-task breakdowns (OpenAI when configured)',
    icon: Sparkles,
    group: 'app',
  },
  { key: 'automations', label: 'Automation rules', description: 'When something happens, do the follow-up work', icon: Workflow, group: 'app' },
  { key: 'recurringTasks', label: 'Recurring tasks', description: 'Routine work that creates itself on schedule', icon: Repeat, group: 'app' },
  { key: 'templates', label: 'Task templates', description: 'Pre-filled formats for common tasks', icon: LayoutTemplate, group: 'app' },
  {
    key: 'customFields',
    label: 'Custom fields',
    description: 'Extra fields on tasks (text, number, date, select, checkbox, URL)',
    icon: ListTree,
    group: 'app',
  },
  {
    key: 'customRoles',
    label: 'Custom roles',
    description: 'Delegate workspace permissions (people, billing, departments) without full admin',
    icon: KeyRound,
    group: 'app',
  },
  { key: 'reports', label: 'Reports & progress', description: 'Charts, velocity, burndown and team insights', icon: BarChart3, group: 'app' },
  {
    key: 'roadmap',
    label: 'Roadmap & timeline',
    description: 'Timeline of epics and tasks by start and due dates',
    icon: CalendarDays,
    group: 'app',
  },
  {
    key: 'goals',
    label: 'Goals & OKRs',
    description: 'Organization objectives with measurable key results linked to work',
    icon: Target,
    group: 'app',
  },
  {
    key: 'portfolio',
    label: 'Portfolio view',
    description: 'Multi-project health, progress and overdue work across the organization',
    icon: LayoutGrid,
    group: 'app',
  },
  {
    key: 'wiki',
    label: 'Shared docs & wiki',
    description: 'Organization-wide markdown pages for handbooks, runbooks and shared notes',
    icon: BookOpen,
    group: 'app',
  },
  { key: 'chat', label: 'Team chat & standups', description: 'Project chat, follow-ups and daily standups', icon: MessagesSquare, group: 'app' },
  { key: 'directMessages', label: 'Direct messages', description: 'Private one-to-one chats between people', icon: MessageCircle, group: 'app' },
  { key: 'teamChat', label: 'Team & department chat', description: 'A group chat for every team and department', icon: UsersRound, group: 'app' },
  { key: 'meetings', label: 'Meetings & video calls', description: 'Schedule meetings, video call in the browser and share updates', icon: Video, group: 'app' },
  {
    key: 'calendar',
    label: 'Calendar & due-date sync',
    description: 'Personal calendar, and task due dates that appear as all-day events for assignees',
    icon: CalendarDays,
    group: 'app',
  },
  { key: 'attachments', label: 'File attachments', description: 'Upload files to tasks', icon: Paperclip, group: 'app' },
  { key: 'timeTracking', label: 'Time tracking', description: 'Log work time on tasks', icon: Clock, group: 'app' },
  {
    key: 'customSounds',
    label: 'Custom ringtones & sounds',
    description: 'Everyone picks their own call ringtone, message and notification sounds',
    icon: Music,
    group: 'app',
  },
  {
    key: 'channelNotifications',
    label: 'Slack & Teams notifications',
    description: 'Post assignments, comments, due dates and sprint starts to Slack or Microsoft Teams',
    icon: Webhook,
    group: 'app',
  },
  {
    key: 'vcsLinks',
    label: 'GitHub & GitLab links',
    description: 'Paste GitHub or GitLab issue and pull request URLs onto Vector tasks',
    icon: GitBranch,
    group: 'app',
  },
  {
    key: 'webhooks',
    label: 'Outbound webhooks',
    description: 'Send signed HTTPS POSTs to your systems when issues, comments or sprints change',
    icon: Webhook,
    group: 'app',
  },
  {
    key: 'sso',
    label: 'Enterprise SSO',
    description: 'Require Google, Microsoft, or OpenID Connect sign-in, lock email domains, and optionally pin a Microsoft tenant',
    icon: Shield,
    group: 'app',
  },
  {
    key: 'scim',
    label: 'SCIM provisioning',
    description: 'Sync people from your IdP (create, update, deactivate) over SCIM 2.0',
    icon: UserCog,
    group: 'app',
  },
  {
    key: 'emailInvitations',
    label: 'Invitation emails',
    description: 'Emails that bring people in or give them access to a project',
    icon: Send,
    group: 'email',
    includes: [
      { name: 'Organization invitation', detail: 'An admin invites a new person to the organization; the email has the sign-up link' },
      { name: 'Project invitation', detail: 'A project admin invites a new person to a project; the email has the sign-up link' },
      { name: 'Added to a project', detail: 'Someone who already has an account is added to a project' },
    ],
    whenOff: 'Invites still work: the admin gets the sign-up link copied to share themselves. People already in Vector just see the project.',
  },
  {
    key: 'emailNotifications',
    label: 'Work notification emails',
    description: 'Email copies of important in-app notifications',
    icon: Mail,
    group: 'email',
    includes: [
      { name: 'Task assigned', detail: 'To the person a task is created for or reassigned to' },
      { name: 'Mentioned', detail: 'To someone @mentioned in a task comment' },
      { name: 'Task completed', detail: 'To people watching a task when it moves to Done' },
    ],
    whenOff: 'These still appear in everyone’s Inbox.',
  },
  {
    key: 'emailReminders',
    label: 'Due date reminder emails',
    description: 'Daily nudges about deadlines',
    icon: BellRing,
    group: 'email',
    includes: [{ name: 'Due soon, due today, overdue', detail: 'Once a day to the assignee of each task close to or past its due date' }],
    whenOff: 'Reminders still appear in the Inbox.',
  },
  {
    key: 'emailDigest',
    label: 'Daily digest emails',
    description: 'A morning summary for people who turn it on in Settings',
    icon: Newspaper,
    group: 'email',
    includes: [
      { name: 'Daily digest', detail: 'At 8:00 local time: overdue, due today, due this week and in-progress tasks' },
      { name: 'Workday nudge email', detail: 'Day 2 / day 7 habit reminder email when someone has not started their day' },
    ],
    whenOff: 'The Daily digest setting has no effect for this organization’s work. Workday nudges still appear in the Inbox.',
  },
  {
    key: 'emailAutomations',
    label: 'Automation emails',
    description: 'Emails sent by the organization’s own automation rules',
    icon: MailCheck,
    group: 'email',
    includes: [{ name: 'Rule “Send email” action', detail: 'Whoever the rule names, each time the rule runs' }],
    whenOff: 'Rules still run; their Send email step is skipped.',
  },
]

export const PLAN_FEATURE_GROUPS: Array<{ value: PlanFeatureGroup; label: string; hint: string }> = [
  { value: 'app', label: 'Features', hint: 'What people in the organization can use' },
  { value: 'email', label: 'Emails', hint: 'Sent through SendGrid. People can also turn notification and digest emails off for themselves in Settings.' },
]

/** Needed to sign in, join or hear the super admin's decision, so no plan can turn them off. */
export const ALWAYS_SENT_EMAILS: EmailDetail[] = [
  { name: 'Password reset', detail: 'When someone clicks “Forgot password”' },
  { name: 'Added to the organization', detail: 'When someone who already has an account is added' },
  { name: 'New organization to review', detail: 'To the super admin when an organization signs up' },
  { name: 'Organization approved or rejected', detail: 'To the organization’s creator' },
]

export const featureLabel = (key: PlanFeatureKey) => PLAN_FEATURES.find((feature) => feature.key === key)?.label ?? key

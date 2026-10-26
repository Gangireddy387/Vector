import { BarChart3, ClipboardList, Columns3, Kanban, ListTodo, MessagesSquare, Settings, TrendingUp, Workflow } from 'lucide-vue-next'
import type { Component } from 'vue'
import type { PlanFeatureKey } from '@/lib/plan-features'
import type { Project } from '@/types/models'

export interface ProjectNavItem {
  name: string
  label: string
  icon: Component
}

/** The automation page holds rules, templates and recurring tasks; it shows when the plan includes any of them. */
export const AUTOMATION_FEATURES: PlanFeatureKey[] = ['automations', 'templates', 'recurringTasks']

/** Sections inside a project, shared by the sidebar, project tabs and the mobile project switcher. */
export function getProjectNavigation(project: Pick<Project, 'type' | 'myRole'>, hasFeature: (key: PlanFeatureKey) => boolean = () => true): ProjectNavItem[] {
  return [
    { name: 'project-board', label: 'Board', icon: Kanban },
    ...(project.type === 'scrum' ? [{ name: 'project-backlog', label: 'Backlog', icon: Columns3 }] : []),
    { name: 'project-issues', label: 'Tasks', icon: ListTodo },
    ...(hasFeature('chat')
      ? [
          { name: 'project-chat', label: 'Chat', icon: MessagesSquare },
          { name: 'project-standup', label: 'Standup', icon: ClipboardList },
        ]
      : []),
    ...(hasFeature('reports')
      ? [
          { name: 'project-progress', label: 'Progress', icon: TrendingUp },
          { name: 'project-reports', label: 'Reports', icon: BarChart3 },
        ]
      : []),
    ...(AUTOMATION_FEATURES.some(hasFeature) ? [{ name: 'project-automation', label: 'Automation', icon: Workflow }] : []),
    ...(project.myRole === 'admin' ? [{ name: 'project-settings', label: 'Settings', icon: Settings }] : []),
  ]
}

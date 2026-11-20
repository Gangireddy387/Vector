import { BarChart3, CalendarRange, ClipboardList, Columns3, GitBranch, Hash, Kanban, ListTodo, Package, Settings, TrendingUp, Workflow } from 'lucide-vue-next'
import type { Component } from 'vue'
import type { RouteLocationRaw } from 'vue-router'
import type { PlanFeatureKey } from '@/lib/plan-features'
import type { Project } from '@/types/models'

export interface ProjectNavItem {
  name: string
  label: string
  icon: Component
  /** When set, navigate here instead of the named project route (locked-feature teasers). */
  to?: RouteLocationRaw
  locked?: boolean
}

/** The automation page holds rules, templates and recurring tasks; it shows when the plan includes any of them. */
export const AUTOMATION_FEATURES: PlanFeatureKey[] = ['automations', 'templates', 'recurringTasks']

/** Sections inside a project, shared by the sidebar, project tabs and the mobile project switcher. */
export function getProjectNavigation(project: Pick<Project, 'type' | 'myRole'>, hasFeature: (key: PlanFeatureKey) => boolean = () => true): ProjectNavItem[] {
  const chatNav: ProjectNavItem[] = hasFeature('chat')
    ? [
        { name: 'project-chat', label: 'Work chat', icon: Hash },
        { name: 'project-standup', label: 'Standup', icon: ClipboardList },
      ]
    : [
        {
          name: 'feature-locked',
          label: 'Work chat',
          icon: Hash,
          locked: true,
          to: { name: 'feature-locked', query: { feature: 'chat' } },
        },
        {
          name: 'feature-locked',
          label: 'Standup',
          icon: ClipboardList,
          locked: true,
          to: { name: 'feature-locked', query: { feature: 'chat' } },
        },
      ]

  return [
    { name: 'project-board', label: 'Board', icon: Kanban },
    ...(project.type === 'scrum' ? [{ name: 'project-backlog', label: 'Backlog', icon: Columns3 }] : []),
    { name: 'project-issues', label: 'Tasks', icon: ListTodo },
    { name: 'project-dependencies', label: 'Dependencies', icon: GitBranch },
    ...(hasFeature('roadmap')
      ? [{ name: 'project-roadmap', label: 'Roadmap', icon: CalendarRange }]
      : [
          {
            name: 'feature-locked',
            label: 'Roadmap',
            icon: CalendarRange,
            locked: true,
            to: { name: 'feature-locked', query: { feature: 'roadmap' } },
          },
        ]),
    ...(hasFeature('releases')
      ? [{ name: 'project-releases', label: 'Releases', icon: Package }]
      : [
          {
            name: 'feature-locked',
            label: 'Releases',
            icon: Package,
            locked: true,
            to: { name: 'feature-locked', query: { feature: 'releases' } },
          },
        ]),
    ...chatNav,
    ...(hasFeature('reports')
      ? [
          { name: 'project-progress', label: 'Progress', icon: TrendingUp },
          { name: 'project-reports', label: 'Reports', icon: BarChart3 },
        ]
      : [
          {
            name: 'feature-locked',
            label: 'Progress',
            icon: TrendingUp,
            locked: true,
            to: { name: 'feature-locked', query: { feature: 'reports' } },
          },
          {
            name: 'feature-locked',
            label: 'Reports',
            icon: BarChart3,
            locked: true,
            to: { name: 'feature-locked', query: { feature: 'reports' } },
          },
        ]),
    ...(AUTOMATION_FEATURES.some(hasFeature)
      ? [{ name: 'project-automation', label: 'Automation', icon: Workflow }]
      : [
          {
            name: 'feature-locked',
            label: 'Automation',
            icon: Workflow,
            locked: true,
            to: { name: 'feature-locked', query: { feature: 'automations' } },
          },
        ]),
    ...(project.myRole === 'admin' ? [{ name: 'project-settings', label: 'Settings', icon: Settings }] : []),
  ]
}

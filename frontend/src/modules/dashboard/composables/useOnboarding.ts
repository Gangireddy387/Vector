import { useStorage } from '@vueuse/core'
import { computed, onMounted, ref, type Ref, watch } from 'vue'
import type { RouteLocationRaw } from 'vue-router'
import { workspaceApi } from '@/modules/admin/admin.api'
import { useAuthStore } from '@/modules/auth/auth.store'
import { useProjectsStore } from '@/modules/projects/projects.store'
import type { DashboardData } from '../dashboard.api'

export type StepAction = { kind: 'route'; to: RouteLocationRaw } | { kind: 'create-project' } | { kind: 'create-task' } | { kind: 'profile' }

export interface OnboardingStep {
  id: string
  title: string
  description: string
  done: boolean
  action: StepAction
  actionLabel: string
  /** Shown next to the main action, e.g. "Try a sample project". */
  sample?: boolean
}

/**
 * The getting-started checklist on Home. Admins set up the organization (brand, first project, team, tasks, a sprint);
 * members get a lighter list (photo, job title, joining a project). Every step ticks itself off from real data, and
 * the person can hide the checklist; both are remembered per organization and person.
 */
export function useOnboarding(data: Ref<DashboardData | null>) {
  const auth = useAuthStore()
  const projects = useProjectsStore()
  const isAdmin = computed(() => auth.isOrganizationAdmin)
  const scope = computed(() => `${auth.organization?.id ?? 'none'}.${auth.user?.id ?? 'none'}`)
  const hidden = useStorage<Record<string, boolean>>('vector.onboarding.hidden', {})
  const peopleCount = ref<number | null>(null)

  onMounted(async () => {
    void projects.fetchProjects().catch(() => undefined)
    if (isAdmin.value) peopleCount.value = (await workspaceApi.members().catch(() => [])).length
  })

  const scrumProject = computed(() => projects.activeProjects.find((project) => project.type === 'scrum') ?? null)

  const steps = computed<OnboardingStep[]>(() => {
    const dashboard = data.value
    if (isAdmin.value) {
      const organization = auth.organization
      return [
        {
          id: 'brand',
          title: 'Make it yours',
          description: 'Add your logo and pick a theme colour for everyone.',
          done: Boolean(organization?.logoUrl || organization?.brandColor),
          action: { kind: 'route', to: { name: 'workspace-admin' } },
          actionLabel: 'Add logo',
        },
        {
          id: 'project',
          title: 'Create a project',
          description: 'A project holds your board, backlog and team chat.',
          done: Boolean(dashboard?.projects.length) || projects.activeProjects.length > 0,
          action: { kind: 'create-project' },
          actionLabel: 'New project',
          sample: true,
        },
        {
          id: 'invite',
          title: 'Invite your team',
          description: 'Bring people in by email; they join in one click.',
          done: (peopleCount.value ?? 1) > 1,
          action: { kind: 'route', to: { name: 'workspace-admin', query: { tab: 'people' } } },
          actionLabel: 'Invite people',
        },
        {
          id: 'tasks',
          title: 'Add your first tasks',
          description: 'Capture work with owners, due dates and priorities.',
          done: Boolean(dashboard?.projects.some((project) => (project.issueSummary?.total ?? 0) > 0)),
          action: { kind: 'create-task' },
          actionLabel: 'New task',
        },
        {
          id: 'sprint',
          title: 'Start a sprint',
          description: 'Plan two weeks of work and track it on the board.',
          done: Boolean(dashboard?.activeSprints.length),
          action: { kind: 'route', to: scrumProject.value ? { name: 'project-backlog', params: { projectId: scrumProject.value.id } } : { name: 'projects' } },
          actionLabel: 'Open backlog',
        },
      ]
    }
    return [
      {
        id: 'photo',
        title: 'Add a profile photo',
        description: 'Help teammates recognise you in chats and calls.',
        done: Boolean(auth.user?.avatarUrl),
        action: { kind: 'profile' },
        actionLabel: 'Add photo',
      },
      {
        id: 'title',
        title: 'Add your job title',
        description: 'So people know what you work on.',
        done: Boolean(auth.user?.title),
        action: { kind: 'profile' },
        actionLabel: 'Edit profile',
      },
      {
        id: 'project',
        title: 'Join a project',
        description: 'Your admin adds you; your work then shows up here.',
        done: projects.joinedProjects.length > 0,
        action: { kind: 'route', to: { name: 'projects' } },
        actionLabel: 'See projects',
      },
    ]
  })

  const doneCount = computed(() => steps.value.filter((step) => step.done).length)
  const isComplete = computed(() => doneCount.value === steps.value.length)

  /**
   * Organizations that are already set up never see the checklist; it only says "You're all set" when the last step
   * is finished while it is on screen. Until everything has loaded nothing is decided.
   */
  const isReady = computed(() => Boolean(data.value) && (!isAdmin.value || peopleCount.value !== null))
  const justCompleted = ref(false)
  watch(
    () => (isReady.value ? isComplete.value : null),
    (now, before) => {
      if (now === true && before === false) justCompleted.value = true
    },
  )
  const isVisible = computed(
    () => Boolean(auth.organization) && isReady.value && !hidden.value[scope.value] && (!isComplete.value || justCompleted.value),
  )
  const hide = () => (hidden.value = { ...hidden.value, [scope.value]: true })

  return { steps, doneCount, isComplete, isVisible, hide, isAdmin }
}

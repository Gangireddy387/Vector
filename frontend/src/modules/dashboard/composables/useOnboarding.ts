import { useStorage } from '@vueuse/core'
import { computed, onMounted, ref, type Ref, watch } from 'vue'
import type { RouteLocationRaw } from 'vue-router'
import { workspaceApi } from '@/modules/admin/admin.api'
import { useAuthStore } from '@/modules/auth/auth.store'
import { useProjectsStore } from '@/modules/projects/projects.store'
import type { DashboardData } from '../dashboard.api'
import { useStartDayHighlight } from './useStartDayHighlight'

export type StepAction =
  | { kind: 'route'; to: RouteLocationRaw }
  | { kind: 'create-project' }
  | { kind: 'create-task' }
  | { kind: 'profile' }
  | { kind: 'schedule-meeting' }

export interface OnboardingStep {
  id: string
  title: string
  description: string
  done: boolean
  action: StepAction
  actionLabel: string
  /** Shown next to the main action, e.g. "Try a sample project". */
  sample?: boolean
  /** Optional steps can be skipped (remembered per person/org). */
  optional?: boolean
}

/**
 * First ~10 minutes on Home: project → invite 2 people → standup → first task → optional meeting.
 * Members get a lighter path (photo, title, join, start the day).
 */
export function useOnboarding(data: Ref<DashboardData | null>) {
  const auth = useAuthStore()
  const projects = useProjectsStore()
  const startDayHighlight = useStartDayHighlight()
  const isAdmin = computed(() => auth.isOrganizationAdmin)
  const scope = computed(() => `${auth.organization?.id ?? 'none'}.${auth.user?.id ?? 'none'}`)
  const hidden = useStorage<Record<string, boolean>>('vector.onboarding.hidden', {})
  const skipped = useStorage<Record<string, string[]>>('vector.onboarding.skipped', {})
  const peopleCount = ref<number | null>(null)

  onMounted(async () => {
    void projects.fetchProjects().catch(() => undefined)
    if (isAdmin.value) peopleCount.value = (await workspaceApi.members().catch(() => [])).length
  })

  const firstProjectId = computed(() => projects.joinedProjects[0]?.id ?? data.value?.projects[0]?.id ?? null)
  const hasProject = computed(() => Boolean(data.value?.projects.length) || projects.activeProjects.length > 0)
  const skippedIds = computed(() => new Set(skipped.value[scope.value] ?? []))

  const skip = (stepId: string) => {
    const current = skipped.value[scope.value] ?? []
    if (current.includes(stepId)) return
    skipped.value = { ...skipped.value, [scope.value]: [...current, stepId] }
  }

  /** Invite / Start my day deep-link counts as completing the member “start workday” step. */
  watch(
    startDayHighlight,
    (highlighted) => {
      if (highlighted && !isAdmin.value) skip('start-day')
    },
    { immediate: true },
  )

  const steps = computed<OnboardingStep[]>(() => {
    const dashboard = data.value
    if (isAdmin.value) {
      const standupPending = dashboard?.standupPending ?? []
      const canStandup = auth.hasFeature('chat')
      const canMeet = auth.hasFeature('meetings')
      return [
        {
          id: 'project',
          title: 'Create a project',
          description: 'Board, standup and Work chat live here. Or try a sample first.',
          done: hasProject.value,
          action: { kind: 'create-project' },
          actionLabel: 'New project',
          sample: true,
        },
        {
          id: 'invite',
          title: 'Invite 2 people',
          description: 'Bring two teammates in by email — they land on Start my day.',
          done: (peopleCount.value ?? 1) >= 3,
          action: { kind: 'route', to: { name: 'workspace-admin', query: { tab: 'people' } } },
          actionLabel: 'Invite people',
        },
        {
          id: 'standup',
          title: 'Post today’s standup',
          description: canStandup
            ? 'Share what you did, what’s next, and blockers — then clear tasks.'
            : 'Standups unlock with Team chat on Pro — skip for now or upgrade.',
          done: !canStandup || skippedIds.value.has('standup') || (hasProject.value && standupPending.length === 0),
          action:
            canStandup && firstProjectId.value
              ? { kind: 'route', to: { name: 'project-standup', params: { projectId: firstProjectId.value } } }
              : { kind: 'route', to: { name: 'feature-locked', query: { feature: 'chat' } } },
          actionLabel: canStandup ? 'Write standup' : 'What’s locked',
          optional: !canStandup,
        },
        {
          id: 'tasks',
          title: 'Create your first task',
          description: 'Give it an owner and a due date so Home has real work.',
          done: Boolean(dashboard?.projects.some((project) => (project.issueSummary?.total ?? 0) > 0)),
          action: { kind: 'create-task' },
          actionLabel: 'New task',
        },
        {
          id: 'meeting',
          title: 'Schedule a meeting',
          description: canMeet
            ? 'Optional — invite the team, then turn action items into tasks.'
            : 'Meetings unlock on Pro. Skip for now if you like.',
          done: !canMeet || skippedIds.value.has('meeting'),
          action: canMeet
            ? { kind: 'schedule-meeting' }
            : { kind: 'route', to: { name: 'feature-locked', query: { feature: 'meetings' } } },
          actionLabel: canMeet ? 'Schedule' : 'What’s locked',
          optional: true,
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
      {
        id: 'start-day',
        title: 'Start your workday',
        description: 'Open the loop: standup → tasks → meetings → messages.',
        done: skippedIds.value.has('start-day'),
        action: { kind: 'route', to: { name: 'home', query: { startDay: '1' } } },
        actionLabel: 'Start my day',
        optional: true,
      },
    ]
  })

  const doneCount = computed(() => steps.value.filter((step) => step.done).length)
  const isComplete = computed(() => doneCount.value === steps.value.length)

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

  return { steps, doneCount, isComplete, isVisible, hide, isAdmin, skip }
}

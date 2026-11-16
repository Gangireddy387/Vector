<script setup lang="ts">
import { useStorage } from '@vueuse/core'
import { ClipboardList, ListTodo, Share2, Users, X } from 'lucide-vue-next'
import { computed, toRef } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/modules/auth/auth.store'
import { useUiStore } from '@/stores/ui.store'
import { useOnboarding } from '../composables/useOnboarding'
import type { DashboardData } from '../dashboard.api'
import { copyShareWorkday } from '../share-workday'

/**
 * After setup is dismissed/complete: keep a quiet Home coaching people what to do next
 * in the first quiet weeks (standup, invite, task, share).
 */
const props = defineProps<{ data: DashboardData }>()
const emit = defineEmits<{ createProject: [] }>()

const auth = useAuthStore()
const ui = useUiStore()
const router = useRouter()
const { isVisible: setupVisible } = useOnboarding(toRef(props, 'data'))
const scope = computed(() => `${auth.organization?.id ?? 'none'}.${auth.user?.id ?? 'none'}`)
const dismissed = useStorage<Record<string, boolean>>('vector.habitCoach.dismissed', {})

const stats = computed(() => props.data.stats)
const standupPending = computed(() => props.data.standupPending ?? [])
const density = computed(() => props.data.densityHints ?? [])
const hasProject = computed(() => (props.data.projects?.length ?? 0) > 0)
const openTasks = computed(() => stats.value?.open ?? 0)
const needsInvite = computed(() => density.value.some((hint) => hint.memberCount < 3))

type CoachStep = {
  id: string
  title: string
  detail: string
  icon: typeof ClipboardList
  actionLabel: string
  run: () => void
}

const steps = computed<CoachStep[]>(() => {
  const list: CoachStep[] = []
  if (!hasProject.value && auth.isOrganizationAdmin) {
    list.push({
      id: 'project',
      title: 'Create a project',
      detail: 'Board, standup and tasks need a home.',
      icon: ListTodo,
      actionLabel: 'New project',
      run: () => emit('createProject'),
    })
  }
  if (standupPending.value.length && auth.hasFeature('chat')) {
    const first = standupPending.value[0]!
    list.push({
      id: 'standup',
      title: 'Post today’s standup',
      detail: `Still open in ${standupPending.value.length === 1 ? first.projectName : `${standupPending.value.length} projects`}.`,
      icon: ClipboardList,
      actionLabel: 'Write standup',
      run: () =>
        void router.push({
          name: 'project-standup',
          params: { projectId: first.projectId },
          query: { date: first.date },
        }),
    })
  }
  if (openTasks.value === 0) {
    list.push({
      id: 'task',
      title: 'Create your first task',
      detail: 'Give Home something real to track today.',
      icon: ListTodo,
      actionLabel: 'New task',
      run: () => ui.openCreateIssue({}),
    })
  }
  if (needsInvite.value && auth.isOrganizationAdmin) {
    list.push({
      id: 'invite',
      title: 'Invite teammates',
      detail: 'Habits stick when at least a few people run the loop together.',
      icon: Users,
      actionLabel: 'Invite',
      run: () => void router.push({ name: 'workspace-admin', query: { tab: 'people' } }),
    })
  }
  list.push({
    id: 'share',
    title: 'Share your workday',
    detail: 'Send the loop preview so others see how Vector runs the day.',
    icon: Share2,
    actionLabel: 'Copy link',
    run: () => void copyShareWorkday(auth.organization?.slug),
  })
  return list.slice(0, 3)
})

const quiet =
  computed(
    () => openTasks.value === 0 || standupPending.value.length > 0 || needsInvite.value || !hasProject.value,
  )

const show = computed(
  () => Boolean(auth.organization) && !setupVisible.value && !dismissed.value[scope.value] && quiet.value,
)

const dismiss = () => (dismissed.value = { ...dismissed.value, [scope.value]: true })
</script>

<template>
  <section v-if="show && steps.length" class="overflow-hidden rounded-xl border border-dashed border-border bg-card/80 shadow-soft" aria-label="Keep going">
    <header class="flex items-start gap-2 border-b border-border/70 px-4 py-3">
      <div class="min-w-0 flex-1">
        <h2 class="text-sm font-semibold">Keep the workday moving</h2>
        <p class="mt-0.5 text-xs text-muted-foreground">Quiet week? Pick one next step — Vector works when the loop has people and work in it.</p>
      </div>
      <Button variant="ghost" size="icon-sm" class="shrink-0 text-muted-foreground" aria-label="Dismiss" @click="dismiss">
        <X />
      </Button>
    </header>
    <ul class="divide-y divide-border/70">
      <li v-for="step in steps" :key="step.id" class="flex flex-col gap-2 px-4 py-2.5 sm:flex-row sm:items-center">
        <span class="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <component :is="step.icon" class="size-3.5" />
        </span>
        <div class="min-w-0 flex-1">
          <p class="text-[13px] font-medium">{{ step.title }}</p>
          <p class="text-[12px] text-muted-foreground">{{ step.detail }}</p>
        </div>
        <Button size="sm" variant="outline" class="shrink-0 max-sm:w-full" @click="step.run">{{ step.actionLabel }}</Button>
      </li>
    </ul>
    <div class="border-t border-border/60 px-4 py-2 text-right">
      <Button variant="link" size="xs" class="h-auto p-0 text-muted-foreground" as-child>
        <RouterLink :to="{ name: 'home', query: { startDay: '1' } }">Open Start my day</RouterLink>
      </Button>
    </div>
  </section>
</template>

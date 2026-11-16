<script setup lang="ts">
import { ArrowUpRight, Check, Rocket, Trash2 } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import UserAvatar from '@/components/common/UserAvatar.vue'
import UserAvatarStack from '@/components/common/UserAvatarStack.vue'
import { getProjectNavigation } from '@/components/layout/projectNavigation'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDateTime, timeAgo } from '@/lib/format'
import { toPlainText } from '@/lib/markdown'
import { useAuthStore } from '@/modules/auth/auth.store'
import { useProjectsStore } from '@/modules/projects/projects.store'
import SprintProgress from '@/modules/sprints/components/SprintProgress.vue'
import { sprintsApi } from '@/modules/sprints/sprints.api'
import type { AppNotification, Sprint } from '@/types/models'
import { kindOf, openLabel } from '../notification-kinds'

const props = defineProps<{
  latest: AppNotification
  /** Every notification folded into this entry, newest first. */
  items: AppNotification[]
  unread: boolean
  /** Other notifications about the same project, newest first. */
  related: AppNotification[]
}>()
const emit = defineEmits<{ open: []; read: []; remove: []; select: [notificationId: string] }>()

const auth = useAuthStore()
const projects = useProjectsStore()

const kind = computed(() => kindOf(props.latest.type))
const sender = (notification: AppNotification) => notification.actor?.name ?? kindOf(notification.type).label

/** The project the notification is about (from its link), with live details: sprint progress, people and shortcuts. */
const projectId = computed(() => props.latest.link?.match(/^\/projects\/([^/?#]+)/)?.[1] ?? null)
const project = computed(() => (projectId.value ? (projects.details[projectId.value] ?? null) : null))
const summary = computed(() => projects.projects.find((item) => item.id === projectId.value) ?? null)
const isLoadingProject = ref(false)
const sprints = ref<Sprint[]>([])

watch(
  projectId,
  async (id) => {
    sprints.value = []
    if (!id) return
    isLoadingProject.value = !projects.details[id]
    try {
      const [detail] = await Promise.all([projects.fetchProject(id), projects.fetchProjects()])
      if (detail?.type === 'scrum') sprints.value = await sprintsApi.list(id)
    } catch {
      /* no access any more: the notification text still shows */
    } finally {
      isLoadingProject.value = false
    }
  },
  { immediate: true },
)

/** Sprint news shows that sprint (matched by name); anything else about the project shows the running sprint. */
const sprint = computed(() => {
  if (!sprints.value.length) return null
  if (props.latest.type.startsWith('sprint_')) {
    const name = props.latest.title.replace(/ (started|completed)$/, '')
    const match = sprints.value.find((item) => item.name === name)
    if (match) return match
  }
  return sprints.value.find((item) => item.state === 'active') ?? null
})
const sprintState = computed(() =>
  sprint.value?.state === 'active' ? 'Active' : sprint.value?.state === 'completed' ? 'Completed' : 'Planned',
)

const shortcuts = computed(() =>
  project.value ? getProjectNavigation(project.value, auth.hasFeature).filter((item) => item.name !== 'project-settings').slice(0, 6) : [],
)
const stats = computed(() => {
  const issues = summary.value?.issueSummary
  return [
    { label: 'Open tasks', value: issues?.open ?? '–' },
    { label: 'Done', value: issues?.done ?? '–' },
    { label: 'People', value: project.value?.members.length ?? summary.value?.memberCount ?? '–' },
  ]
})

const showProject = computed(() => Boolean(projectId.value && (project.value || isLoadingProject.value)))
const hasMain = computed(() => Boolean(props.latest.body || sprint.value || props.items.length > 1 || props.related.length))
</script>

<template>
  <div class="flex h-full min-w-0 flex-col">
    <!-- What it is and what you can do, always in reach -->
    <header class="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
      <span class="inline-flex h-6 items-center gap-1.5 rounded-full px-2 text-[11.5px] font-medium" :class="kind.tone">
        <component :is="kind.icon" class="size-3.5" /> {{ kind.label }}
      </span>
      <span class="text-xs text-muted-foreground" :title="formatDateTime(latest.createdAt)">{{ timeAgo(latest.createdAt) }}</span>
      <div class="ml-auto flex items-center gap-1">
        <Button v-if="unread" variant="ghost" size="sm" @click="emit('read')"><Check /> Mark read</Button>
        <Button variant="ghost" size="sm" class="text-muted-foreground hover:text-destructive" @click="emit('remove')"><Trash2 /> Dismiss</Button>
        <Button v-if="latest.link" size="sm" @click="emit('open')">{{ openLabel(latest) }} <ArrowUpRight /></Button>
      </div>
    </header>

    <div class="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
      <div class="@container px-6 py-6">
        <!-- Who, what, when -->
        <div class="flex items-start gap-3.5">
          <UserAvatar v-if="latest.actor" :user="latest.actor" size="lg" class="size-11 text-sm" />
          <span v-else class="flex size-11 shrink-0 items-center justify-center rounded-xl" :class="kind.tone">
            <component :is="kind.icon" class="size-5" />
          </span>
          <div class="min-w-0 flex-1 pt-0.5">
            <h2 class="text-xl leading-snug font-semibold tracking-tight">{{ latest.title }}</h2>
            <p class="mt-1 text-[13px] text-muted-foreground">
              {{ sender(latest) }} · {{ formatDateTime(latest.createdAt) }}
              <template v-if="project">
                · in
                <RouterLink :to="{ name: 'project-board', params: { projectId: project.id } }" class="font-medium text-foreground hover:underline">{{ project.name }}</RouterLink>
              </template>
            </p>
          </div>
        </div>

        <!-- Main column, with the project beside it when the pane is wide enough -->
        <div class="mt-5 grid items-start gap-5" :class="hasMain && showProject && '@4xl:grid-cols-[minmax(0,1fr)_minmax(19rem,23rem)]'">
          <div v-if="hasMain" class="min-w-0 space-y-5">
            <!-- The message itself -->
            <div v-if="latest.body" class="rounded-xl border border-border bg-card p-4 shadow-soft">
              <p class="text-[14px] leading-relaxed whitespace-pre-line text-foreground/90">{{ toPlainText(latest.body, 4000) }}</p>
            </div>

            <!-- The sprint it is about -->
            <section v-if="sprint" class="rounded-xl border border-border bg-card p-4 shadow-soft">
              <div class="mb-3 flex items-center gap-2.5">
                <span class="flex size-8 items-center justify-center rounded-lg bg-fuchsia-500/12 text-fuchsia-600 dark:text-fuchsia-400"><Rocket class="size-4" /></span>
                <div class="min-w-0 flex-1">
                  <p class="flex items-center gap-2 text-sm font-semibold">
                    <span class="truncate">{{ sprint.name }}</span>
                    <span
                      class="rounded-full px-1.5 py-px text-[10.5px] font-medium"
                      :class="sprint.state === 'active' ? 'bg-success/12 text-success' : 'bg-muted text-muted-foreground'"
                    >
                      {{ sprintState }}
                    </span>
                  </p>
                  <p v-if="sprint.goal" class="truncate text-xs text-muted-foreground">{{ sprint.goal }}</p>
                </div>
                <Button as-child variant="ghost" size="sm">
                  <RouterLink :to="{ name: 'project-backlog', params: { projectId: sprint.projectId } }">Backlog <ArrowUpRight /></RouterLink>
                </Button>
              </div>
              <SprintProgress :sprint="sprint" :stats="sprint.state === 'completed' ? sprint.summary : sprint.stats" />
            </section>

            <!-- Earlier notifications about the same thing -->
            <section v-if="items.length > 1" class="space-y-2">
              <h3 class="text-xs font-medium text-muted-foreground">Earlier about this ({{ items.length - 1 }})</h3>
              <ol class="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
                <li v-for="item in items.slice(1)" :key="item.id" class="flex items-start gap-2.5 px-3.5 py-2.5">
                  <UserAvatar v-if="item.actor" :user="item.actor" size="sm" class="mt-0.5" />
                  <span class="min-w-0 flex-1">
                    <span class="block truncate text-[13px]"><span class="font-medium">{{ sender(item) }}</span> <span class="text-muted-foreground">{{ item.title }}</span></span>
                    <span v-if="item.body" class="block truncate text-xs text-muted-foreground">{{ toPlainText(item.body, 200) }}</span>
                  </span>
                  <span class="shrink-0 text-[11px] text-muted-foreground tabular-nums" :title="formatDateTime(item.createdAt)">{{ timeAgo(item.createdAt) }}</span>
                </li>
              </ol>
            </section>

            <!-- Other news from the same project, one click away -->
            <section v-if="related.length" class="space-y-2">
              <h3 class="text-xs font-medium text-muted-foreground">More from {{ project?.name ?? 'this project' }}</h3>
              <ul class="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
                <li v-for="item in related" :key="item.id">
                  <button type="button" class="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left transition-colors hover:bg-accent/60" @click="emit('select', item.id)">
                    <span class="flex size-6 shrink-0 items-center justify-center rounded-md" :class="kindOf(item.type).tone"><component :is="kindOf(item.type).icon" class="size-3.5" /></span>
                    <span class="min-w-0 flex-1 truncate text-[13px]" :class="!item.readAt && 'font-semibold'">{{ item.title }}</span>
                    <span class="shrink-0 text-[11px] text-muted-foreground tabular-nums">{{ timeAgo(item.createdAt) }}</span>
                  </button>
                </li>
              </ul>
            </section>
          </div>

          <!-- The project: numbers, people and shortcuts -->
          <section v-if="showProject" class="min-w-0 overflow-hidden rounded-xl border border-border bg-card shadow-soft">
            <div v-if="!project" class="space-y-3 p-4">
              <Skeleton class="h-8 w-48" />
              <Skeleton class="h-14 w-full" />
            </div>
            <template v-else>
              <div class="flex items-center gap-3 p-4">
                <span class="flex size-9 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold text-white shadow-glow" :style="{ backgroundColor: project.color }">
                  {{ project.key.slice(0, 3) }}
                </span>
                <div class="min-w-0 flex-1">
                  <p class="truncate text-sm font-semibold">{{ project.name }}</p>
                  <p class="truncate text-xs text-muted-foreground">
                    {{ project.key }} · {{ project.type === 'scrum' ? 'Scrum' : 'Kanban' }}<template v-if="project.team"> · {{ project.team.name }}</template>
                  </p>
                </div>
                <UserAvatarStack v-if="project.members.length" :users="project.members" :max="4" />
              </div>
              <p v-if="project.lead" class="flex items-center gap-2 border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
                <UserAvatar :user="project.lead" size="sm" /> Lead <span class="font-medium text-foreground">{{ project.lead.name }}</span>
              </p>
              <div class="grid grid-cols-3 divide-x divide-border border-y border-border">
                <div v-for="stat in stats" :key="stat.label" class="px-4 py-3">
                  <p class="text-[11.5px] text-muted-foreground">{{ stat.label }}</p>
                  <p class="text-lg font-semibold tabular-nums">{{ stat.value }}</p>
                </div>
              </div>
              <nav class="flex flex-wrap gap-0.5 p-1.5" :class="hasMain && '@4xl:grid @4xl:grid-cols-2'" aria-label="Open in project">
                <RouterLink
                  v-for="item in shortcuts"
                  :key="`${item.label}-${item.name}`"
                  :to="item.to ?? { name: item.name, params: { projectId: project.id } }"
                  class="inline-flex h-8 items-center gap-2 rounded-md px-2.5 text-[13px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <component :is="item.icon" class="size-4" /> {{ item.label }}
                </RouterLink>
              </nav>
            </template>
          </section>
        </div>
      </div>
    </div>
  </div>
</template>

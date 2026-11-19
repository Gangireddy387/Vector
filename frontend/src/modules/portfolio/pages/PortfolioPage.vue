<script setup lang="ts">
import { AlertTriangle, CheckCircle2, CircleDashed, FolderKanban, LayoutGrid, RefreshCw, Search } from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import EmptyState from '@/components/common/EmptyState.vue'
import UserAvatar from '@/components/common/UserAvatar.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { useDevice } from '@/composables/useDevice'
import { formatDate } from '@/lib/format'
import { getErrorMessage } from '@/lib/http'
import { useProjectsStore } from '@/modules/projects/projects.store'
import type { Project } from '@/types/models'
import { toast } from 'vue-sonner'
import {
  completionOf,
  healthOf,
  PORTFOLIO_HEALTH_META,
  type PortfolioHealth,
} from '../lib/portfolio-health'

const projects = useProjectsStore()
const { isPhone } = useDevice()

const loading = ref(false)
const loadError = ref<string | null>(null)
const search = ref('')
const typeFilter = ref<'all' | 'scrum' | 'kanban'>('all')
const healthFilter = ref<PortfolioHealth | 'all'>('all')

async function load() {
  loading.value = true
  loadError.value = null
  try {
    await projects.fetchProjects(true, false)
  } catch (error) {
    loadError.value = getErrorMessage(error)
    toast.error(loadError.value)
  } finally {
    loading.value = false
  }
}

onMounted(() => void load())

const rows = computed(() => {
  const term = search.value.trim().toLowerCase()
  return projects.activeProjects
    .filter((project) => {
      if (typeFilter.value !== 'all' && project.type !== typeFilter.value) return false
      const health = healthOf(project)
      if (healthFilter.value !== 'all' && health !== healthFilter.value) return false
      if (!term) return true
      return `${project.name} ${project.key} ${project.lead?.name ?? ''}`.toLowerCase().includes(term)
    })
    .slice()
    .sort((a, b) => {
      const rank: Record<PortfolioHealth, number> = { overdue: 0, at_risk: 1, on_track: 2, empty: 3, done: 4 }
      const diff = rank[healthOf(a)] - rank[healthOf(b)]
      if (diff !== 0) return diff
      return a.name.localeCompare(b.name)
    })
})

const totals = computed(() => {
  const list = projects.activeProjects
  return {
    projects: list.length,
    open: list.reduce((sum, project) => sum + (project.issueSummary?.open ?? 0), 0),
    done: list.reduce((sum, project) => sum + (project.issueSummary?.done ?? 0), 0),
    overdue: list.reduce((sum, project) => sum + (project.issueSummary?.overdue ?? 0), 0),
    atRisk: list.filter((project) => {
      const health = healthOf(project)
      return health === 'overdue' || health === 'at_risk'
    }).length,
  }
})

function summaryLine(project: Project) {
  const summary = project.issueSummary
  if (!summary?.total) return 'No tasks yet'
  const overdue = summary.overdue ?? 0
  return `${summary.open} open · ${summary.done} done${overdue ? ` · ${overdue} overdue` : ''}`
}
</script>

<template>
  <div class="flex h-full min-h-0 min-w-0 flex-col gap-3 overflow-hidden p-3 sm:gap-4 sm:p-4 lg:p-5">
    <header class="flex shrink-0 flex-col gap-2 sm:gap-3">
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0 space-y-0.5 sm:space-y-1">
          <h1 class="text-lg font-semibold tracking-tight sm:text-xl lg:text-2xl">Portfolio</h1>
          <p class="hidden text-sm text-muted-foreground sm:block">
            Health and progress across every project you can access.
          </p>
          <p class="text-xs text-muted-foreground sm:hidden">
            {{ totals.projects }} projects · {{ totals.overdue }} overdue · {{ totals.atRisk }} need attention
          </p>
        </div>
        <Button variant="outline" size="sm" :loading="loading" @click="load"><RefreshCw /></Button>
      </div>

      <div class="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <div class="relative min-w-0 flex-1 sm:max-w-xs">
          <Search class="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input v-model="search" class="pl-8" placeholder="Search projects…" aria-label="Search projects" />
        </div>
        <div class="flex flex-wrap gap-1.5">
          <Button
            v-for="option in ([
              { value: 'all', label: 'All types' },
              { value: 'scrum', label: 'Scrum' },
              { value: 'kanban', label: 'Kanban' },
            ] as const)"
            :key="option.value"
            variant="outline"
            size="sm"
            :class="typeFilter === option.value && 'bg-muted'"
            @click="typeFilter = option.value"
          >
            {{ option.label }}
          </Button>
        </div>
        <div class="flex flex-wrap gap-1.5">
          <Button
            v-for="option in ([
              { value: 'all', label: 'All health' },
              { value: 'overdue', label: 'Overdue' },
              { value: 'at_risk', label: 'At risk' },
              { value: 'on_track', label: 'On track' },
              { value: 'done', label: 'Complete' },
            ] as const)"
            :key="option.value"
            variant="outline"
            size="sm"
            :class="healthFilter === option.value && 'bg-muted'"
            @click="healthFilter = option.value"
          >
            {{ option.label }}
          </Button>
        </div>
      </div>
    </header>

    <section class="hidden shrink-0 gap-3 sm:grid sm:grid-cols-2 lg:grid-cols-4">
      <article class="rounded-xl border bg-card p-3 shadow-soft lg:p-4">
        <p class="text-sm font-medium">Projects</p>
        <p class="mt-1 text-2xl font-semibold tabular-nums">{{ totals.projects }}</p>
      </article>
      <article class="rounded-xl border bg-card p-3 shadow-soft lg:p-4">
        <p class="text-sm font-medium">Open work</p>
        <p class="mt-1 text-2xl font-semibold tabular-nums">{{ totals.open }}</p>
      </article>
      <article class="rounded-xl border bg-card p-3 shadow-soft lg:p-4">
        <p class="flex items-center gap-1.5 text-sm font-medium"><AlertTriangle class="size-3.5 text-destructive" /> Overdue</p>
        <p class="mt-1 text-2xl font-semibold tabular-nums" :class="totals.overdue ? 'text-destructive' : ''">{{ totals.overdue }}</p>
      </article>
      <article class="rounded-xl border bg-card p-3 shadow-soft lg:p-4">
        <p class="text-sm font-medium">Need attention</p>
        <p class="mt-1 text-2xl font-semibold tabular-nums">{{ totals.atRisk }}</p>
      </article>
    </section>

    <div v-if="loading && !projects.projects.length" class="grid min-h-0 flex-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      <Skeleton v-for="index in 6" :key="index" class="h-40 rounded-xl" />
    </div>

    <EmptyState
      v-else-if="loadError && !projects.projects.length"
      :icon="LayoutGrid"
      title="Portfolio did not load"
      :description="loadError"
      class="min-h-0 flex-1"
    >
      <Button @click="load">Try again</Button>
    </EmptyState>

    <EmptyState
      v-else-if="!rows.length"
      :icon="FolderKanban"
      title="No projects match"
      description="Adjust filters, or create a project to see it on the portfolio."
      class="min-h-0 flex-1"
    />

    <div v-else class="min-h-0 flex-1 overflow-y-auto overscroll-contain">
      <!-- Phone: compact cards -->
      <div v-if="isPhone" class="space-y-2 pb-2">
        <RouterLink
          v-for="project in rows"
          :key="project.id"
          :to="{ name: 'project-board', params: { projectId: project.id } }"
          class="block rounded-xl border bg-card p-3 shadow-soft"
        >
          <div class="flex items-start gap-2">
            <span class="mt-1 size-2.5 shrink-0 rounded-full" :style="{ backgroundColor: project.color }" />
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <p class="truncate text-sm font-semibold">{{ project.name }}</p>
                <span
                  class="shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium"
                  :class="PORTFOLIO_HEALTH_META[healthOf(project)].class"
                >
                  {{ PORTFOLIO_HEALTH_META[healthOf(project)].label }}
                </span>
              </div>
              <p class="mt-0.5 text-[11px] text-muted-foreground">{{ project.key }} · {{ project.type }} · {{ summaryLine(project) }}</p>
              <Progress :model-value="completionOf(project)" class="mt-2 h-1.5" />
            </div>
            <UserAvatar v-if="project.lead" :user="project.lead" size="xs" class="shrink-0" />
          </div>
        </RouterLink>
      </div>

      <!-- Tablet / desktop: richer grid -->
      <div v-else class="grid gap-3 pb-2 sm:grid-cols-2 xl:grid-cols-3">
        <RouterLink
          v-for="project in rows"
          :key="project.id"
          :to="{ name: 'project-board', params: { projectId: project.id } }"
          class="flex flex-col rounded-xl border bg-card p-4 shadow-soft transition hover:border-primary/30 hover:bg-muted/20"
        >
          <div class="flex items-start gap-3">
            <span class="mt-1 size-3 shrink-0 rounded-full" :style="{ backgroundColor: project.color }" />
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <h2 class="truncate font-semibold">{{ project.name }}</h2>
                <span class="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  {{ project.type }}
                </span>
                <span
                  class="rounded-md px-1.5 py-0.5 text-[10px] font-medium"
                  :class="PORTFOLIO_HEALTH_META[healthOf(project)].class"
                >
                  {{ PORTFOLIO_HEALTH_META[healthOf(project)].label }}
                </span>
              </div>
              <p class="mt-1 text-xs text-muted-foreground">{{ project.key }} · {{ summaryLine(project) }}</p>
            </div>
            <UserAvatar v-if="project.lead" :user="project.lead" class="shrink-0" />
          </div>

          <div class="mt-4 space-y-1.5">
            <div class="flex items-center justify-between text-xs text-muted-foreground">
              <span>Progress</span>
              <span class="tabular-nums font-medium text-foreground">{{ completionOf(project) }}%</span>
            </div>
            <Progress :model-value="completionOf(project)" class="h-2" />
          </div>

          <div class="mt-4 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
            <span class="inline-flex items-center gap-1"><CircleDashed class="size-3" /> {{ project.issueSummary?.open ?? 0 }} open</span>
            <span class="inline-flex items-center gap-1"><CheckCircle2 class="size-3" /> {{ project.issueSummary?.done ?? 0 }} done</span>
            <span
              v-if="project.issueSummary?.overdue"
              class="inline-flex items-center gap-1 text-destructive"
            >
              <AlertTriangle class="size-3" /> {{ project.issueSummary.overdue }} overdue
            </span>
            <span v-if="project.activeSprint" class="ml-auto">
              Sprint {{ project.activeSprint.name }}
              <template v-if="project.activeSprint.endDate"> · ends {{ formatDate(project.activeSprint.endDate) }}</template>
            </span>
            <span v-else class="ml-auto">{{ project.memberCount ?? 0 }} members</span>
          </div>
        </RouterLink>
      </div>
    </div>
  </div>
</template>

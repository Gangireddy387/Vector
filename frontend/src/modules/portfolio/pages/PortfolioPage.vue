<script setup lang="ts">
import { AlertTriangle, FolderKanban, LayoutGrid, RefreshCw, Search } from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'
import EmptyState from '@/components/common/EmptyState.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { useDevice } from '@/composables/useDevice'
import { getErrorMessage } from '@/lib/http'
import { toast } from 'vue-sonner'
import PortfolioProjectCard from '../components/PortfolioProjectCard.vue'
import { type PortfolioHealth } from '../lib/portfolio-health'
import { portfolioApi, type PortfolioRollup } from '../portfolio.api'

const { isPhone } = useDevice()

const loading = ref(false)
const loadError = ref<string | null>(null)
const rollup = ref<PortfolioRollup | null>(null)
const search = ref('')
const typeFilter = ref<'all' | 'scrum' | 'kanban'>('all')
const healthFilter = ref<PortfolioHealth | 'all'>('all')
const includeArchived = ref(false)

async function load() {
  loading.value = true
  loadError.value = null
  try {
    rollup.value = await portfolioApi.rollup({ includeArchived: includeArchived.value })
  } catch (error) {
    loadError.value = getErrorMessage(error)
    toast.error(loadError.value)
  } finally {
    loading.value = false
  }
}

onMounted(() => void load())

const projects = computed(() => rollup.value?.projects ?? [])

const rows = computed(() => {
  const term = search.value.trim().toLowerCase()
  return projects.value
    .filter((project) => {
      if (typeFilter.value !== 'all' && project.type !== typeFilter.value) return false
      if (healthFilter.value !== 'all' && project.health !== healthFilter.value) return false
      if (!term) return true
      return `${project.name} ${project.key} ${project.lead?.name ?? ''}`.toLowerCase().includes(term)
    })
    .slice()
    .sort((a, b) => {
      const rank: Record<PortfolioHealth, number> = { overdue: 0, at_risk: 1, on_track: 2, empty: 3, done: 4 }
      const diff = rank[a.health] - rank[b.health]
      if (diff !== 0) return diff
      return a.name.localeCompare(b.name)
    })
})

const totals = computed(() => {
  if (!rollup.value) {
    return { projects: 0, open: 0, done: 0, overdue: 0, atRisk: 0, todo: 0, inProgress: 0 }
  }
  return rollup.value.totals
})

</script>

<template>
  <div class="flex h-full min-h-0 min-w-0 flex-col gap-3 overflow-hidden p-3 sm:gap-4 sm:p-4 lg:p-5">
    <header class="flex shrink-0 flex-col gap-2 sm:gap-3">
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0 space-y-0.5 sm:space-y-1">
          <h1 class="text-lg font-semibold tracking-tight sm:text-xl lg:text-2xl">Portfolio</h1>
          <p class="hidden text-sm text-muted-foreground sm:block">
            Health, status mix, and sprint progress across every project you can access.
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
        <Button
          variant="outline"
          size="sm"
          :class="includeArchived && 'bg-muted'"
          :aria-pressed="includeArchived"
          @click="includeArchived = !includeArchived; load()"
        >
          {{ includeArchived ? 'Hide archived' : 'Show archived' }}
        </Button>
      </div>
    </header>

    <section class="hidden shrink-0 gap-3 sm:grid sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
      <article class="rounded-xl border bg-card p-3 shadow-soft lg:p-4">
        <p class="text-sm font-medium">Projects</p>
        <p class="mt-1 text-2xl font-semibold tabular-nums">{{ totals.projects }}</p>
      </article>
      <article class="rounded-xl border bg-card p-3 shadow-soft lg:p-4">
        <p class="text-sm font-medium">Open work</p>
        <p class="mt-1 text-2xl font-semibold tabular-nums">{{ totals.open }}</p>
        <p class="mt-0.5 text-[11px] text-muted-foreground">{{ totals.todo }} todo · {{ totals.inProgress }} in progress</p>
      </article>
      <article class="rounded-xl border bg-card p-3 shadow-soft lg:p-4">
        <p class="text-sm font-medium">Done</p>
        <p class="mt-1 text-2xl font-semibold tabular-nums">{{ totals.done }}</p>
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

    <div v-if="loading && !projects.length" class="grid min-h-0 flex-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      <Skeleton v-for="index in 6" :key="index" class="h-44 rounded-xl" />
    </div>

    <EmptyState
      v-else-if="loadError && !projects.length"
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
      <div v-if="isPhone" class="space-y-2 pb-2">
        <PortfolioProjectCard
          v-for="project in rows"
          :key="project.id"
          :project="project"
          compact
        />
      </div>
      <div v-else class="grid gap-3 pb-2 sm:grid-cols-2 xl:grid-cols-3">
        <PortfolioProjectCard v-for="project in rows" :key="project.id" :project="project" />
      </div>
    </div>
  </div>
</template>

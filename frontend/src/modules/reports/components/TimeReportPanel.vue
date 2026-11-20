<script setup lang="ts">
import { Clock3, RefreshCw } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import EmptyState from '@/components/common/EmptyState.vue'
import UserAvatar from '@/components/common/UserAvatar.vue'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDate } from '@/lib/format'
import { getErrorMessage } from '@/lib/http'
import { formatMinutes } from '@/lib/utils'
import { useOpenIssue } from '@/modules/issues/composables/useOpenIssue'
import { useProjectsStore } from '@/modules/projects/projects.store'
import { type TimeReport, reportsApi } from '../reports.api'
import { type Period, presetRange } from '../period'
import PeriodPicker from './PeriodPicker.vue'
import ReportKpiCard from './ReportKpiCard.vue'

const props = defineProps<{ lockedProjectId?: string }>()

const projects = useProjectsStore()
const openIssue = useOpenIssue()

const period = ref<Period>(presetRange('this_month'))
const report = ref<TimeReport | null>(null)
const loading = ref(false)
const loadError = ref<string | null>(null)

const projectOptions = computed(() =>
  projects.activeProjects.map((project) => ({ id: project.id, label: `${project.key} · ${project.name}` })),
)
const selectedProjectId = ref(props.lockedProjectId ?? '')

watch(
  () => props.lockedProjectId,
  (id) => {
    if (id) selectedProjectId.value = id
  },
)

async function load() {
  loading.value = true
  loadError.value = null
  try {
    report.value = await reportsApi.time({
      ...period.value,
      projectId: selectedProjectId.value || props.lockedProjectId || undefined,
    })
  } catch (error) {
    loadError.value = getErrorMessage(error)
    toast.error(loadError.value)
  } finally {
    loading.value = false
  }
}

watch([period, selectedProjectId], load, { immediate: true, deep: true })

const peakDay = computed(() => {
  if (!report.value?.byDay.length) return null
  return report.value.byDay.reduce((best, row) => (row.minutes > best.minutes ? row : best), report.value.byDay[0]!)
})
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center gap-2">
      <PeriodPicker v-model="period" />
      <select
        v-if="!lockedProjectId"
        v-model="selectedProjectId"
        class="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
        aria-label="Project filter"
      >
        <option value="">All projects</option>
        <option v-for="project in projectOptions" :key="project.id" :value="project.id">{{ project.label }}</option>
      </select>
      <Button variant="outline" size="sm" :loading="loading" @click="load"><RefreshCw /></Button>
    </div>

    <div v-if="loading && !report" class="grid gap-3 sm:grid-cols-3">
      <Skeleton v-for="index in 3" :key="index" class="h-24 rounded-xl" />
    </div>

    <EmptyState
      v-else-if="loadError && !report"
      :icon="Clock3"
      title="Time report did not load"
      :description="loadError"
    >
      <Button @click="load">Try again</Button>
    </EmptyState>

    <template v-else-if="report">
      <div class="grid gap-3 sm:grid-cols-3">
        <ReportKpiCard
          label="Time logged"
          :value="formatMinutes(report.totals.minutes)"
          explanation="Sum of work logs in this period"
          :icon="Clock3"
        />
        <ReportKpiCard
          label="Entries"
          :value="report.totals.entries"
          explanation="Individual work log rows"
          :icon="Clock3"
        />
        <ReportKpiCard
          label="Busiest day"
          :value="peakDay && peakDay.minutes ? formatDate(peakDay.date, 'd MMM') : '—'"
          :explanation="peakDay && peakDay.minutes ? formatMinutes(peakDay.minutes) : 'No logged time yet'"
          :icon="Clock3"
        />
      </div>

      <EmptyState
        v-if="!report.totals.entries"
        :icon="Clock3"
        title="No time logged in this period"
        description="Start a timer on an issue or log time manually to see rollups here."
        class="py-10"
      />

      <div v-else class="grid gap-4 lg:grid-cols-2">
        <article class="space-y-2 rounded-xl border bg-card p-3 shadow-soft sm:p-4">
          <h3 class="text-sm font-semibold">By person</h3>
          <ul class="divide-y divide-border/60">
            <li v-for="row in report.byUser" :key="row.user?.id ?? 'unknown'" class="flex items-center gap-2 py-2 text-sm">
              <UserAvatar :user="row.user" size="sm" />
              <span class="min-w-0 flex-1 truncate">{{ row.user?.name ?? 'Unknown' }}</span>
              <span class="font-medium tabular-nums">{{ formatMinutes(row.minutes) }}</span>
            </li>
          </ul>
        </article>

        <article class="space-y-2 rounded-xl border bg-card p-3 shadow-soft sm:p-4">
          <h3 class="text-sm font-semibold">By project</h3>
          <ul class="divide-y divide-border/60">
            <li v-for="row in report.byProject" :key="row.project.id" class="flex items-center gap-2 py-2 text-sm">
              <span class="size-2.5 rounded-full" :style="{ backgroundColor: row.project.color }" />
              <span class="min-w-0 flex-1 truncate">{{ row.project.key }} · {{ row.project.name }}</span>
              <span class="font-medium tabular-nums">{{ formatMinutes(row.minutes) }}</span>
            </li>
          </ul>
        </article>

        <article class="space-y-2 rounded-xl border bg-card p-3 shadow-soft sm:p-4 lg:col-span-2">
          <h3 class="text-sm font-semibold">By issue</h3>
          <ul class="divide-y divide-border/60">
            <li v-for="row in report.byIssue" :key="row.issue.id">
              <button
                type="button"
                class="flex w-full items-center gap-2 py-2 text-left text-sm hover:bg-muted/40"
                @click="openIssue({ key: row.issue.key })"
              >
                <span class="font-mono text-[11px] text-muted-foreground">{{ row.issue.key }}</span>
                <span class="min-w-0 flex-1 truncate">{{ row.issue.title }}</span>
                <span class="text-xs text-muted-foreground">{{ row.entries }}×</span>
                <span class="font-medium tabular-nums">{{ formatMinutes(row.minutes) }}</span>
              </button>
            </li>
          </ul>
        </article>
      </div>
    </template>
  </div>
</template>

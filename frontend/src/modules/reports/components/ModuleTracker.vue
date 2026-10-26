<script setup lang="ts">
import { ArrowDownUp, Boxes, ChevronRight, CircleAlert, CircleCheck, Clock, Layers } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import EmptyState from '@/components/common/EmptyState.vue'
import UserAvatar from '@/components/common/UserAvatar.vue'
import UserAvatarStack from '@/components/common/UserAvatarStack.vue'
import { SelectField, type SelectFieldOption } from '@/components/forms'
import { describeDue, formatDate } from '@/lib/format'
import type { ModuleHealth, ModuleProgress, ModulesReport } from '../reports.api'
import ContributorList from './ContributorList.vue'
import ReportKpiCard from './ReportKpiCard.vue'

const props = defineProps<{ report: ModulesReport }>()

const HEALTH_META: Record<ModuleHealth, { label: string; tone: string; rank: number }> = {
  overdue: { label: 'Overdue', tone: 'bg-destructive/10 text-destructive border-destructive/30', rank: 0 },
  at_risk: { label: 'At risk', tone: 'bg-warning/15 text-amber-700 border-warning/40 dark:text-warning', rank: 1 },
  on_track: { label: 'On track', tone: 'bg-success/12 text-success border-success/30', rank: 2 },
  not_started: { label: 'Not started', tone: 'bg-muted text-muted-foreground border-border', rank: 3 },
  empty: { label: 'No work yet', tone: 'bg-muted text-muted-foreground border-border', rank: 4 },
  done: { label: 'Done', tone: 'bg-primary/10 text-primary border-primary/30', rank: 5 },
}

type SortKey = 'health' | 'progress' | 'due' | 'size'
const sort = ref<SortKey>('health')
const SORT_OPTIONS: SelectFieldOption[] = [
  { value: 'health', label: 'Needs attention first', icon: ArrowDownUp },
  { value: 'progress', label: 'Least progress first', icon: ArrowDownUp },
  { value: 'due', label: 'Due date', icon: ArrowDownUp },
  { value: 'size', label: 'Largest first', icon: ArrowDownUp },
]

const sorted = computed(() => {
  const list = [...props.report.modules]
  const byDue = (a: ModuleProgress, b: ModuleProgress) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999')
  if (sort.value === 'progress') return list.sort((a, b) => a.completion - b.completion || byDue(a, b))
  if (sort.value === 'due') return list.sort(byDue)
  if (sort.value === 'size') return list.sort((a, b) => b.total - a.total)
  return list.sort((a, b) => HEALTH_META[a.health].rank - HEALTH_META[b.health].rank || byDue(a, b))
})

const expanded = ref(new Set<string>())
function toggle(id: string) {
  const next = new Set(expanded.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  expanded.value = next
}

const onTrack = computed(() => props.report.modules.filter((module) => module.health === 'on_track').length)
const width = (part: number, whole: number) => `${whole ? (part / whole) * 100 : 0}%`
</script>

<template>
  <div class="space-y-4">
    <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <ReportKpiCard label="Modules" :value="report.totals.modules" :icon="Boxes" explanation="Epics in this project. Each one groups the work for one feature or area." />
      <ReportKpiCard label="Delivered" :value="report.totals.done" :icon="CircleCheck" tone="success" explanation="Modules with every issue done." />
      <ReportKpiCard label="On track" :value="onTrack" :icon="Clock" tone="info" explanation="Moving and not at risk of missing their due date." />
      <ReportKpiCard
        label="Need attention"
        :value="report.totals.atRisk + report.totals.overdue"
        :icon="CircleAlert"
        :tone="report.totals.atRisk + report.totals.overdue ? 'danger' : 'default'"
        :explanation="`${report.totals.overdue} past the due date · ${report.totals.atRisk} due within a week with little done.`"
      />
    </div>

    <EmptyState
      v-if="!report.modules.length"
      :icon="Layers"
      title="No modules yet"
      description="Create an epic for each feature or area, then link stories and tasks to it. Each epic is tracked here from its first task to delivery."
      class="border bg-card py-12"
    />

    <section v-else class="border border-border/70 bg-card shadow-soft">
      <header class="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
        <div>
          <h2 class="text-sm font-semibold">Modules</h2>
          <p class="text-xs text-muted-foreground">Progress counts every story, task, bug and sub-task under the epic. Expand a module to see who worked on it.</p>
        </div>
        <SelectField v-model="sort" :options="SORT_OPTIONS" size="sm" class="w-52" aria-label="Sort modules" />
      </header>

      <ul class="divide-y">
        <li v-for="module in sorted" :key="module.id">
          <div
            role="button"
            tabindex="0"
            class="grid gap-x-4 gap-y-2 px-4 py-3 transition-colors hover:bg-accent/40 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1.4fr)_minmax(0,1fr)_auto] lg:items-center"
            :aria-expanded="expanded.has(module.id)"
            @click="toggle(module.id)"
            @keydown.enter.prevent="toggle(module.id)"
            @keydown.space.prevent="toggle(module.id)"
          >
            <div class="flex min-w-0 items-center gap-2.5">
              <ChevronRight class="size-4 shrink-0 text-muted-foreground transition-transform" :class="expanded.has(module.id) && 'rotate-90'" />
              <div class="min-w-0">
                <p class="flex min-w-0 items-center gap-2">
                  <RouterLink
                    :to="{ name: 'issue', params: { issueKey: module.key } }"
                    class="shrink-0 font-mono text-xs text-muted-foreground hover:text-foreground hover:underline"
                    @click.stop
                  >
                    {{ module.key }}
                  </RouterLink>
                  <span class="truncate text-sm font-medium">{{ module.title }}</span>
                </p>
                <p class="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                  <span v-if="module.startedAt">Started {{ formatDate(module.startedAt, 'd MMM yyyy') }}</span>
                  <span v-if="module.finishedAt">· Finished {{ formatDate(module.finishedAt, 'd MMM yyyy') }}</span>
                  <span v-else-if="module.dueDate" :class="module.health === 'overdue' && 'font-medium text-destructive'">· {{ describeDue(module.dueDate) }}</span>
                </p>
              </div>
            </div>

            <div class="space-y-1.5">
              <div class="flex h-2 bg-muted" :aria-label="`${module.completion}% complete`">
                <span class="h-full bg-success transition-[width] duration-500" :style="{ width: width(module.done, module.total) }" />
                <span class="h-full bg-primary/45 transition-[width] duration-500" :style="{ width: width(module.inProgress, module.total) }" />
              </div>
              <p class="flex justify-between gap-2 text-xs text-muted-foreground tabular-nums">
                <span><span class="font-semibold text-foreground">{{ module.completion }}%</span> · {{ module.done }}/{{ module.total }} tasks</span>
                <span v-if="module.points">{{ module.donePoints }}/{{ module.points }} pts</span>
              </p>
            </div>

            <div class="flex items-center gap-3">
              <span v-if="module.owner" class="flex min-w-0 items-center gap-1.5 text-xs" :title="`Owner: ${module.owner.name}`">
                <UserAvatar :user="module.owner" size="xs" />
                <span class="truncate">{{ module.owner.name }}</span>
              </span>
              <UserAvatarStack v-if="module.contributors.length" :users="module.contributors.map((row) => row.user)" :max="4" />
            </div>

            <div class="flex items-center gap-2 lg:justify-end">
              <span v-if="module.overdue && module.health !== 'overdue'" class="text-xs font-medium text-destructive">{{ module.overdue }} overdue</span>
              <span class="inline-flex border px-2 py-0.5 text-xs font-semibold whitespace-nowrap" :class="HEALTH_META[module.health].tone">
                {{ HEALTH_META[module.health].label }}
              </span>
            </div>
          </div>

          <div v-if="expanded.has(module.id)" class="grid gap-4 border-t bg-muted/25 px-4 py-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:pl-11">
            <div>
              <h3 class="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Who worked on it</h3>
              <ContributorList :contributors="module.contributors" />
            </div>
            <dl class="grid grid-cols-2 content-start gap-x-4 gap-y-2 text-sm">
              <div><dt class="text-xs text-muted-foreground">To do</dt><dd class="font-semibold tabular-nums">{{ module.todo }}</dd></div>
              <div><dt class="text-xs text-muted-foreground">In progress</dt><dd class="font-semibold tabular-nums">{{ module.inProgress }}</dd></div>
              <div><dt class="text-xs text-muted-foreground">Done</dt><dd class="font-semibold tabular-nums">{{ module.done }}</dd></div>
              <div><dt class="text-xs text-muted-foreground">Overdue</dt><dd class="font-semibold tabular-nums" :class="module.overdue ? 'text-destructive' : ''">{{ module.overdue }}</dd></div>
              <div><dt class="text-xs text-muted-foreground">Due</dt><dd class="font-semibold">{{ module.dueDate ? formatDate(module.dueDate, 'd MMM yyyy') : 'No due date' }}</dd></div>
              <div><dt class="text-xs text-muted-foreground">Epic status</dt><dd class="font-semibold">{{ module.status?.name ?? '—' }}</dd></div>
            </dl>
          </div>
        </li>

        <li v-if="report.unplanned" class="bg-muted/15">
          <div
            role="button"
            tabindex="0"
            class="grid gap-x-4 gap-y-2 px-4 py-3 transition-colors hover:bg-accent/40 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1.4fr)_minmax(0,1fr)_auto] lg:items-center"
            :aria-expanded="expanded.has('unplanned')"
            @click="toggle('unplanned')"
            @keydown.enter.prevent="toggle('unplanned')"
            @keydown.space.prevent="toggle('unplanned')"
          >
            <div class="flex min-w-0 items-center gap-2.5">
              <ChevronRight class="size-4 shrink-0 text-muted-foreground transition-transform" :class="expanded.has('unplanned') && 'rotate-90'" />
              <div class="min-w-0">
                <p class="text-sm font-medium">Not in a module</p>
                <p class="text-xs text-muted-foreground">Tasks that are not linked to any epic</p>
              </div>
            </div>
            <div class="space-y-1.5">
              <div class="flex h-2 bg-muted">
                <span class="h-full bg-success" :style="{ width: width(report.unplanned.done, report.unplanned.total) }" />
                <span class="h-full bg-primary/45" :style="{ width: width(report.unplanned.inProgress, report.unplanned.total) }" />
              </div>
              <p class="text-xs text-muted-foreground tabular-nums">
                <span class="font-semibold text-foreground">{{ report.unplanned.completion }}%</span> · {{ report.unplanned.done }}/{{ report.unplanned.total }} tasks
              </p>
            </div>
            <UserAvatarStack v-if="report.unplanned.contributors.length" :users="report.unplanned.contributors.map((row) => row.user)" :max="4" />
          </div>
          <div v-if="expanded.has('unplanned')" class="border-t bg-muted/25 px-4 py-4 lg:pl-11">
            <ContributorList :contributors="report.unplanned.contributors" />
          </div>
        </li>
      </ul>
    </section>
  </div>
</template>

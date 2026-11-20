<script setup lang="ts">
import { AlertTriangle, CheckCircle2, CircleDashed, TrendingUp } from 'lucide-vue-next'
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import UserAvatar from '@/components/common/UserAvatar.vue'
import { Button } from '@/components/ui/button'
import { formatDate } from '@/lib/format'
import { useAuthStore } from '@/modules/auth/auth.store'
import { PORTFOLIO_HEALTH_META } from '../lib/portfolio-health'
import type { PortfolioProject } from '../portfolio.api'

const props = defineProps<{
  project: PortfolioProject
  compact?: boolean
}>()

const auth = useAuthStore()
const hasReports = computed(() => auth.hasFeature('reports'))

const segments = computed(() => {
  const { todo, inProgress, done, total } = props.project.issues
  if (!total) return []
  return [
    { key: 'todo', count: todo, class: 'bg-slate-400/80' },
    { key: 'in_progress', count: inProgress, class: 'bg-sky-500' },
    { key: 'done', count: done, class: 'bg-emerald-500' },
  ].filter((segment) => segment.count > 0)
})

function widthOf(count: number) {
  const total = props.project.issues.total || 1
  return `${Math.max((count / total) * 100, count ? 4 : 0)}%`
}
</script>

<template>
  <article
    class="flex flex-col rounded-xl border bg-card shadow-soft transition hover:border-primary/30 hover:bg-muted/20"
    :class="compact ? 'p-3' : 'p-4'"
  >
    <div class="flex items-start gap-2" :class="compact ? '' : 'gap-3'">
      <span
        class="mt-1 shrink-0 rounded-full"
        :class="compact ? 'size-2.5' : 'size-3'"
        :style="{ backgroundColor: project.color }"
      />
      <div class="min-w-0 flex-1">
        <div class="flex flex-wrap items-center gap-2">
          <RouterLink
            :to="{ name: 'project-board', params: { projectId: project.id } }"
            class="truncate font-semibold hover:underline"
            :class="compact ? 'text-sm' : ''"
          >
            {{ project.name }}
          </RouterLink>
          <span
            v-if="!compact"
            class="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
          >
            {{ project.type }}
          </span>
          <span
            class="shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium"
            :class="PORTFOLIO_HEALTH_META[project.health].class"
          >
            {{ PORTFOLIO_HEALTH_META[project.health].label }}
          </span>
        </div>
        <p class="mt-0.5 text-[11px] text-muted-foreground" :class="compact ? '' : 'mt-1 text-xs'">
          {{ project.key }}
          <template v-if="compact"> · {{ project.type }}</template>
          · {{ project.issues.open }} open · {{ project.issues.done }} done
          <template v-if="project.issues.overdue"> · {{ project.issues.overdue }} overdue</template>
        </p>
      </div>
      <div v-if="project.members.preview.length" class="flex shrink-0 -space-x-1.5">
        <UserAvatar
          v-for="user in project.members.preview.slice(0, compact ? 2 : 4)"
          :key="user.id"
          :user="user"
          size="xs"
          show-tooltip
          class="ring-2 ring-card"
        />
      </div>
      <UserAvatar v-else-if="project.lead" :user="project.lead" size="xs" class="shrink-0" />
    </div>

    <div class="mt-3 space-y-1.5" :class="compact ? 'mt-2' : 'mt-4'">
      <div class="flex items-center justify-between text-xs text-muted-foreground">
        <span>Progress</span>
        <span class="tabular-nums font-medium text-foreground">{{ project.progressPercent }}%</span>
      </div>
      <div class="flex h-2 overflow-hidden rounded-full bg-muted">
        <div
          v-for="segment in segments"
          :key="segment.key"
          class="h-full"
          :class="segment.class"
          :style="{ width: widthOf(segment.count) }"
          :title="`${segment.key.replace('_', ' ')}: ${segment.count}`"
        />
      </div>
      <div v-if="!compact" class="flex flex-wrap gap-3 text-[11px] text-muted-foreground">
        <span class="inline-flex items-center gap-1"><CircleDashed class="size-3" /> {{ project.issues.todo }} todo</span>
        <span class="inline-flex items-center gap-1 text-sky-600 dark:text-sky-400">{{ project.issues.inProgress }} in progress</span>
        <span class="inline-flex items-center gap-1"><CheckCircle2 class="size-3" /> {{ project.issues.done }} done</span>
        <span v-if="project.issues.overdue" class="inline-flex items-center gap-1 text-destructive">
          <AlertTriangle class="size-3" /> {{ project.issues.overdue }} overdue
        </span>
      </div>
    </div>

    <div
      class="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground"
      :class="compact ? 'mt-2' : 'mt-4'"
    >
      <template v-if="project.activeSprint">
        <span class="min-w-0 truncate">
          Sprint {{ project.activeSprint.name }}
          <template v-if="project.activeSprint.endDate"> · ends {{ formatDate(project.activeSprint.endDate) }}</template>
        </span>
        <span class="tabular-nums font-medium text-foreground">{{ project.activeSprint.progressPercent }}%</span>
        <div class="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
          <div class="h-full bg-primary" :style="{ width: `${project.activeSprint.progressPercent}%` }" />
        </div>
      </template>
      <span v-else>{{ project.members.count }} members</span>

      <div v-if="!compact" class="ml-auto flex gap-1">
        <Button variant="ghost" size="sm" class="h-7 px-2 text-xs" as-child>
          <RouterLink :to="{ name: 'project-board', params: { projectId: project.id } }">Board</RouterLink>
        </Button>
        <Button v-if="hasReports" variant="ghost" size="sm" class="h-7 px-2 text-xs" as-child>
          <RouterLink :to="{ name: 'project-progress', params: { projectId: project.id } }">
            <TrendingUp class="size-3.5" />
            Progress
          </RouterLink>
        </Button>
      </div>
    </div>
  </article>
</template>

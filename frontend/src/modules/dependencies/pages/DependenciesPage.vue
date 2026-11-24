<script setup lang="ts">
import { AlertTriangle, GitBranch, Link2, RefreshCw, Route } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { toast } from 'vue-sonner'
import EmptyState from '@/components/common/EmptyState.vue'
import IssueTypeIcon from '@/components/common/IssueTypeIcon.vue'
import PageFrame from '@/components/common/PageFrame.vue'
import PriorityIcon from '@/components/common/PriorityIcon.vue'
import UserAvatar from '@/components/common/UserAvatar.vue'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { getErrorMessage } from '@/lib/http'
import { useSocketEvents } from '@/lib/socket-events'
import { dependenciesApi, type DependencyNode, type ProjectDependencies } from '../dependencies.api'
import DependencyGraph from '../components/DependencyGraph.vue'

const route = useRoute()
const projectId = computed(() => route.params.projectId as string)

const data = ref<ProjectDependencies | null>(null)
const loading = ref(false)
const showDone = ref(false)

const visibleNodes = computed(() => {
  const nodes = data.value?.nodes ?? []
  return showDone.value ? nodes : nodes.filter((node) => !node.done)
})

const visibleEdges = computed(() => {
  const ids = new Set(visibleNodes.value.map((node) => node.id))
  return (data.value?.edges ?? []).filter((edge) => ids.has(edge.from) && ids.has(edge.to))
})

async function load() {
  const id = projectId.value
  if (!id) return
  loading.value = true
  try {
    data.value = await dependenciesApi.forProject(id)
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    loading.value = false
  }
}

watch(projectId, load, { immediate: true })
useSocketEvents({
  'issue:changed': (payload: { projectId?: string }) => {
    if (payload.projectId === projectId.value) void load()
  },
})

function formatEffort(minutes: number) {
  if (minutes < 60) return `${minutes}m`
  const hours = Math.round((minutes / 60) * 10) / 10
  if (hours < 16) return `${hours}h`
  return `${Math.round((minutes / 480) * 10) / 10}d`
}

const focusId = computed(() => (typeof route.query.focus === 'string' ? route.query.focus : null))

function nodeById(id: string): DependencyNode | undefined {
  return data.value?.nodes.find((node) => node.id === id)
}
</script>

<template>
  <PageFrame mode="bare" pad="compact" class="flex h-full min-h-0 flex-col gap-4 overflow-auto">
    <header class="relative flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div
        class="pointer-events-none absolute -inset-x-4 -top-4 h-24 opacity-90"
        style="background: radial-gradient(70% 120% at 6% 0%, color-mix(in oklch, var(--primary) 12%, transparent), transparent 65%)"
        aria-hidden="true"
      />
      <div class="relative min-w-0 space-y-1">
        <p class="text-[11px] font-medium text-muted-foreground sm:text-xs">
          <span class="text-brand font-semibold">Graph</span>
          <span class="mx-1.5 text-border">·</span>
          Who blocks whom
        </p>
        <h1 class="text-xl font-semibold tracking-tight sm:text-2xl">Dependencies</h1>
        <p class="max-w-2xl text-sm text-muted-foreground">
          Readable block links, what is waiting now, and the critical path — the longest unfinished chain of
          <span class="font-medium text-foreground">blocks</span> links.
        </p>
      </div>
      <div class="relative flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" :aria-pressed="showDone" @click="showDone = !showDone">
          {{ showDone ? 'Hide done' : 'Show done' }}
        </Button>
        <Button
          v-if="data?.stats.blockLinks"
          variant="outline"
          size="sm"
          as-child
        >
          <RouterLink :to="{ name: 'project-roadmap', params: { projectId } }">Open roadmap</RouterLink>
        </Button>
        <Button variant="outline" size="sm" :loading="loading" @click="load"><RefreshCw /> Refresh</Button>
      </div>
    </header>

    <div v-if="!data && loading" class="space-y-4">
      <div class="flex gap-2 overflow-hidden rounded-xl border border-border/70 bg-card/70 px-3 py-2.5">
        <Skeleton v-for="index in 3" :key="index" class="h-8 flex-1 rounded-md" />
      </div>
      <div class="overflow-hidden rounded-xl border border-border/80 bg-card p-4">
        <div class="flex gap-10">
          <div v-for="col in 3" :key="col" class="flex w-56 shrink-0 flex-col gap-2.5 sm:w-64">
            <Skeleton class="h-3 w-24" />
            <Skeleton v-for="row in 3" :key="row" class="h-[4.5rem] w-full rounded-[10px]" />
          </div>
        </div>
      </div>
    </div>

    <template v-else-if="data">
      <section
        class="flex shrink-0 flex-wrap items-center gap-x-1 gap-y-2 overflow-x-auto rounded-xl border border-border/70 bg-card/70 px-3 py-2.5 shadow-soft backdrop-blur-sm"
        aria-label="Dependency summary"
      >
        <div class="flex items-center gap-2 pr-3">
          <Link2 class="size-3.5 text-primary" />
          <span class="text-lg font-semibold tabular-nums tracking-tight">{{ data.stats.blockLinks }}</span>
          <span class="text-xs text-muted-foreground">block links</span>
        </div>
        <div class="h-4 w-px shrink-0 bg-border/80" />
        <div class="flex items-center gap-2 px-3">
          <GitBranch class="size-3.5 text-primary" />
          <span
            class="text-lg font-semibold tabular-nums tracking-tight"
            :class="data.stats.openBlocked ? 'text-warning' : ''"
          >
            {{ data.stats.openBlocked }}
          </span>
          <span class="text-xs text-muted-foreground">waiting now</span>
        </div>
        <div class="h-4 w-px shrink-0 bg-border/80" />
        <div class="flex items-center gap-2 px-3">
          <Route class="size-3.5 text-primary" />
          <span class="text-lg font-semibold tabular-nums tracking-tight">{{ data.stats.criticalPathLength || '—' }}</span>
          <span class="text-xs text-muted-foreground">
            <template v-if="data.criticalPath.lengthMinutes">critical · ~{{ formatEffort(data.criticalPath.lengthMinutes) }}</template>
            <template v-else>critical path</template>
          </span>
        </div>
        <p class="ml-auto hidden text-xs text-muted-foreground lg:block">
          {{ data.stats.linkedIssues }} tasks in the graph
        </p>
      </section>

      <div
        v-if="data.cycles.length"
        class="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive"
      >
        <AlertTriangle class="mt-0.5 size-4 shrink-0" />
        <div>
          <p class="font-medium">Circular blocks detected</p>
          <p class="text-xs text-destructive/90">
            {{ data.cycles.length }} cycle{{ data.cycles.length === 1 ? '' : 's' }} — dashed red links on the graph.
            Fix these or the critical path may be incomplete.
          </p>
        </div>
      </div>

      <EmptyState
        v-if="!data.stats.blockLinks"
        title="No block links yet"
        description="On a task, add a “blocks” link to another task. Relates-to and duplicates stay on the task detail; this view is for scheduling dependencies."
        class="rounded-xl border border-dashed py-16"
      >
        <Button variant="outline" as-child>
          <RouterLink :to="{ name: 'project-board', params: { projectId } }">Open board</RouterLink>
        </Button>
      </EmptyState>

      <template v-else>
        <section v-if="data.criticalPath.issues.length" class="space-y-2">
          <div class="flex items-end justify-between gap-2">
            <h2 class="text-sm font-semibold">Critical path</h2>
            <p class="text-xs text-muted-foreground">Longest unfinished chain · hover graph links to trace</p>
          </div>
          <ol class="flex flex-col gap-2 lg:flex-row lg:flex-wrap lg:items-stretch">
            <li
              v-for="(step, index) in data.criticalPath.issues"
              :key="step.id"
              class="flex min-w-0 items-stretch gap-2 lg:max-w-xs lg:flex-1"
            >
              <RouterLink
                :to="{ name: 'issue', params: { issueKey: step.key } }"
                class="group relative flex min-w-0 flex-1 flex-col gap-1 overflow-hidden rounded-xl border border-primary/30 bg-primary/[0.06] px-3 py-2.5 text-sm shadow-soft transition-colors hover:border-primary/50 hover:bg-primary/[0.09]"
              >
                <span class="absolute inset-y-2 left-0 w-[3px] rounded-full bg-primary" aria-hidden="true" />
                <span class="flex items-center gap-1.5 pl-1.5 text-xs font-medium text-primary">
                  <span class="flex size-4 items-center justify-center rounded-full bg-primary/15 text-[10px] font-semibold tabular-nums">
                    {{ index + 1 }}
                  </span>
                  {{ step.key }}
                </span>
                <span class="line-clamp-2 pl-1.5 font-medium">{{ step.title }}</span>
                <span class="pl-1.5 text-xs text-muted-foreground">~{{ formatEffort(step.effortMinutes) }}</span>
              </RouterLink>
              <span
                v-if="index < data.criticalPath.issues.length - 1"
                class="hidden items-center text-primary/50 lg:flex"
                aria-hidden="true"
              >
                →
              </span>
              <span
                v-if="index < data.criticalPath.issues.length - 1"
                class="flex items-center justify-center text-primary/50 lg:hidden"
                aria-hidden="true"
              >
                ↓
              </span>
            </li>
          </ol>
        </section>

        <section class="min-h-0 space-y-2">
          <div class="flex flex-wrap items-end justify-between gap-2">
            <h2 class="text-sm font-semibold">Dependency graph</h2>
            <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
              <span class="inline-flex items-center gap-1.5">
                <span class="h-px w-4 bg-muted-foreground/50" /> Blocks
              </span>
              <span class="inline-flex items-center gap-1.5">
                <span class="h-px w-4 bg-primary" /> Critical
              </span>
              <span v-if="data.cycles.length" class="inline-flex items-center gap-1.5">
                <span class="h-px w-4 border-t border-dashed border-destructive/70" /> Cycle
              </span>
              <span class="hidden sm:inline">Hover a card or link to focus its chain</span>
            </div>
          </div>
          <DependencyGraph
            :nodes="visibleNodes"
            :edges="visibleEdges"
            :focus-id="focusId"
            :cycles="data.cycles"
          />
        </section>

        <section v-if="data.blockedNow.length" class="space-y-2">
          <h2 class="text-sm font-semibold">Blocked now</h2>
          <ul class="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/80 bg-card shadow-soft">
            <li
              v-for="item in data.blockedNow"
              :key="item.id"
              class="flex flex-col gap-2 px-3 py-2.5 transition-colors hover:bg-muted/20 sm:flex-row sm:items-center sm:gap-3"
            >
              <RouterLink
                :to="{ name: 'issue', params: { issueKey: item.key } }"
                class="flex min-w-0 flex-1 items-center gap-2 text-sm hover:underline"
              >
                <span class="h-8 w-[3px] shrink-0 rounded-full bg-warning" aria-hidden="true" />
                <IssueTypeIcon v-if="nodeById(item.id)" :type="nodeById(item.id)!.type" />
                <PriorityIcon v-if="nodeById(item.id)" :priority="nodeById(item.id)!.priority" class="size-3.5" />
                <span class="font-mono text-xs text-muted-foreground">{{ item.key }}</span>
                <span class="truncate font-medium">{{ item.title }}</span>
              </RouterLink>
              <div class="flex flex-wrap items-center gap-1.5 pl-2 text-xs text-muted-foreground sm:pl-0">
                <span class="font-medium text-warning">waiting on</span>
                <RouterLink
                  v-for="blocker in item.waitingOn"
                  :key="blocker.id"
                  :to="{ name: 'issue', params: { issueKey: blocker.key } }"
                  class="inline-flex items-center gap-1 rounded-md border border-warning/30 bg-warning/10 px-1.5 py-0.5 font-medium text-foreground transition-colors hover:border-warning/50"
                  :title="blocker.title"
                >
                  {{ blocker.key }}
                </RouterLink>
                <UserAvatar v-if="nodeById(item.id)?.assignee" :user="nodeById(item.id)!.assignee!" size="xs" class="ml-1" />
              </div>
            </li>
          </ul>
        </section>
      </template>
    </template>
  </PageFrame>
</template>

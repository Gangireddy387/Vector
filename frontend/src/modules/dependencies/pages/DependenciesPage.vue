<script setup lang="ts">
import { AlertTriangle, GitBranch, Link2, RefreshCw, Route } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { toast } from 'vue-sonner'
import EmptyState from '@/components/common/EmptyState.vue'
import IssueTypeIcon from '@/components/common/IssueTypeIcon.vue'
import PriorityIcon from '@/components/common/PriorityIcon.vue'
import UserAvatar from '@/components/common/UserAvatar.vue'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { getErrorMessage } from '@/lib/http'
import { useSocketEvents } from '@/lib/socket-events'
import { dependenciesApi, type DependencyNode, type ProjectDependencies } from '../dependencies.api'
import DependencyGraph from '../components/DependencyGraph.vue'

const props = defineProps<{ projectId: string }>()
const route = useRoute()

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
  loading.value = true
  try {
    data.value = await dependenciesApi.forProject(props.projectId)
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    loading.value = false
  }
}

watch(() => props.projectId, load, { immediate: true })
useSocketEvents({ 'issue:changed': (payload: { projectId?: string }) => {
  if (payload.projectId === props.projectId) void load()
} })

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
  <div class="flex h-full min-h-0 flex-col gap-4 overflow-auto p-3 sm:p-4 lg:p-5">
    <header class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div class="min-w-0 space-y-1">
        <h1 class="text-xl font-semibold tracking-tight sm:text-2xl">Dependencies</h1>
        <p class="max-w-2xl text-sm text-muted-foreground">
          Who blocks whom, what is waiting, and the critical path — the longest unfinished chain of
          <span class="font-medium text-foreground">blocks</span> links.
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" :aria-pressed="showDone" @click="showDone = !showDone">
          {{ showDone ? 'Hide done' : 'Show done' }}
        </Button>
        <Button variant="outline" size="sm" :loading="loading" @click="load"><RefreshCw /> Refresh</Button>
      </div>
    </header>

    <div v-if="!data && loading" class="grid gap-3 sm:grid-cols-3">
      <Skeleton v-for="index in 3" :key="index" class="h-24 rounded-xl" />
    </div>

    <template v-else-if="data">
      <section class="grid gap-3 sm:grid-cols-3">
        <article class="rounded-xl border border-border/80 bg-card p-4 shadow-soft">
          <div class="flex items-center gap-2 text-sm font-medium"><Link2 class="size-4 text-primary" /> Block links</div>
          <p class="mt-2 text-2xl font-semibold tabular-nums">{{ data.stats.blockLinks }}</p>
          <p class="text-xs text-muted-foreground">{{ data.stats.linkedIssues }} tasks in the graph</p>
        </article>
        <article class="rounded-xl border border-border/80 bg-card p-4 shadow-soft">
          <div class="flex items-center gap-2 text-sm font-medium"><GitBranch class="size-4 text-primary" /> Waiting now</div>
          <p class="mt-2 text-2xl font-semibold tabular-nums" :class="data.stats.openBlocked ? 'text-warning' : ''">
            {{ data.stats.openBlocked }}
          </p>
          <p class="text-xs text-muted-foreground">Open tasks blocked by unfinished work</p>
        </article>
        <article class="rounded-xl border border-border/80 bg-card p-4 shadow-soft">
          <div class="flex items-center gap-2 text-sm font-medium"><Route class="size-4 text-primary" /> Critical path</div>
          <p class="mt-2 text-2xl font-semibold tabular-nums">{{ data.stats.criticalPathLength || '—' }}</p>
          <p class="text-xs text-muted-foreground">
            <template v-if="data.criticalPath.lengthMinutes">~{{ formatEffort(data.criticalPath.lengthMinutes) }} of open effort</template>
            <template v-else>No unfinished chain yet</template>
          </p>
        </article>
      </section>

      <div
        v-if="data.cycles.length"
        class="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive"
      >
        <AlertTriangle class="mt-0.5 size-4 shrink-0" />
        <div>
          <p class="font-medium">Circular blocks detected</p>
          <p class="text-xs text-destructive/90">
            {{ data.cycles.length }} cycle{{ data.cycles.length === 1 ? '' : 's' }} — fix these links or the critical path may be incomplete.
          </p>
        </div>
      </div>

      <EmptyState
        v-if="!data.stats.blockLinks"
        title="No block links yet"
        description="On a task, add a “blocks” link to another task. Relates-to and duplicates stay on the task detail; this view is for scheduling dependencies."
        class="rounded-xl border border-dashed py-16"
      />

      <template v-else>
        <section v-if="data.criticalPath.issues.length" class="space-y-2">
          <h2 class="text-sm font-semibold">Critical path</h2>
          <ol class="flex flex-col gap-2 lg:flex-row lg:flex-wrap lg:items-stretch">
            <li
              v-for="(step, index) in data.criticalPath.issues"
              :key="step.id"
              class="flex min-w-0 items-stretch gap-2 lg:max-w-xs lg:flex-1"
            >
              <RouterLink
                :to="{ name: 'issue', params: { issueKey: step.key } }"
                class="flex min-w-0 flex-1 flex-col gap-1 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2.5 text-sm transition-colors hover:border-primary/50"
              >
                <span class="text-xs font-medium text-primary">{{ step.key }}</span>
                <span class="line-clamp-2 font-medium">{{ step.title }}</span>
                <span class="text-xs text-muted-foreground">~{{ formatEffort(step.effortMinutes) }}</span>
              </RouterLink>
              <span v-if="index < data.criticalPath.issues.length - 1" class="hidden items-center text-muted-foreground lg:flex" aria-hidden="true">→</span>
              <span v-if="index < data.criticalPath.issues.length - 1" class="flex items-center justify-center text-muted-foreground lg:hidden" aria-hidden="true">↓</span>
            </li>
          </ol>
        </section>

        <section class="min-h-0 space-y-2">
          <h2 class="text-sm font-semibold">Dependency graph</h2>
          <DependencyGraph :nodes="visibleNodes" :edges="visibleEdges" :focus-id="focusId" />
        </section>

        <section v-if="data.blockedNow.length" class="space-y-2">
          <h2 class="text-sm font-semibold">Blocked now</h2>
          <ul class="divide-y overflow-hidden rounded-xl border border-border/80 bg-card">
            <li v-for="item in data.blockedNow" :key="item.id" class="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:gap-3">
              <RouterLink :to="{ name: 'issue', params: { issueKey: item.key } }" class="flex min-w-0 flex-1 items-center gap-2 text-sm hover:underline">
                <IssueTypeIcon v-if="nodeById(item.id)" :type="nodeById(item.id)!.type" />
                <PriorityIcon v-if="nodeById(item.id)" :priority="nodeById(item.id)!.priority" class="size-3.5" />
                <span class="text-xs text-muted-foreground">{{ item.key }}</span>
                <span class="truncate font-medium">{{ item.title }}</span>
              </RouterLink>
              <div class="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                <span>waiting on</span>
                <RouterLink
                  v-for="blocker in item.waitingOn"
                  :key="blocker.id"
                  :to="{ name: 'issue', params: { issueKey: blocker.key } }"
                  class="inline-flex rounded-md border border-border/70 bg-muted/40 px-1.5 py-0.5 font-medium text-foreground hover:border-primary/40"
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
  </div>
</template>

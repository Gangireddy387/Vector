<script setup lang="ts">
import { CircleCheck } from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import AppLogo from '@/components/layout/AppLogo.vue'
import DueDateBadge from '@/components/common/DueDateBadge.vue'
import IssueTypeIcon from '@/components/common/IssueTypeIcon.vue'
import LabelChip from '@/components/common/LabelChip.vue'
import PriorityIcon from '@/components/common/PriorityIcon.vue'
import UserAvatar from '@/components/common/UserAvatar.vue'
import { Skeleton } from '@/components/ui/skeleton'
import { assetUrl, getErrorMessage } from '@/lib/http'
import { sharesApi, type PublicSharePayload } from '../shares.api'

const props = defineProps<{ token: string }>()

const data = ref<PublicSharePayload | null>(null)
const problem = ref<string | null>(null)
const isLoading = ref(true)

const orgLogo = computed(() => assetUrl(data.value?.organization.logoUrl))
const totalIssues = computed(() => data.value?.columns?.reduce((sum, column) => sum + column.issues.length, 0) ?? 0)

onMounted(async () => {
  try {
    data.value = await sharesApi.publicShare(props.token)
  } catch (error) {
    problem.value = getErrorMessage(error, 'This share link does not work.')
  } finally {
    isLoading.value = false
  }
})
</script>

<template>
  <div class="min-h-dvh bg-[radial-gradient(1200px_600px_at_10%_-10%,oklch(0.92_0.04_250),transparent),radial-gradient(900px_500px_at_90%_0%,oklch(0.93_0.03_180),transparent)] bg-background text-foreground">
    <header class="sticky top-0 z-10 border-b border-border/60 bg-background/80 backdrop-blur-md">
      <div class="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:px-6">
        <AppLogo compact />
        <div v-if="data" class="min-w-0 flex-1">
          <p class="truncate text-sm font-semibold">
            <span class="inline-block size-2.5 rounded-full align-middle" :style="{ backgroundColor: data.project.color }" />
            {{ data.project.name }}
            <span class="font-normal text-muted-foreground">· {{ data.project.key }}</span>
          </p>
          <p class="truncate text-xs text-muted-foreground">
            Shared by {{ data.organization.name }}
            <template v-if="data.scope === 'board' && data.sprint"> · {{ data.sprint.name }}</template>
            · Read-only
          </p>
        </div>
        <RouterLink to="/login" class="text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">Sign in</RouterLink>
      </div>
    </header>

    <main class="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <div v-if="isLoading" class="space-y-4">
        <Skeleton class="h-8 w-64" />
        <div class="flex gap-3 overflow-hidden">
          <Skeleton v-for="n in 4" :key="n" class="h-72 w-64 shrink-0" />
        </div>
      </div>

      <div v-else-if="problem" class="mx-auto max-w-md space-y-3 py-16 text-center">
        <p class="text-lg font-semibold">Link unavailable</p>
        <p class="text-sm text-muted-foreground">{{ problem }}</p>
        <RouterLink to="/login" class="inline-block text-sm font-medium underline-offset-2 hover:underline">Go to Vector</RouterLink>
      </div>

      <template v-else-if="data?.scope === 'board' && data.columns">
        <p class="mb-4 text-sm text-muted-foreground">{{ totalIssues }} {{ totalIssues === 1 ? 'task' : 'tasks' }} on this board</p>
        <div class="flex gap-3 overflow-x-auto pb-4">
          <section v-for="column in data.columns" :key="column.status.id" class="flex w-72 shrink-0 flex-col gap-2">
            <header class="flex items-center gap-2 px-1">
              <span class="size-2.5 rounded-full" :style="{ backgroundColor: column.status.color }" />
              <h2 class="text-sm font-semibold">{{ column.status.name }}</h2>
              <span class="text-xs text-muted-foreground tabular-nums">{{ column.issues.length }}</span>
            </header>
            <div class="flex flex-col gap-2 rounded-xl bg-muted/40 p-2 min-h-24">
              <article
                v-for="issue in column.issues"
                :key="issue.id"
                class="rounded-lg border border-border bg-card px-3 py-2.5 shadow-sm"
              >
                <div class="mb-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <IssueTypeIcon :type="issue.type" />
                  <span class="font-medium tabular-nums">{{ issue.key }}</span>
                  <PriorityIcon class="ml-auto" :priority="issue.priority" />
                </div>
                <p class="text-[13px] leading-snug font-medium">{{ issue.title }}</p>
                <div v-if="issue.labels.length" class="mt-2 flex flex-wrap gap-1">
                  <LabelChip v-for="label in issue.labels.slice(0, 3)" :key="label.id" :label="label" />
                </div>
                <div class="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
                  <DueDateBadge v-if="issue.dueDate" :due-date="issue.dueDate" :done="issue.status?.category === 'done'" compact />
                  <UserAvatar v-if="issue.assignee" class="ml-auto" :user="issue.assignee" size="sm" show-tooltip />
                </div>
              </article>
              <p v-if="!column.issues.length" class="px-2 py-6 text-center text-xs text-muted-foreground">No tasks</p>
            </div>
          </section>
        </div>
      </template>

      <template v-else-if="data?.scope === 'issue' && data.issue">
        <article class="mx-auto max-w-2xl space-y-5 rounded-2xl border border-border/70 bg-card/90 p-5 shadow-sm sm:p-7">
          <div class="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <IssueTypeIcon :type="data.issue.type" />
            <span class="font-semibold text-foreground tabular-nums">{{ data.issue.key }}</span>
            <span
              class="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium"
              :style="{ backgroundColor: `${data.issue.status?.color ?? '#888'}22`, color: data.issue.status?.color }"
            >
              {{ data.issue.status?.name }}
            </span>
            <PriorityIcon :priority="data.issue.priority" />
          </div>
          <h1 class="text-2xl font-semibold tracking-tight text-balance">{{ data.issue.title }}</h1>
          <div class="flex flex-wrap gap-4 text-sm text-muted-foreground">
            <span v-if="data.issue.assignee" class="inline-flex items-center gap-2">
              <UserAvatar :user="data.issue.assignee" size="sm" />
              {{ data.issue.assignee.name }}
            </span>
            <DueDateBadge v-if="data.issue.dueDate" :due-date="data.issue.dueDate" :done="data.issue.status?.category === 'done'" />
            <span v-if="data.issue.sprint">{{ data.issue.sprint.name }}</span>
          </div>
          <div v-if="data.issue.labels.length" class="flex flex-wrap gap-1.5">
            <LabelChip v-for="label in data.issue.labels" :key="label.id" :label="label" />
          </div>
          <div v-if="data.issue.description" class="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap text-foreground/90">
            {{ data.issue.description }}
          </div>
          <p v-else class="text-sm text-muted-foreground">No description</p>

          <section v-if="data.issue.subtasks.length" class="space-y-2 border-t border-border/60 pt-4">
            <h2 class="text-sm font-semibold">Sub-tasks</h2>
            <ul class="space-y-1.5">
              <li
                v-for="subtask in data.issue.subtasks"
                :key="subtask.id"
                class="flex items-center gap-2 rounded-lg border border-border/50 px-3 py-2 text-sm"
              >
                <CircleCheck v-if="subtask.status?.category === 'done'" class="size-4 text-success" />
                <IssueTypeIcon v-else :type="subtask.type" />
                <span class="text-xs text-muted-foreground tabular-nums">{{ subtask.key }}</span>
                <span class="min-w-0 flex-1 truncate" :class="subtask.status?.category === 'done' && 'text-muted-foreground line-through'">{{ subtask.title }}</span>
                <span class="text-xs text-muted-foreground">{{ subtask.status?.name }}</span>
              </li>
            </ul>
          </section>
        </article>
      </template>

      <footer v-if="data" class="mx-auto mt-10 flex max-w-2xl items-center justify-center gap-2 text-xs text-muted-foreground">
        <img v-if="orgLogo" :src="orgLogo" alt="" class="size-5 rounded object-cover" />
        <span>Shared from {{ data.organization.name }} · Powered by Vector</span>
      </footer>
    </main>
  </div>
</template>

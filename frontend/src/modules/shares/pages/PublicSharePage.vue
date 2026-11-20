<script setup lang="ts">
import { CircleCheck, Lock, MessageSquare } from 'lucide-vue-next'
import { computed, onMounted, reactive, ref } from 'vue'
import { RouterLink } from 'vue-router'
import AppLogo from '@/components/layout/AppLogo.vue'
import DueDateBadge from '@/components/common/DueDateBadge.vue'
import FormField from '@/components/common/FormField.vue'
import IssueTypeIcon from '@/components/common/IssueTypeIcon.vue'
import LabelChip from '@/components/common/LabelChip.vue'
import PriorityIcon from '@/components/common/PriorityIcon.vue'
import UserAvatar from '@/components/common/UserAvatar.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { assetUrl, getErrorMessage } from '@/lib/http'
import { timeAgo } from '@/lib/format'
import {
  sharesApi,
  type PublicShareComment,
  type PublicSharePayload,
} from '../shares.api'

const props = defineProps<{ token: string }>()

const data = ref<PublicSharePayload | null>(null)
const problem = ref<string | null>(null)
const isLoading = ref(true)
const unlockPassword = ref('')
const unlockError = ref('')
const isUnlocking = ref(false)
const isCommenting = ref(false)
const commentError = ref('')
const comments = ref<PublicShareComment[]>([])
const draft = reactive({
  name: '',
  body: '',
  company: '',
})

const orgLogo = computed(() => assetUrl(data.value?.organization.logoUrl))
const totalIssues = computed(() => data.value?.columns?.reduce((sum, column) => sum + column.issues.length, 0) ?? 0)
const isLocked = computed(() => Boolean(data.value?.locked))
const accessLabel = computed(() => {
  if (!data.value || isLocked.value) return ''
  if (data.value.guestCommentsEnabled) return 'Comments welcome'
  return 'Read-only'
})

function rememberGuestName(name: string) {
  try {
    localStorage.setItem('vector.shareGuestName', name)
  } catch {
    // ignore
  }
}

function loadGuestName() {
  try {
    draft.name = localStorage.getItem('vector.shareGuestName') ?? ''
  } catch {
    draft.name = ''
  }
}

function applyPayload(payload: PublicSharePayload) {
  data.value = payload
  comments.value = payload.comments ?? []
  problem.value = null
}

onMounted(async () => {
  loadGuestName()
  try {
    applyPayload(await sharesApi.publicShare(props.token))
  } catch (error) {
    problem.value = getErrorMessage(error, 'This share link does not work.')
  } finally {
    isLoading.value = false
  }
})

async function unlock() {
  unlockError.value = ''
  isUnlocking.value = true
  try {
    applyPayload(await sharesApi.unlockShare(props.token, unlockPassword.value))
    unlockPassword.value = ''
  } catch (error) {
    unlockError.value = getErrorMessage(error, 'Incorrect password')
  } finally {
    isUnlocking.value = false
  }
}

async function submitComment() {
  if (!data.value?.guestCommentsEnabled) return
  commentError.value = ''
  isCommenting.value = true
  try {
    const created = await sharesApi.submitGuestComment(props.token, {
      name: draft.name.trim(),
      body: draft.body.trim(),
      company: draft.company,
    })
    comments.value = [...comments.value, created]
    rememberGuestName(draft.name.trim())
    draft.body = ''
  } catch (error) {
    commentError.value = getErrorMessage(error)
  } finally {
    isCommenting.value = false
  }
}
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
            <template v-if="accessLabel"> · {{ accessLabel }}</template>
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

      <div v-else-if="isLocked && data" class="mx-auto max-w-sm space-y-4 py-12">
        <div class="space-y-2 text-center">
          <span class="mx-auto flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary"><Lock class="size-5" /></span>
          <p class="text-lg font-semibold">Password required</p>
          <p class="text-sm text-muted-foreground">
            {{ data.organization.name }} protected this {{ data.scope === 'board' ? 'board' : 'task' }}. Enter the password to continue.
          </p>
        </div>
        <form class="space-y-3" @submit.prevent="unlock">
          <FormField label="Password" for="share-password">
            <Input id="share-password" v-model="unlockPassword" type="password" autocomplete="current-password" required class="h-10" />
          </FormField>
          <p v-if="unlockError" class="text-sm text-destructive">{{ unlockError }}</p>
          <Button type="submit" class="w-full" :disabled="isUnlocking || !unlockPassword">{{ isUnlocking ? 'Unlocking…' : 'Unlock' }}</Button>
        </form>
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
            <div class="flex min-h-24 flex-col gap-2 rounded-xl bg-muted/40 p-2">
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

          <section v-if="data.guestCommentsEnabled" class="space-y-4 border-t border-border/60 pt-5">
            <h2 class="flex items-center gap-2 text-sm font-semibold">
              <MessageSquare class="size-4 text-muted-foreground" />
              Comments
              <span class="text-xs font-normal text-muted-foreground tabular-nums">({{ comments.length }})</span>
            </h2>
            <ul v-if="comments.length" class="space-y-3">
              <li v-for="comment in comments" :key="comment.id" class="rounded-lg border border-border/50 bg-muted/20 px-3 py-2.5">
                <p class="flex flex-wrap items-baseline gap-x-2 text-sm">
                  <span class="font-medium">{{ comment.authorName }}</span>
                  <span v-if="comment.isGuest" class="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Guest</span>
                  <span class="text-xs text-muted-foreground">{{ timeAgo(comment.createdAt) }}</span>
                </p>
                <p class="mt-1 whitespace-pre-wrap text-sm text-foreground/90">{{ comment.body }}</p>
              </li>
            </ul>
            <p v-else class="text-sm text-muted-foreground">No comments yet — be the first.</p>
            <form class="space-y-3" @submit.prevent="submitComment">
              <FormField label="Your name" for="guest-name">
                <Input id="guest-name" v-model="draft.name" required minlength="2" maxlength="80" class="h-9" autocomplete="name" />
              </FormField>
              <FormField label="Comment" for="guest-body">
                <Textarea id="guest-body" v-model="draft.body" required rows="3" maxlength="10000" class="min-h-20 resize-y" />
              </FormField>
              <input v-model="draft.company" type="text" tabindex="-1" autocomplete="off" aria-hidden="true" class="pointer-events-none absolute -left-[9999px] h-0 w-0 opacity-0" />
              <p v-if="commentError" class="text-sm text-destructive">{{ commentError }}</p>
              <Button type="submit" size="sm" :disabled="isCommenting || !draft.name.trim() || !draft.body.trim()">
                {{ isCommenting ? 'Posting…' : 'Post comment' }}
              </Button>
            </form>
          </section>
        </article>
      </template>

      <footer v-if="data && !isLocked" class="mx-auto mt-10 flex max-w-2xl items-center justify-center gap-2 text-xs text-muted-foreground">
        <img v-if="orgLogo" :src="orgLogo" alt="" class="size-5 rounded object-cover" />
        <span>Shared from {{ data.organization.name }} · Powered by Vector</span>
      </footer>
    </main>
  </div>
</template>

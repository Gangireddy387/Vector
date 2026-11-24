<script setup lang="ts">
import { CircleCheck, MessageSquare } from 'lucide-vue-next'
import { reactive, ref, watch } from 'vue'
import DueDateBadge from '@/components/common/DueDateBadge.vue'
import FormField from '@/components/common/FormField.vue'
import IssueTypeIcon from '@/components/common/IssueTypeIcon.vue'
import LabelChip from '@/components/common/LabelChip.vue'
import PriorityIcon from '@/components/common/PriorityIcon.vue'
import UserAvatar from '@/components/common/UserAvatar.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { timeAgo } from '@/lib/format'
import { getErrorMessage } from '@/lib/http'
import {
  sharesApi,
  type PublicShareComment,
  type PublicSharePayload,
} from '../shares.api'

const props = defineProps<{
  token: string
  issue: NonNullable<PublicSharePayload['issue']>
  guestCommentsEnabled?: boolean
  comments?: PublicShareComment[]
}>()

const localComments = ref<PublicShareComment[]>([...(props.comments ?? [])])
const isCommenting = ref(false)
const commentError = ref('')
const draft = reactive({
  name: '',
  body: '',
  company: '',
})

watch(
  () => props.comments,
  (next) => {
    localComments.value = [...(next ?? [])]
  },
)

try {
  draft.name = localStorage.getItem('vector.shareGuestName') ?? ''
} catch {
  draft.name = ''
}

async function submitComment() {
  if (!props.guestCommentsEnabled) return
  commentError.value = ''
  isCommenting.value = true
  try {
    const created = await sharesApi.submitGuestComment(props.token, {
      name: draft.name.trim(),
      body: draft.body.trim(),
      company: draft.company,
    })
    localComments.value = [...localComments.value, created]
    try {
      localStorage.setItem('vector.shareGuestName', draft.name.trim())
    } catch {
      // ignore
    }
    draft.body = ''
  } catch (error) {
    commentError.value = getErrorMessage(error)
  } finally {
    isCommenting.value = false
  }
}
</script>

<template>
  <article class="space-y-6">
    <header class="space-y-3">
      <div class="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <IssueTypeIcon :type="issue.type" />
        <span class="font-mono text-xs font-semibold text-foreground tabular-nums sm:text-sm">{{ issue.key }}</span>
        <span
          class="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-semibold"
          :style="{ backgroundColor: `${issue.status?.color ?? '#888'}18`, color: issue.status?.color }"
        >
          <span class="size-1.5 rounded-full" :style="{ backgroundColor: issue.status?.color }" />
          {{ issue.status?.name }}
        </span>
        <PriorityIcon :priority="issue.priority" />
      </div>

      <h1 class="text-balance text-xl font-semibold tracking-tight sm:text-2xl lg:text-[1.65rem] lg:leading-snug">
        {{ issue.title }}
      </h1>

      <div class="flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground">
        <span v-if="issue.assignee" class="inline-flex items-center gap-2">
          <UserAvatar :user="{ ...issue.assignee, email: '' }" size="sm" />
          {{ issue.assignee.name }}
        </span>
        <span v-if="issue.reporter">Reporter · {{ issue.reporter.name }}</span>
        <DueDateBadge v-if="issue.dueDate" :due-date="issue.dueDate" :done="issue.status?.category === 'done'" />
        <span v-if="issue.sprint">{{ issue.sprint.name }}</span>
        <span v-if="issue.storyPoints != null" class="tabular-nums">{{ issue.storyPoints }} pts</span>
      </div>

      <div v-if="issue.labels.length" class="flex flex-wrap gap-1.5">
        <LabelChip v-for="label in issue.labels" :key="label.id" :label="label" />
      </div>
    </header>

    <section v-if="issue.description" class="rounded-xl border border-border/60 bg-muted/20 px-4 py-4 sm:px-5">
      <h2 class="mb-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Description</h2>
      <div class="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap text-foreground/90">
        {{ issue.description }}
      </div>
    </section>
    <p
      v-else
      class="rounded-xl border border-dashed border-border/70 bg-muted/15 px-4 py-5 text-sm text-muted-foreground"
    >
      No description
    </p>

    <section v-if="issue.subtasks.length" class="space-y-2.5">
      <h2 class="text-sm font-semibold">Sub-tasks</h2>
      <ul class="space-y-1.5">
        <li
          v-for="subtask in issue.subtasks"
          :key="subtask.id"
          class="flex items-center gap-2 rounded-lg border border-border/60 bg-card px-3 py-2 text-sm shadow-soft"
        >
          <CircleCheck v-if="subtask.status?.category === 'done'" class="size-4 shrink-0 text-success" />
          <IssueTypeIcon v-else :type="subtask.type" class="shrink-0" />
          <span class="font-mono text-[11px] text-muted-foreground tabular-nums">{{ subtask.key }}</span>
          <span
            class="min-w-0 flex-1 truncate"
            :class="subtask.status?.category === 'done' && 'text-muted-foreground line-through'"
          >
            {{ subtask.title }}
          </span>
          <span class="shrink-0 text-xs text-muted-foreground">{{ subtask.status?.name }}</span>
        </li>
      </ul>
    </section>

    <section v-if="guestCommentsEnabled" class="space-y-4 border-t border-border/60 pt-5">
      <h2 class="flex items-center gap-2 text-sm font-semibold">
        <MessageSquare class="size-4 text-muted-foreground" />
        Comments
        <span class="text-xs font-normal text-muted-foreground tabular-nums">({{ localComments.length }})</span>
      </h2>
      <ul v-if="localComments.length" class="space-y-3">
        <li
          v-for="comment in localComments"
          :key="comment.id"
          class="rounded-xl border border-border/60 bg-muted/15 px-3.5 py-3"
        >
          <p class="flex flex-wrap items-baseline gap-x-2 text-sm">
            <span class="font-medium">{{ comment.authorName }}</span>
            <span
              v-if="comment.isGuest"
              class="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-muted-foreground uppercase"
            >
              Guest
            </span>
            <span class="text-xs text-muted-foreground">{{ timeAgo(comment.createdAt) }}</span>
          </p>
          <p class="mt-1.5 whitespace-pre-wrap text-sm text-foreground/90">{{ comment.body }}</p>
        </li>
      </ul>
      <p v-else class="text-sm text-muted-foreground">No comments yet — be the first.</p>
      <form class="space-y-3 rounded-xl border border-border/60 bg-card p-3.5 shadow-soft sm:p-4" @submit.prevent="submitComment">
        <FormField label="Your name" for="guest-name">
          <Input id="guest-name" v-model="draft.name" required minlength="2" maxlength="80" class="h-9" autocomplete="name" />
        </FormField>
        <FormField label="Comment" for="guest-body">
          <Textarea id="guest-body" v-model="draft.body" required rows="3" maxlength="10000" class="min-h-20 resize-y" />
        </FormField>
        <input
          v-model="draft.company"
          type="text"
          tabindex="-1"
          autocomplete="off"
          aria-hidden="true"
          class="pointer-events-none absolute -left-[9999px] h-0 w-0 opacity-0"
        />
        <p v-if="commentError" class="text-sm text-destructive">{{ commentError }}</p>
        <Button type="submit" size="sm" :disabled="isCommenting || !draft.name.trim() || !draft.body.trim()">
          {{ isCommenting ? 'Posting…' : 'Post comment' }}
        </Button>
      </form>
    </section>
  </article>
</template>

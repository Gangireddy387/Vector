<script setup lang="ts">
import { CircleCheck, CircleHelp, Combine, MessageSquareReply, Send, Sparkles, ThumbsUp, Trash2, Undo2 } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { toast } from 'vue-sonner'
import UserAvatar from '@/components/common/UserAvatar.vue'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { getErrorMessage } from '@/lib/http'
import { timeAgo } from '@/lib/format'
import type { UserSummary } from '@/types/models'
import type { MeetingQuestion } from '../meetings.api'
import { useMeetingCall } from '../useMeetingCall'

/**
 * Questions for the host (town halls, all-hands): during the call (no `questions` given) anyone asks and upvotes,
 * the host marks them answered, with a written answer when they like; afterwards (`questions` given) they are shown
 * as they ended up. With the AI assistant, a question like an open one is pointed out before it is posted, and the
 * host can merge similar questions and get answers drafted.
 */
const props = withDefaults(defineProps<{ questions?: MeetingQuestion[] | null }>(), { questions: null })
const call = useMeetingCall()
const live = computed(() => props.questions === null)
const draft = ref('')
const isAsking = ref(false)
const isMerging = ref(false)
const view = ref<'open' | 'answered'>('open')
/** An open question like the one being asked (the asker can upvote it or ask anyway). */
const similar = ref<MeetingQuestion | null>(null)
/** The answer being written for a question (by the host). */
const answering = ref<{ id: string; text: string; drafting: boolean } | null>(null)

const all = computed(() => props.questions ?? call.questions.value)
const sorted = computed(() =>
  all.value
    .filter((question) => (view.value === 'open' ? !question.answeredAt : question.answeredAt))
    .sort((a, b) => b.votes - a.votes || a.createdAt.localeCompare(b.createdAt)),
)
const counts = computed(() => ({ open: all.value.filter((question) => !question.answeredAt).length, answered: all.value.filter((question) => question.answeredAt).length }))
const me = computed(() => call.selfUser.value?.id ?? null)
const canManage = computed(() => live.value && call.canManage.value)
const aiHelps = computed(() => live.value && call.aiAvailable.value)
const authorOf = (question: MeetingQuestion): UserSummary => ({
  id: question.author.id,
  name: question.author.name,
  email: '',
  avatarColor: question.author.avatarColor ?? '#64748b',
  avatarUrl: question.author.avatarUrl ?? null,
})

async function run(action: () => Promise<unknown>) {
  try {
    await action()
  } catch (error) {
    toast.error(getErrorMessage(error))
  }
}

async function ask(force = false) {
  const text = draft.value.trim()
  if (!text) return
  isAsking.value = true
  await run(async () => {
    const result = await call.askQuestion(text, force)
    if (result.similar) {
      similar.value = result.similar
      return
    }
    similar.value = null
    draft.value = ''
    view.value = 'open'
  })
  isAsking.value = false
}

async function upvoteSimilar() {
  const question = similar.value
  if (!question) return
  if (question.author.id !== me.value && !question.voters.includes(me.value ?? '')) await run(() => call.upvoteQuestion(question.id))
  toast.success('Your vote was added to that question')
  similar.value = null
  draft.value = ''
}

async function merge() {
  isMerging.value = true
  await run(async () => {
    const merged = await call.mergeQuestions()
    toast.success(merged ? `Merged ${merged} similar ${merged === 1 ? 'question' : 'questions'}` : 'No similar questions to merge')
  })
  isMerging.value = false
}

async function startAnswer(question: MeetingQuestion, withAi: boolean) {
  answering.value = { id: question.id, text: question.answer ?? '', drafting: withAi }
  if (!withAi) return
  try {
    const text = await call.draftAnswer(question.id)
    if (answering.value?.id === question.id) answering.value = { id: question.id, text, drafting: false }
  } catch (error) {
    toast.error(getErrorMessage(error))
    if (answering.value?.id === question.id) answering.value = { ...answering.value, drafting: false }
  }
}

async function publish() {
  const current = answering.value
  if (!current) return
  await run(async () => {
    await call.answerQuestion(current.id, true, current.text.trim())
    answering.value = null
  })
}
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <div class="flex shrink-0 items-center gap-1 border-b border-border/70 p-2" role="tablist" aria-label="Questions">
      <button
        v-for="item in (['open', 'answered'] as const)"
        :key="item"
        type="button"
        role="tab"
        class="flex-1 rounded-md px-2 py-1 text-xs font-medium transition-colors"
        :class="view === item ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'"
        :aria-selected="view === item"
        @click="view = item"
      >
        {{ item === 'open' ? 'Open' : 'Answered' }} · {{ counts[item] }}
      </button>
      <Button v-if="canManage && aiHelps && counts.open > 1" variant="ghost" size="sm" class="h-7 shrink-0 text-xs" :loading="isMerging" title="Merge questions that ask the same thing" @click="merge">
        <Combine /> Group similar
      </Button>
    </div>
    <ol class="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
      <li v-for="question in sorted" :key="question.id" class="group border border-border/70 bg-card p-2.5">
        <div class="flex gap-2.5">
          <button
            type="button"
            class="flex w-10 shrink-0 flex-col items-center justify-center gap-0.5 rounded-md border text-xs font-semibold transition-colors disabled:cursor-default"
            :class="me && question.voters.includes(me) ? 'border-primary bg-primary/10 text-primary' : 'border-border/70 text-muted-foreground hover:text-foreground'"
            :disabled="!live || question.author.id === me"
            :aria-label="me && question.voters.includes(me) ? 'Take back your vote' : 'Upvote this question'"
            :title="question.author.id === me ? 'Your question' : 'Upvote'"
            @click="run(() => call.upvoteQuestion(question.id))"
          >
            <ThumbsUp class="size-3.5" /> <span class="tabular-nums">{{ question.votes }}</span>
          </button>
          <div class="min-w-0 flex-1">
            <p class="text-sm break-words whitespace-pre-wrap">{{ question.text }}</p>
            <p class="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <UserAvatar :user="authorOf(question)" size="xs" />
              <span class="truncate">{{ question.author.id === me ? 'You' : question.author.name }}{{ question.author.guest ? ' (guest)' : '' }}</span>
              <span>· {{ timeAgo(question.createdAt) }}</span>
              <span v-if="question.answeredAt" class="inline-flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400"><CircleCheck class="size-3" /> Answered</span>
            </p>
          </div>
          <div v-if="live && (canManage || question.author.id === me)" class="flex shrink-0 flex-col gap-1 opacity-70 transition-opacity group-hover:opacity-100">
            <Button
              v-if="canManage"
              variant="ghost"
              size="icon-sm"
              :aria-label="question.answeredAt ? 'Mark as not answered' : 'Mark as answered'"
              :title="question.answeredAt ? 'Back to open' : 'Mark answered'"
              @click="run(() => call.answerQuestion(question.id, !question.answeredAt))"
            >
              <Undo2 v-if="question.answeredAt" /><CircleCheck v-else />
            </Button>
            <Button v-if="canManage" variant="ghost" size="icon-sm" aria-label="Write an answer" title="Write an answer" @click="startAnswer(question, false)">
              <MessageSquareReply />
            </Button>
            <Button v-if="canManage && aiHelps" variant="ghost" size="icon-sm" aria-label="Draft an answer with AI" title="Draft an answer with AI" @click="startAnswer(question, true)">
              <Sparkles />
            </Button>
            <Button variant="ghost" size="icon-sm" class="hover:text-destructive" aria-label="Remove the question" title="Remove" @click="run(() => call.removeQuestion(question.id))">
              <Trash2 />
            </Button>
          </div>
        </div>
        <p v-if="question.answer && answering?.id !== question.id" class="mt-2 border-l-2 border-emerald-500/60 bg-emerald-500/5 px-2.5 py-1.5 text-sm whitespace-pre-wrap">
          {{ question.answer }}
        </p>
        <form v-if="answering?.id === question.id" class="mt-2 space-y-1.5" @submit.prevent="publish">
          <Textarea
            v-model="answering.text"
            rows="3"
            maxlength="2000"
            :placeholder="answering.drafting ? 'The assistant is drafting an answer…' : 'Write the answer everyone will see…'"
            :disabled="answering.drafting"
            class="resize-none text-sm"
          />
          <div class="flex items-center gap-2">
            <span v-if="answering.drafting" class="text-[11px] text-muted-foreground">Drafting from what was said and shared…</span>
            <span v-else-if="aiHelps" class="text-[11px] text-muted-foreground">Check a drafted answer before publishing it.</span>
            <Button type="button" variant="ghost" size="sm" class="ml-auto h-7" @click="answering = null">Cancel</Button>
            <Button type="submit" size="sm" variant="brand" class="h-7" :disabled="answering.drafting || !answering.text.trim()">Publish answer</Button>
          </div>
        </form>
      </li>
      <li v-if="!sorted.length" class="flex flex-col items-center gap-2 px-4 py-10 text-center text-sm text-muted-foreground">
        <CircleHelp class="size-8 text-muted-foreground/60" />
        {{
          view === 'answered'
            ? 'Questions the host answers move here.'
            : live
              ? 'Ask the host something. Everyone can upvote, so the most wanted questions come first.'
              : 'Nobody asked a question in this meeting.'
        }}
      </li>
    </ol>
    <div v-if="similar" class="shrink-0 space-y-2 border-t border-amber-500/40 bg-amber-500/5 p-3 text-sm">
      <p class="text-xs font-medium text-amber-700 dark:text-amber-300">Someone asked something similar:</p>
      <p class="border-l-2 border-amber-500/60 pl-2">{{ similar.text }} <span class="text-xs text-muted-foreground">· {{ similar.votes }} votes</span></p>
      <div class="flex justify-end gap-2">
        <Button variant="ghost" size="sm" class="h-7" :loading="isAsking" @click="ask(true)">Ask mine anyway</Button>
        <Button variant="brand" size="sm" class="h-7" @click="upvoteSimilar"><ThumbsUp /> Upvote that one</Button>
      </div>
    </div>
    <form v-else-if="live" class="shrink-0 space-y-2 border-t border-border/70 p-3" @submit.prevent="ask()">
      <Textarea v-model="draft" rows="2" maxlength="500" placeholder="Ask a question…" class="resize-none text-sm" @keydown.enter.exact.prevent="ask()" />
      <div class="flex items-center">
        <span class="text-[11px] text-muted-foreground">Everyone in the call sees your name with it.</span>
        <Button type="submit" size="sm" variant="brand" class="ml-auto" :loading="isAsking" :disabled="!draft.trim()"><Send /> Ask</Button>
      </div>
    </form>
  </div>
</template>

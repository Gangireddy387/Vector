<script setup lang="ts">
import { BarChart3, Check, Lock, Plus, X } from 'lucide-vue-next'
import { computed, reactive, ref } from 'vue'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { MeetingPoll } from '../meetings.api'
import { useMeetingCall } from '../useMeetingCall'

/**
 * Quick polls during a call: anyone from the organization asks, everyone (guests too) answers, results update live.
 * Votes are anonymous. With `polls`, only shows the results kept with a past meeting.
 */
const props = withDefaults(defineProps<{ polls?: MeetingPoll[] | null }>(), { polls: null })

const MAX_OPTIONS = 6
const call = useMeetingCall()
const live = computed(() => props.polls === null)
const list = computed(() => [...(props.polls ?? call.polls.value)].reverse())
const canAsk = computed(() => live.value && !call.isGuest.value)

const creating = ref(false)
const isSaving = ref(false)
const form = reactive({ question: '', options: ['', ''] })

function reset() {
  form.question = ''
  form.options = ['', '']
  creating.value = false
}

async function create() {
  const options = form.options.map((option) => option.trim()).filter(Boolean)
  if (!form.question.trim()) return toast.error('Write the question')
  if (options.length < 2) return toast.error('Give at least 2 answers')
  isSaving.value = true
  try {
    await call.createPoll(form.question.trim(), options)
    reset()
  } catch (error) {
    toast.error(error instanceof Error ? error.message : 'Could not start the poll')
  } finally {
    isSaving.value = false
  }
}

async function run(action: () => Promise<unknown>) {
  try {
    await action()
  } catch (error) {
    toast.error(error instanceof Error ? error.message : 'That did not work')
  }
}

const share = (poll: MeetingPoll, votes: number) => (poll.total ? Math.round((votes / poll.total) * 100) : 0)
const canClose = (poll: MeetingPoll) => live.value && poll.status === 'open' && (call.canManage.value || poll.createdById === call.selfUser.value?.id)
</script>

<template>
  <div class="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
    <template v-if="canAsk">
      <form v-if="creating" class="space-y-2 border border-border/70 bg-muted/30 p-3" @submit.prevent="create">
        <Input v-model="form.question" placeholder="Ask a question…" maxlength="200" autofocus />
        <div v-for="(_, index) in form.options" :key="index" class="flex items-center gap-1.5">
          <Input v-model="form.options[index]" :placeholder="`Answer ${index + 1}`" maxlength="80" class="h-8 text-sm" />
          <Button v-if="form.options.length > 2" type="button" variant="ghost" size="icon-sm" aria-label="Remove answer" @click="form.options.splice(index, 1)"><X /></Button>
        </div>
        <div class="flex items-center gap-2">
          <Button v-if="form.options.length < MAX_OPTIONS" type="button" variant="ghost" size="sm" @click="form.options.push('')"><Plus /> Answer</Button>
          <Button type="button" variant="ghost" size="sm" class="ml-auto" @click="reset">Cancel</Button>
          <Button type="submit" variant="brand" size="sm" :loading="isSaving">Ask</Button>
        </div>
      </form>
      <Button v-else variant="outline" size="sm" class="w-full" @click="creating = true"><BarChart3 /> New poll</Button>
    </template>

    <article v-for="poll in list" :key="poll.id" class="space-y-2 border border-border/70 bg-card p-3">
      <div class="flex items-start gap-2">
        <p class="min-w-0 flex-1 text-sm font-semibold">{{ poll.question }}</p>
        <span v-if="poll.status === 'closed'" class="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
          <Lock class="size-3" /> Closed
        </span>
      </div>
      <ul class="space-y-1.5">
        <li v-for="(option, index) in poll.options" :key="index">
          <button
            type="button"
            class="relative w-full overflow-hidden border px-2.5 py-1.5 text-left text-sm transition-colors disabled:cursor-default"
            :class="poll.myVote === index ? 'border-primary' : 'border-border/70 enabled:hover:border-primary/50'"
            :disabled="!live || poll.status !== 'open'"
            @click="run(() => call.vote(poll.id, index))"
          >
            <span class="absolute inset-y-0 left-0 bg-primary/12 transition-[width]" :style="{ width: `${share(poll, option.votes)}%` }" />
            <span class="relative flex items-center gap-2">
              <Check v-if="poll.myVote === index" class="size-3.5 shrink-0 text-primary" />
              <span class="min-w-0 flex-1 truncate">{{ option.text }}</span>
              <span class="shrink-0 text-xs text-muted-foreground tabular-nums">{{ share(poll, option.votes) }}% · {{ option.votes }}</span>
            </span>
          </button>
        </li>
      </ul>
      <div class="flex items-center gap-2 text-[11px] text-muted-foreground">
        <span>{{ poll.total }} {{ poll.total === 1 ? 'vote' : 'votes' }}<template v-if="poll.createdBy"> · asked by {{ poll.createdBy.name }}</template></span>
        <Button v-if="canClose(poll)" variant="ghost" size="sm" class="ml-auto h-6 px-2 text-[11px]" @click="run(() => call.closePoll(poll.id))">Close poll</Button>
      </div>
    </article>

    <p v-if="!list.length" class="flex flex-col items-center gap-2 px-4 py-8 text-center text-sm text-muted-foreground">
      <BarChart3 class="size-8 text-muted-foreground/60" />
      {{ live ? 'No polls yet. Ask the room a quick question; answers are anonymous.' : 'No polls were run in this meeting.' }}
    </p>
  </div>
</template>

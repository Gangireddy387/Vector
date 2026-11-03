<script setup lang="ts">
import { formatDistanceToNowStrict } from 'date-fns'
import { Captions, LoaderCircle, Send, Sparkles } from 'lucide-vue-next'
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue'
import { toast } from 'vue-sonner'
import RichText from '@/components/common/RichText.vue'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useMeetingCall } from '../useMeetingCall'

/**
 * The meeting assistant beside the call: "catch me up" for people who joined late or stepped away, and questions
 * about what was said so far ("what did we decide about the release?"). Answers are for this person only.
 */
const call = useMeetingCall()
const draft = ref('')
const list = useTemplateRef<HTMLOListElement>('list')

const QUICK = ['What was decided so far?', 'What are the action items so far?', 'What happened in the last 10 minutes?']
const notesOn = computed(() => call.transcribing.value?.mode === 'ai')
const canTurnOn = computed(() => call.canManage.value && !call.isGuest.value && !call.transcribing.value)

watch(
  () => call.assistantTurns.value.map((turn) => `${turn.id}:${Boolean(turn.answer || turn.error)}`).join(),
  () => nextTick(() => list.value?.scrollTo({ top: list.value.scrollHeight, behavior: 'smooth' })),
)

async function ask(question: string | null) {
  if (call.assistantBusy.value) return
  await call.askAssistant(question)
}

async function send() {
  const question = draft.value.trim()
  if (!question) return
  draft.value = ''
  await ask(question)
}

async function turnOnNotes() {
  try {
    await call.setTranscribing(true)
  } catch (error) {
    toast.error(error instanceof Error ? error.message : 'Could not turn on AI notes')
  }
}
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <div v-if="!notesOn" class="m-3 mb-0 flex items-start gap-2.5 border border-sky-500/30 bg-sky-500/5 p-3 text-xs">
      <Captions class="mt-0.5 size-4 shrink-0 text-sky-600" />
      <div class="min-w-0 flex-1 space-y-2">
        <p>
          The assistant reads the chat, Q&amp;A and agenda. For what is <strong>said</strong>, AI notes must be on; they turn speech into captions and the meeting's
          transcript.
        </p>
        <Button v-if="canTurnOn" size="sm" variant="outline" class="h-7" @click="turnOnNotes"><Sparkles /> Turn on AI notes</Button>
        <p v-else-if="!call.transcribing.value" class="text-muted-foreground">Ask the host or a co-host to turn them on.</p>
      </div>
    </div>

    <ol ref="list" class="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
      <li v-if="!call.assistantTurns.value.length" class="flex flex-col items-center gap-3 px-2 py-8 text-center">
        <span class="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary"><Sparkles class="size-6" /></span>
        <p class="text-sm font-medium">Missed something?</p>
        <p class="text-xs text-muted-foreground">Get caught up in seconds, or ask about anything said in this meeting. Only you see the answers.</p>
        <Button variant="brand" :loading="call.assistantBusy.value" @click="ask(null)"><Sparkles /> Catch me up</Button>
      </li>
      <li v-for="turn in call.assistantTurns.value" :key="turn.id" class="space-y-2">
        <p class="ml-8 rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground">{{ turn.question ?? 'Catch me up' }}</p>
        <div class="mr-4 flex gap-2">
          <span class="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><Sparkles class="size-3.5" /></span>
          <div class="min-w-0 flex-1 rounded-lg border border-border/70 bg-muted/30 px-3 py-2 text-sm">
            <p v-if="!turn.answer && !turn.error" class="flex items-center gap-2 text-muted-foreground"><LoaderCircle class="size-4 animate-spin" /> Reading the meeting…</p>
            <p v-else-if="turn.error" class="text-destructive">{{ turn.error }}</p>
            <RichText v-else :source="turn.answer" compact />
            <p class="mt-1 text-[10px] text-muted-foreground">{{ formatDistanceToNowStrict(turn.at, { addSuffix: true }) }} · AI can make mistakes</p>
          </div>
        </div>
      </li>
    </ol>

    <div class="shrink-0 space-y-2 border-t border-border/70 p-3">
      <div v-if="call.assistantTurns.value.length" class="flex flex-wrap gap-1.5">
        <button
          v-for="question in [null, ...QUICK]"
          :key="question ?? 'catch-up'"
          type="button"
          class="rounded-full border border-border/70 px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
          :disabled="call.assistantBusy.value"
          @click="ask(question)"
        >
          {{ question ?? 'Catch me up' }}
        </button>
      </div>
      <form class="flex items-end gap-2" @submit.prevent="send">
        <Textarea v-model="draft" rows="2" maxlength="500" placeholder="Ask about this meeting…" class="min-h-0 resize-none text-sm" @keydown.enter.exact.prevent="send" />
        <Button type="submit" size="icon" variant="brand" aria-label="Ask" :disabled="!draft.trim() || call.assistantBusy.value"><Send /></Button>
      </form>
    </div>
  </div>
</template>

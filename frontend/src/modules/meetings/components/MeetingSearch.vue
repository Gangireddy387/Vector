<script setup lang="ts">
import { useDebounceFn } from '@vueuse/core'
import { format, parseISO } from 'date-fns'
import { Captions, FileText, ListChecks, LoaderCircle, MessageCircle, NotebookPen, Search, SearchX, Sparkles, X } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { getErrorMessage } from '@/lib/http'
import { latestRequest } from '@/lib/latest'
import { type MeetingSearchResult, meetingsApi } from '../meetings.api'

/**
 * Search across what was said and written in meetings (transcripts, chat, summaries, notes, agendas). With the AI
 * assistant it searches by meaning ("pricing" also finds "how much we charge"); results open the meeting at the
 * moment it was said.
 */
const query = defineModel<string>({ default: '' })
const router = useRouter()
const results = ref<MeetingSearchResult[]>([])
const mode = ref<'meaning' | 'words'>('words')
const isSearching = ref(false)
const error = ref<string | null>(null)
const searched = ref('')
const latest = latestRequest()

const KINDS: Record<MeetingSearchResult['kind'], { label: string; icon: typeof Captions }> = {
  transcript: { label: 'Said', icon: Captions },
  chat: { label: 'Chat', icon: MessageCircle },
  summary: { label: 'Summary', icon: ListChecks },
  notes: { label: 'Notes', icon: NotebookPen },
  agenda: { label: 'Agenda', icon: FileText },
}

const run = useDebounceFn(async (text: string) => {
  if (text.length < 2) {
    results.value = []
    searched.value = ''
    return
  }
  const ticket = latest.start()
  isSearching.value = true
  error.value = null
  try {
    const answer = await meetingsApi.search(text)
    if (!latest.isCurrent(ticket)) return
    results.value = answer.results
    mode.value = answer.mode
    searched.value = text
  } catch (problem) {
    if (latest.isCurrent(ticket)) error.value = getErrorMessage(problem)
  } finally {
    if (latest.isCurrent(ticket)) isSearching.value = false
  }
}, 350)
watch(query, (value) => void run(value.trim()))

const active = computed(() => query.value.trim().length >= 2)
const terms = computed(() => searched.value.toLowerCase().split(/\s+/).filter((term) => term.length > 1))

/** The text with the searched words marked (rendered as pieces, never as HTML). */
function pieces(text: string) {
  if (!terms.value.length) return [{ text, hit: false }]
  const pattern = new RegExp(`(${terms.value.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi')
  return text.split(pattern).filter(Boolean).map((part) => ({ text: part, hit: terms.value.includes(part.toLowerCase()) }))
}

function open(result: MeetingSearchResult) {
  const moment = result.at && (result.kind === 'transcript' || result.kind === 'chat') ? { at: result.at, in: result.kind } : {}
  void router.push({ name: 'meeting-room', params: { meetingId: result.meeting.id }, query: moment })
}
</script>

<template>
  <div class="space-y-2">
    <label class="flex h-10 items-center gap-2 border border-input bg-card px-3 shadow-xs focus-within:border-primary focus-within:ring-4 focus-within:ring-ring/15">
      <Search class="size-4 shrink-0 text-muted-foreground" />
      <input v-model="query" class="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" placeholder="Search what was said in meetings…" aria-label="Search meetings" />
      <LoaderCircle v-if="isSearching" class="size-4 shrink-0 animate-spin text-muted-foreground" />
      <button v-else-if="query" type="button" class="text-muted-foreground hover:text-foreground" aria-label="Clear the search" @click="query = ''"><X class="size-4" /></button>
    </label>

    <section v-if="active" class="border border-border/70 bg-card shadow-soft">
      <header class="flex items-center gap-2 border-b border-border/70 px-4 py-2 text-xs text-muted-foreground">
        <Sparkles v-if="mode === 'meaning'" class="size-3.5 text-primary" />
        <span class="min-w-0 flex-1">
          <template v-if="error">{{ error }}</template>
          <template v-else-if="searched">{{ results.length }} {{ results.length === 1 ? 'match' : 'matches' }} {{ mode === 'meaning' ? '· searched by meaning' : '· matching words' }}</template>
          <template v-else>Searching…</template>
        </span>
      </header>
      <ul v-if="results.length" class="max-h-[420px] divide-y divide-border/60 overflow-y-auto">
        <li v-for="(result, index) in results" :key="`${result.meeting.id}-${index}`">
          <button type="button" class="flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/40" @click="open(result)">
            <component :is="KINDS[result.kind].icon" class="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <span class="min-w-0 flex-1">
              <span class="flex flex-wrap items-baseline gap-x-2 text-sm">
                <span class="truncate font-medium">{{ result.meeting.title }}</span>
                <span class="text-xs text-muted-foreground">
                  {{ format(parseISO(result.meeting.startsAt), 'd MMM yyyy') }}<template v-if="result.at"> · {{ format(parseISO(result.at), 'HH:mm') }}</template> · {{ KINDS[result.kind].label }}
                </span>
              </span>
              <span class="mt-1 line-clamp-3 block text-sm whitespace-pre-line text-muted-foreground">
                <template v-for="(piece, position) in pieces(result.text)" :key="position">
                  <mark v-if="piece.hit" class="rounded-sm bg-amber-300/50 px-0.5 text-foreground dark:bg-amber-400/30">{{ piece.text }}</mark>
                  <template v-else>{{ piece.text }}</template>
                </template>
              </span>
            </span>
          </button>
        </li>
      </ul>
      <p v-else-if="searched && !isSearching" class="flex flex-col items-center gap-2 px-4 py-8 text-center text-sm text-muted-foreground">
        <SearchX class="size-6" /> Nothing found. Meetings can be searched once they end; captions or AI notes make what was said searchable.
      </p>
    </section>
  </div>
</template>

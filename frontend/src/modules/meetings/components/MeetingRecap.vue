<script setup lang="ts">
import { format, parseISO } from 'date-fns'
import { Captions, CircleCheck, ClipboardCheck, Download, FileText, Film, ListOrdered, MessageCircle, Phone, Play, Sparkles, Trash2 } from 'lucide-vue-next'
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue'
import { toast } from 'vue-sonner'
import UserAvatar from '@/components/common/UserAvatar.vue'
import { Button } from '@/components/ui/button'
import { useConfirm } from '@/composables/useConfirm'
import { assetUrl, getErrorMessage } from '@/lib/http'
import { attendanceCsv, attendanceDuration } from '../attendance'
import { durationLabel } from '../meeting-format'
import {
  type AttendanceEntry,
  type Meeting,
  type MeetingRecording,
  type MeetingSummary,
  type SavedChatMessage,
  type TranscriptLine,
  meetingsApi,
} from '../meetings.api'
import ActionItemsTasks from './ActionItemsTasks.vue'
import ChatAttachment from './ChatAttachment.vue'

/**
 * What a meeting left behind: the written summary, recordings, the transcript of the captions, the call's chat (with
 * its files) and, for the host, who attended and for how long.
 */
const props = withDefaults(
  defineProps<{
    meeting: Meeting
    chat: SavedChatMessage[]
    transcript: TranscriptLine[]
    recordings: MeetingRecording[]
    canSummarize: boolean
    attendance?: AttendanceEntry[] | null
    /** A moment to show (from search): the transcript or chat scrolls to it and it is highlighted. */
    focus?: { at: string; in: 'transcript' | 'chat' } | null
  }>(),
  { attendance: null, focus: null },
)
const emit = defineEmits<{ summary: [summary: MeetingSummary]; changed: [] }>()
const confirm = useConfirm()

type Section = 'summary' | 'recordings' | 'transcript' | 'chat' | 'attendance'
const hasContent = computed(() => props.chat.length + props.transcript.length > 0 || Boolean(props.meeting.notes))
const sections = computed(() => {
  const list: Array<{ value: Section; label: string; icon: typeof Sparkles; count?: number }> = []
  if (props.meeting.summary || (props.meeting.canManage && props.canSummarize && hasContent.value)) list.push({ value: 'summary', label: 'Summary', icon: Sparkles })
  if (props.recordings.length) list.push({ value: 'recordings', label: 'Recordings', icon: Film, count: props.recordings.length })
  if (props.transcript.length) list.push({ value: 'transcript', label: 'Transcript', icon: Captions })
  if (props.chat.length) list.push({ value: 'chat', label: 'Chat', icon: MessageCircle, count: props.chat.length })
  if (props.attendance?.length) list.push({ value: 'attendance', label: 'Attendance', icon: ClipboardCheck, count: props.attendance.length })
  return list
})

const fileLink = (fileId: string) => meetingsApi.fileLink(props.meeting.id, fileId)
const KIND_LABELS: Record<AttendanceEntry['kind'], string> = { member: 'Member', guest: 'Guest', phone: 'Phone' }
const totalAttendance = computed(() => (props.attendance ?? []).reduce((sum, entry) => sum + entry.seconds, 0))

function downloadAttendance() {
  const blob = new Blob([attendanceCsv(props.attendance ?? [])], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  Object.assign(document.createElement('a'), { href: url, download: `${props.meeting.title.replace(/[^\w\s-]+/g, '').trim() || 'meeting'} attendance.csv` }).click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
const section = ref<Section>('summary')
watch(
  sections,
  (list) => {
    if (list.length && !list.some((item) => item.value === section.value)) section.value = list[0]!.value
  },
  { immediate: true },
)

const summarizing = ref(false)
async function summarize() {
  summarizing.value = true
  try {
    emit('summary', await meetingsApi.summarize(props.meeting.id))
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    summarizing.value = false
  }
}

const playing = ref<{ id: string; url: string; startAt?: number } | null>(null)
const player = useTemplateRef<HTMLVideoElement[]>('player')
async function play(recording: MeetingRecording, startAt?: number) {
  try {
    if (playing.value?.id === recording.id) return seek(startAt ?? 0)
    playing.value = { id: recording.id, url: assetUrl(await meetingsApi.recordingLink(props.meeting.id, recording.id))!, startAt }
  } catch (error) {
    toast.error(getErrorMessage(error))
  }
}
function seek(seconds: number) {
  const video = player.value?.[0]
  if (!video) return
  video.currentTime = Math.max(0, seconds)
  void video.play().catch(() => undefined)
}
const onLoaded = () => playing.value?.startAt && seek(playing.value.startAt)

/** Chapters of the call that fall within a recording, with where they start in it (seconds). */
const chapters = computed(() => props.meeting.summary?.chapters ?? [])
function chaptersOf(recording: MeetingRecording) {
  const start = parseISO(recording.startedAt).getTime()
  const length = recording.durationSeconds ?? Number.POSITIVE_INFINITY
  return chapters.value
    .map((chapter) => ({ ...chapter, offset: Math.round((parseISO(chapter.at).getTime() - start) / 1000) }))
    .filter((chapter) => chapter.offset >= -30 && chapter.offset < length)
    .map((chapter) => ({ ...chapter, offset: Math.max(0, chapter.offset) }))
}
const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`

/** The recording that was running at `at`, and the second in it. */
function recordingAt(at: string) {
  const time = parseISO(at).getTime()
  for (const recording of props.recordings) {
    if (recording.status !== 'ready') continue
    const offset = Math.round((time - parseISO(recording.startedAt).getTime()) / 1000)
    if (offset >= 0 && offset <= (recording.durationSeconds ?? 0)) return { recording, offset }
  }
  return null
}

// Search opens the meeting at a moment: show it in the transcript (or chat) and offer to play from there.
const focusedId = ref<string | null>(null)
const focusMoment = computed(() => (props.focus ? recordingAt(props.focus.at) : null))
watch(
  () => props.focus,
  async (focus) => {
    if (!focus) return
    const lines = focus.in === 'chat' ? props.chat : props.transcript
    if (!lines.length) return
    section.value = focus.in
    const time = parseISO(focus.at).getTime()
    const nearest = [...lines].sort((a, b) => Math.abs(parseISO(a.at).getTime() - time) - Math.abs(parseISO(b.at).getTime() - time))[0]
    focusedId.value = nearest?.id ?? null
    await nextTick()
    document.getElementById(`recap-${focusedId.value}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  },
  { immediate: true },
)
async function download(recording: MeetingRecording) {
  try {
    const url = assetUrl(await meetingsApi.recordingLink(props.meeting.id, recording.id))!
    window.open(`${url}&download=1`, '_blank', 'noopener')
  } catch (error) {
    toast.error(getErrorMessage(error))
  }
}
async function removeRecording(recording: MeetingRecording) {
  const ok = await confirm({ title: 'Delete this recording?', description: 'It is removed for everyone. This cannot be undone.', confirmLabel: 'Delete', destructive: true })
  if (!ok) return
  try {
    await meetingsApi.removeRecording(props.meeting.id, recording.id)
    if (playing.value?.id === recording.id) playing.value = null
    emit('changed')
  } catch (error) {
    toast.error(getErrorMessage(error))
  }
}
const size = (bytes: number | null) => (bytes === null ? '' : bytes > 1_000_000_000 ? `${(bytes / 1_000_000_000).toFixed(1)} GB` : `${Math.max(1, Math.round(bytes / 1_000_000))} MB`)
const length = (seconds: number | null) => (seconds === null ? '' : seconds < 60 ? `${seconds} s` : durationLabel(Math.round(seconds / 60)))

function downloadTranscript() {
  const lines = props.transcript.map((line) => `[${format(parseISO(line.at), 'HH:mm:ss')}] ${line.speaker.name}: ${line.text}`)
  const blob = new Blob([`${props.meeting.title}\n${format(parseISO(props.meeting.startsAt), 'd MMM yyyy')}\n\n${lines.join('\n')}\n`], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  Object.assign(document.createElement('a'), { href: url, download: `${props.meeting.title} transcript.txt` }).click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
</script>

<template>
  <section v-if="sections.length" class="border border-border/70 bg-card shadow-soft">
    <div class="flex border-b border-border/70" role="tablist">
      <button
        v-for="item in sections"
        :key="item.value"
        type="button"
        role="tab"
        class="relative flex flex-1 items-center justify-center gap-1.5 px-3 py-2.5 text-sm font-medium transition-colors"
        :class="section === item.value ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'"
        :aria-selected="section === item.value"
        @click="section = item.value"
      >
        <component :is="item.icon" class="size-4" /> {{ item.label }}
        <span v-if="item.count" class="rounded-full bg-muted px-1.5 text-[10px] tabular-nums">{{ item.count }}</span>
        <span v-if="section === item.value" class="absolute inset-x-3 -bottom-px h-0.5 bg-primary" />
      </button>
    </div>

    <div v-if="section === 'summary'" class="space-y-4 p-4">
      <template v-if="meeting.summary">
        <p class="text-sm leading-relaxed whitespace-pre-wrap">{{ meeting.summary.text }}</p>
        <div v-if="meeting.summary.decisions.length" class="space-y-1.5">
          <h3 class="flex items-center gap-1.5 text-xs font-semibold tracking-wider text-muted-foreground uppercase"><CircleCheck class="size-3.5" /> Decisions</h3>
          <ul class="list-disc space-y-1 pl-5 text-sm">
            <li v-for="(decision, index) in meeting.summary.decisions" :key="index">{{ decision }}</li>
          </ul>
        </div>
        <ActionItemsTasks v-if="meeting.summary.actionItems.length && meeting.status !== 'cancelled'" :meeting="meeting" :summary="meeting.summary" @summary="(value) => emit('summary', value)" />
        <div v-if="chapters.length" class="space-y-1.5">
          <h3 class="flex items-center gap-1.5 text-xs font-semibold tracking-wider text-muted-foreground uppercase"><ListOrdered class="size-3.5" /> Chapters</h3>
          <ol class="space-y-1 text-sm">
            <li v-for="chapter in chapters" :key="chapter.at" class="flex gap-2">
              <span class="w-11 shrink-0 font-mono text-[11px] leading-5 text-muted-foreground tabular-nums">{{ format(parseISO(chapter.at), 'HH:mm') }}</span>
              <button
                v-if="recordingAt(chapter.at)"
                type="button"
                class="min-w-0 flex-1 text-left hover:text-primary hover:underline"
                :title="'Play the recording from here'"
                @click="(section = 'recordings'), play(recordingAt(chapter.at)!.recording, recordingAt(chapter.at)!.offset)"
              >
                {{ chapter.title }}
              </button>
              <span v-else class="min-w-0 flex-1">{{ chapter.title }}</span>
            </li>
          </ol>
        </div>
        <p class="text-[11px] text-muted-foreground">Written by the AI assistant {{ format(parseISO(meeting.summary.generatedAt), 'd MMM, HH:mm') }}. Check it before acting on it.</p>
      </template>
      <p v-else class="text-sm text-muted-foreground">Write a summary of what was said, decided and who does what next, from the captions, chat, updates and notes.</p>
      <Button v-if="meeting.canManage && canSummarize" variant="outline" size="sm" :loading="summarizing" @click="summarize">
        <Sparkles /> {{ meeting.summary ? 'Write it again' : 'Summarize the meeting' }}
      </Button>
    </div>

    <ul v-else-if="section === 'recordings'" class="divide-y divide-border/60">
      <li v-for="recording in recordings" :key="recording.id" class="space-y-2 p-3">
        <div class="flex items-center gap-3">
          <span class="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"><Film class="size-4" /></span>
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-medium">Recording · {{ format(parseISO(recording.startedAt), 'HH:mm') }}</p>
            <p class="truncate text-xs text-muted-foreground">
              <template v-if="recording.status === 'ready'">{{ [length(recording.durationSeconds), size(recording.sizeBytes), recording.createdBy?.name].filter(Boolean).join(' · ') }}</template>
              <template v-else-if="recording.status === 'recording'">Still recording or being saved by {{ recording.createdBy?.name ?? 'someone' }}…</template>
              <template v-else>Not saved: the browser that recorded was closed first.</template>
            </p>
          </div>
          <template v-if="recording.status === 'ready'">
            <Button variant="ghost" size="icon-sm" aria-label="Play" title="Play" @click="play(recording)"><Play /></Button>
            <Button variant="ghost" size="icon-sm" aria-label="Download" title="Download" @click="download(recording)"><Download /></Button>
          </template>
          <Button v-if="recording.canDelete" variant="ghost" size="icon-sm" class="text-destructive" aria-label="Delete recording" title="Delete" @click="removeRecording(recording)"><Trash2 /></Button>
        </div>
        <template v-if="playing?.id === recording.id">
          <video ref="player" :src="playing.url" controls autoplay class="aspect-video w-full rounded-md bg-black" @loadedmetadata="onLoaded" />
          <ol v-if="chaptersOf(recording).length" class="flex flex-wrap gap-1.5" aria-label="Chapters">
            <li v-for="chapter in chaptersOf(recording)" :key="chapter.at">
              <button type="button" class="rounded-full border border-border/70 px-2.5 py-1 text-xs transition-colors hover:bg-muted" @click="seek(chapter.offset)">
                <span class="font-mono text-muted-foreground tabular-nums">{{ clock(chapter.offset) }}</span> {{ chapter.title }}
              </button>
            </li>
          </ol>
        </template>
      </li>
    </ul>

    <div v-else-if="section === 'transcript'" class="flex max-h-[420px] flex-col">
      <div v-if="focus && focusMoment" class="flex items-center gap-2 border-b border-border/70 bg-primary/5 px-4 py-2 text-xs">
        <span class="min-w-0 flex-1">This moment is in a recording.</span>
        <Button variant="outline" size="sm" class="h-7" @click="(section = 'recordings'), play(focusMoment.recording, Math.max(0, focusMoment.offset - 3))"><Play /> Play from here</Button>
      </div>
      <ol class="min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
        <li
          v-for="line in transcript"
          :id="`recap-${line.id}`"
          :key="line.id"
          class="rounded text-sm transition-colors"
          :class="focusedId === line.id && 'bg-amber-400/20 ring-4 ring-amber-400/20'"
        >
          <span class="mr-1.5 font-mono text-[11px] text-muted-foreground tabular-nums">{{ format(parseISO(line.at), 'HH:mm') }}</span>
          <span class="font-semibold">{{ line.speaker.name }}:</span> {{ line.text }}
        </li>
      </ol>
      <div class="border-t border-border/70 p-2 text-right">
        <Button variant="ghost" size="sm" @click="downloadTranscript"><FileText /> Download as text</Button>
      </div>
    </div>

    <ol v-else-if="section === 'chat'" class="max-h-[420px] space-y-3 overflow-y-auto p-4">
      <li
        v-for="message in chat"
        :id="`recap-${message.id}`"
        :key="message.id"
        class="flex gap-2.5 rounded transition-colors"
        :class="focusedId === message.id && 'bg-amber-400/20 ring-4 ring-amber-400/20'"
      >
        <UserAvatar :user="message.author" size="md" class="mt-0.5" />
        <div class="min-w-0 flex-1">
          <div class="flex items-baseline gap-2">
            <span class="truncate text-sm font-semibold">{{ message.author.name }}</span>
            <span class="shrink-0 text-[11px] text-muted-foreground">{{ format(parseISO(message.at), 'HH:mm') }}</span>
            <span v-if="message.broadcast" class="shrink-0 text-[11px] text-amber-600">to all rooms</span>
            <span v-else-if="message.roomName" class="shrink-0 truncate text-[11px] text-muted-foreground">in {{ message.roomName }}</span>
          </div>
          <p v-if="message.body" class="mt-0.5 text-sm break-words whitespace-pre-wrap">{{ message.body }}</p>
          <ChatAttachment v-if="message.attachment" :file="message.attachment" :resolve="fileLink" />
        </div>
      </li>
    </ol>

    <div v-else-if="section === 'attendance' && attendance" class="flex max-h-[460px] flex-col">
      <div class="flex flex-wrap items-center gap-2 border-b border-border/70 px-4 py-2.5 text-sm">
        <span class="min-w-0 flex-1 text-muted-foreground">
          {{ attendance.length }} {{ attendance.length === 1 ? 'person' : 'people' }} joined · {{ attendanceDuration(totalAttendance) }} in total
        </span>
        <Button variant="outline" size="sm" @click="downloadAttendance"><Download /> Download CSV</Button>
      </div>
      <div class="min-h-0 flex-1 overflow-auto">
        <table class="w-full text-sm">
          <thead class="sticky top-0 bg-card text-left text-xs text-muted-foreground">
            <tr>
              <th class="px-4 py-2 font-medium">Name</th>
              <th class="px-2 py-2 font-medium">Joined</th>
              <th class="px-2 py-2 font-medium">Left</th>
              <th class="px-2 py-2 text-right font-medium">Time in call</th>
              <th class="px-4 py-2 text-right font-medium">Joins</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-border/60">
            <tr v-for="entry in attendance" :key="entry.key">
              <td class="max-w-[14rem] px-4 py-2">
                <span class="flex items-center gap-1.5 truncate font-medium">
                  <Phone v-if="entry.kind === 'phone'" class="size-3.5 shrink-0 text-muted-foreground" />
                  {{ entry.name }}
                  <span v-if="entry.kind !== 'member'" class="rounded bg-muted px-1 text-[10px] font-medium text-muted-foreground">{{ KIND_LABELS[entry.kind] }}</span>
                </span>
                <span v-if="entry.email" class="block truncate text-xs text-muted-foreground">{{ entry.email }}</span>
              </td>
              <td class="px-2 py-2 text-muted-foreground tabular-nums">{{ format(parseISO(entry.firstJoinedAt), 'HH:mm') }}</td>
              <td class="px-2 py-2 text-muted-foreground tabular-nums">
                <span v-if="entry.inCall" class="text-emerald-600 dark:text-emerald-400">In the call</span>
                <template v-else-if="entry.lastLeftAt">{{ format(parseISO(entry.lastLeftAt), 'HH:mm') }}</template>
              </td>
              <td class="px-2 py-2 text-right tabular-nums">{{ attendanceDuration(entry.seconds) }}</td>
              <td class="px-4 py-2 text-right text-muted-foreground tabular-nums">{{ entry.sessions }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>

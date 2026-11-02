<script setup lang="ts">
import { format, parseISO } from 'date-fns'
import { Captions, CircleCheck, ClipboardCheck, Download, FileText, Film, ListTodo, MessageCircle, Phone, Play, Sparkles, Trash2 } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
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
  }>(),
  { attendance: null },
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

const playing = ref<{ id: string; url: string } | null>(null)
async function play(recording: MeetingRecording) {
  try {
    playing.value = { id: recording.id, url: assetUrl(await meetingsApi.recordingLink(props.meeting.id, recording.id))! }
  } catch (error) {
    toast.error(getErrorMessage(error))
  }
}
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
        <div v-if="meeting.summary.actionItems.length" class="space-y-1.5">
          <h3 class="flex items-center gap-1.5 text-xs font-semibold tracking-wider text-muted-foreground uppercase"><ListTodo class="size-3.5" /> Action items</h3>
          <ul class="space-y-1 text-sm">
            <li v-for="(item, index) in meeting.summary.actionItems" :key="index" class="flex gap-2">
              <span class="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
              <span class="min-w-0 flex-1">{{ item.text }}<span v-if="item.owner" class="text-muted-foreground"> · {{ item.owner }}</span></span>
            </li>
          </ul>
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
        <video v-if="playing?.id === recording.id" :src="playing.url" controls autoplay class="aspect-video w-full rounded-md bg-black" />
      </li>
    </ul>

    <div v-else-if="section === 'transcript'" class="flex max-h-[420px] flex-col">
      <ol class="min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
        <li v-for="line in transcript" :key="line.id" class="text-sm">
          <span class="mr-1.5 font-mono text-[11px] text-muted-foreground tabular-nums">{{ format(parseISO(line.at), 'HH:mm') }}</span>
          <span class="font-semibold">{{ line.speaker.name }}:</span> {{ line.text }}
        </li>
      </ol>
      <div class="border-t border-border/70 p-2 text-right">
        <Button variant="ghost" size="sm" @click="downloadTranscript"><FileText /> Download as text</Button>
      </div>
    </div>

    <ol v-else-if="section === 'chat'" class="max-h-[420px] space-y-3 overflow-y-auto p-4">
      <li v-for="message in chat" :key="message.id" class="flex gap-2.5">
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

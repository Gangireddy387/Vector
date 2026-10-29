<script setup lang="ts">
import { useIntervalFn, useNow } from '@vueuse/core'
import { isAxiosError } from 'axios'
import { format, parseISO } from 'date-fns'
import { ArrowLeft, CalendarDays, Clock3, Mic, MicOff, PhoneCall, Repeat, Sparkles, Trash2, Video, VideoOff } from 'lucide-vue-next'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import UserAvatar from '@/components/common/UserAvatar.vue'
import UserAvatarStack from '@/components/common/UserAvatarStack.vue'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useConfirm } from '@/composables/useConfirm'
import { useDevice } from '@/composables/useDevice'
import { getErrorMessage } from '@/lib/http'
import { getSocket } from '@/lib/realtime'
import { useAuthStore } from '@/modules/auth/auth.store'
import CallView from '../components/CallView.vue'
import CallWhiteboard from '../components/CallWhiteboard.vue'
import MeetingPanel, { type MeetingPanelTab } from '../components/MeetingPanel.vue'
import VideoTile from '../components/VideoTile.vue'
import { BADGE_CLASSES, dayLabel, durationLabel, isJoinable, meetingBadge, recurrenceLabel, timeRange } from '../meeting-format'
import { type Meeting, type MeetingPoll, type MeetingUpdate, type WhiteboardStroke, meetingsApi } from '../meetings.api'
import { blurSupported, useMeetingCall } from '../useMeetingCall'

const props = defineProps<{ meetingId: string }>()

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()
const confirm = useConfirm()
const { isDesktop } = useDevice()
const call = useMeetingCall()
const now = useNow({ scheduler: (callback) => useIntervalFn(callback, 1000) })

const meeting = ref<Meeting | null>(null)
const updates = ref<MeetingUpdate[]>([])
const polls = ref<MeetingPoll[]>([])
const whiteboard = ref<WhiteboardStroke[] | null>(null)
const isLoading = ref(true)
const isJoining = ref(false)
const panelOpen = ref(isDesktop.value)
const panelTab = ref<MeetingPanelTab>('updates')

async function load() {
  try {
    const data = await meetingsApi.get(props.meetingId)
    meeting.value = data.meeting
    updates.value = data.updates
    polls.value = data.polls
    whiteboard.value = data.whiteboard?.strokes ?? null
  } catch (error) {
    toast.error(getErrorMessage(error))
    if (!meeting.value || (isAxiosError(error) && error.response?.status === 404)) {
      if (inThisCall.value) call.leave()
      void router.replace({ name: 'meetings' })
    }
  } finally {
    isLoading.value = false
  }
}

/** The call lives on while people browse other pages; this page shows it when it is for this meeting. */
const inThisCall = computed(() => call.inCall.value && call.meetingId.value === props.meetingId)
const inOtherCall = computed(() => (call.inCall.value || call.status.value === 'waiting') && call.meetingId.value !== props.meetingId)
const canJoin = computed(() => Boolean(meeting.value && isJoinable(meeting.value, now.value)))
const hasLeft = computed(() => call.status.value === 'left' && call.meetingId.value === props.meetingId)

/** Device and screen buttons can fail (permission refused, camera busy); say why instead of doing nothing. */
async function run(action: () => Promise<unknown>) {
  try {
    await action()
  } catch (error) {
    toast.error(getErrorMessage(error))
  }
}

watch(
  () => call.callError.value,
  (message) => {
    if (message && call.meetingId.value === props.meetingId) {
      toast.error(message)
      void load()
    }
  },
)
watch(
  () => call.closedReason.value,
  (reason) => {
    if (!reason || call.meetingId.value !== props.meetingId) return
    toast.info(reason === 'cancelled' ? 'The meeting was cancelled' : 'The host ended the meeting')
    call.closedReason.value = null
    void load()
  },
)

async function join() {
  if (!meeting.value) return
  isJoining.value = true
  try {
    await call.join(props.meetingId, { user: auth.user, title: meeting.value.title })
    panelTab.value = 'chat'
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    isJoining.value = false
  }
}

async function switchHere() {
  call.leave()
  call.reset()
  await call.startPreview()
}

function leave() {
  call.leave()
  void load().then(async () => {
    if (canJoin.value) await call.startPreview()
  })
}

async function endForEveryone() {
  if (!meeting.value) return
  const ok = await confirm({
    title: 'End the meeting for everyone?',
    description: 'Everyone leaves the call. The updates, notes, polls and whiteboard stay with the meeting.',
    confirmLabel: 'End meeting',
    destructive: true,
  })
  if (!ok) return
  try {
    meeting.value = await meetingsApi.end(meeting.value.id)
    call.leave()
    void load()
  } catch (error) {
    toast.error(getErrorMessage(error))
  }
}

async function remove() {
  const current = meeting.value
  if (!current) return
  const ok = await confirm({
    title: 'Delete this meeting?',
    description: `“${current.title}” is removed for everyone, with its updates and notes. This cannot be undone.`,
    confirmLabel: 'Delete meeting',
    destructive: true,
  })
  if (!ok) return
  try {
    bindSocket(false)
    await meetingsApi.remove(current.id)
    toast.success('Meeting deleted')
    await router.replace({ name: 'meetings' })
  } catch (error) {
    bindSocket(true)
    toast.error(getErrorMessage(error))
  }
}

const SOCKET_EVENTS = {
  'meeting:changed': async ({ id }: { id: string }) => {
    if (id === props.meetingId) await load()
  },
  'meeting:update': (update: MeetingUpdate) => {
    if (update.meetingId !== props.meetingId || updates.value.some((item) => item.id === update.id)) return
    updates.value = [...updates.value, update]
    if (inThisCall.value && update.authorId !== auth.user?.id && !(panelOpen.value && panelTab.value === 'updates')) {
      toast(`${update.author?.name ?? 'Someone'} shared an update`, { description: update.body.slice(0, 120) })
    }
  },
  'meeting:update-removed': ({ meetingId, id }: { meetingId: string; id: string }) => {
    if (meetingId === props.meetingId) updates.value = updates.value.filter((item) => item.id !== id)
  },
} as const

function bindSocket(on: boolean) {
  for (const [event, handler] of Object.entries(SOCKET_EVENTS)) getSocket()?.[on ? 'on' : 'off'](event, handler as (...args: any[]) => void)
}

/** A ringing call or a notification opens this page with ?join=1: go straight into the call. */
async function prepare() {
  await load()
  if (!canJoin.value || inThisCall.value || inOtherCall.value) return
  await call.startPreview()
  if (route.query.join === '1') {
    void router.replace({ query: { ...route.query, join: undefined } })
    await join()
  }
}

watch(
  () => route.query.join,
  async (value) => {
    if (value !== '1' || isLoading.value) return
    void router.replace({ query: { ...route.query, join: undefined } })
    if (canJoin.value && !inThisCall.value && !inOtherCall.value) {
      await call.startPreview()
      await join()
    }
  },
)

watch(
  () => props.meetingId,
  async () => {
    if (!inThisCall.value) call.stopPreview()
    isLoading.value = true
    await prepare()
  },
)

onMounted(async () => {
  bindSocket(true)
  await prepare()
})
onBeforeUnmount(() => {
  bindSocket(false)
  if (!call.inCall.value && call.status.value !== 'waiting') {
    call.stopPreview()
    call.reset()
  }
})

const onPosted = (update: MeetingUpdate) => {
  if (!updates.value.some((item) => item.id === update.id)) updates.value = [...updates.value, update]
}
const onRemoved = (id: string) => (updates.value = updates.value.filter((item) => item.id !== id))
const onNotes = (notes: string | null) => meeting.value && (meeting.value = { ...meeting.value, notes })
const onChanged = (value: Meeting) => (meeting.value = value)
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <div v-if="isLoading" class="grid w-full gap-5 p-5 lg:grid-cols-[1.6fr_1fr]">
      <Skeleton class="aspect-video w-full" />
      <Skeleton class="h-80 w-full" />
    </div>

    <CallView
      v-else-if="meeting && inThisCall"
      v-model:panel-open="panelOpen"
      :title="meeting.title"
      :started-at="meeting.startedAt"
      :can-end="meeting.canManage"
      @leave="leave"
      @end="endForEveryone"
    >
      <template #panel="{ openBreakouts }">
        <MeetingPanel
          v-model:tab="panelTab"
          live
          :meeting="meeting"
          :updates="updates"
          @posted="onPosted"
          @removed="onRemoved"
          @notes="onNotes"
          @changed="onChanged"
          @breakouts="openBreakouts"
        />
      </template>
    </CallView>

    <!-- Lobby, or the summary of a meeting that is over -->
    <div v-else-if="meeting" class="min-h-0 flex-1 overflow-y-auto">
      <div class="grid w-full gap-5 lg:grid-cols-[1.6fr_1fr]" :class="isDesktop ? 'p-5' : 'p-3'">
        <div class="space-y-4">
          <button type="button" class="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground" @click="router.push({ name: 'meetings' })">
            <ArrowLeft class="size-4" /> All meetings
          </button>

          <div v-if="canJoin && inOtherCall" class="flex flex-col items-center gap-3 border border-border/70 bg-card px-6 py-12 text-center shadow-soft">
            <span class="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary"><PhoneCall class="size-6" /></span>
            <p class="font-semibold">You are in another call{{ call.title.value ? `: “${call.title.value}”` : '' }}</p>
            <p class="max-w-sm text-sm text-muted-foreground">Joining this meeting leaves that call.</p>
            <Button variant="brand" @click="switchHere"><Video /> Leave it and get ready here</Button>
          </div>

          <template v-else-if="canJoin">
            <div class="relative overflow-hidden bg-[#0d1017] p-2 shadow-soft">
              <VideoTile
                :stream="call.selfStream.value"
                :user="auth.user"
                label="You"
                :audio="call.media.audio"
                :video="call.media.video"
                :revision="call.localRevision.value"
                self
              />
              <div class="absolute inset-x-0 bottom-5 flex justify-center gap-2">
                <button
                  type="button"
                  class="flex size-11 items-center justify-center rounded-full text-white backdrop-blur transition-colors disabled:opacity-40"
                  :class="call.media.audio ? 'bg-white/15 hover:bg-white/25' : 'bg-red-500 hover:bg-red-500/90'"
                  :aria-label="call.media.audio ? 'Mute microphone' : 'Unmute microphone'"
                  @click="run(call.toggleAudio)"
                >
                  <Mic v-if="call.media.audio" class="size-5" />
                  <MicOff v-else class="size-5" />
                </button>
                <button
                  type="button"
                  class="flex size-11 items-center justify-center rounded-full text-white backdrop-blur transition-colors disabled:opacity-40"
                  :class="call.media.video ? 'bg-white/15 hover:bg-white/25' : 'bg-red-500 hover:bg-red-500/90'"
                  :aria-label="call.media.video ? 'Turn camera off' : 'Turn camera on'"
                  @click="run(call.toggleVideo)"
                >
                  <Video v-if="call.media.video" class="size-5" />
                  <VideoOff v-else class="size-5" />
                </button>
                <button
                  v-if="blurSupported"
                  type="button"
                  class="flex size-11 items-center justify-center rounded-full text-white backdrop-blur transition-colors disabled:opacity-40"
                  :class="call.blurOn.value ? 'bg-sky-500 hover:bg-sky-500/90' : 'bg-white/15 hover:bg-white/25'"
                  :disabled="call.blurBusy.value || !call.media.video"
                  :aria-label="call.blurOn.value ? 'Turn off background blur' : 'Blur my background'"
                  :title="call.blurOn.value ? 'Background blur is on' : 'Blur my background'"
                  @click="run(call.toggleBlur)"
                >
                  <Sparkles class="size-5" :class="call.blurBusy.value && 'animate-pulse'" />
                </button>
              </div>
            </div>
            <p v-if="call.deviceNote.value" class="border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-amber-700 dark:text-warning">{{ call.deviceNote.value }}</p>

            <div class="flex flex-wrap items-center gap-3 border border-border/70 bg-card p-4 shadow-soft">
              <div class="min-w-0 flex-1">
                <p class="text-sm font-semibold">{{ hasLeft ? 'You left the call' : 'Ready to join?' }}</p>
                <p class="text-xs text-muted-foreground">
                  <template v-if="meeting.inCall.length">{{ meeting.inCall.length }} {{ meeting.inCall.length === 1 ? 'person is' : 'people are' }} in the call now.</template>
                  <template v-else>No one is in the call yet. Starting it rings everyone invited.</template>
                </p>
              </div>
              <UserAvatarStack
                v-if="meeting.inCall.length"
                :users="[...(meeting.host ? [meeting.host] : []), ...meeting.participants].filter((person, index, all) => meeting!.inCall.includes(person.id) && all.findIndex((item) => item.id === person.id) === index)"
                :max="5"
              />
              <Button variant="brand" size="lg" :loading="isJoining" @click="join">
                <Video /> {{ hasLeft ? 'Rejoin' : meeting.status === 'live' ? 'Join now' : 'Start the call' }}
              </Button>
            </div>
          </template>

          <div v-else class="flex flex-col items-center gap-2 border border-border/70 bg-card px-6 py-12 text-center shadow-soft">
            <span class="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground"><VideoOff class="size-6" /></span>
            <p class="font-semibold">{{ meeting.status === 'cancelled' ? 'This meeting was cancelled' : 'This meeting has ended' }}</p>
            <p class="max-w-sm text-sm text-muted-foreground">
              {{ meeting.status === 'cancelled' ? 'It was removed from everyone’s calendar.' : 'The updates, notes, polls and whiteboard from the meeting are kept here.' }}
            </p>
            <Button v-if="meeting.canManage" variant="ghost" size="sm" class="mt-2 text-destructive" @click="remove"><Trash2 /> Delete meeting</Button>
          </div>

          <section v-if="!canJoin && whiteboard?.length" class="h-[420px] border border-border/70 bg-slate-100 p-3 shadow-soft dark:bg-slate-900">
            <CallWhiteboard :strokes="whiteboard" :closable="false" />
          </section>
        </div>

        <div class="flex min-h-0 flex-col gap-4">
          <section class="space-y-3 border border-border/70 bg-card p-4 shadow-soft">
            <div class="flex flex-wrap items-center gap-2">
              <h1 class="min-w-0 flex-1 truncate text-lg font-semibold">{{ meeting.title }}</h1>
              <span class="rounded-full px-2 py-0.5 text-[11px] font-medium" :class="BADGE_CLASSES[meetingBadge(meeting, now).tone]">{{ meetingBadge(meeting, now).label }}</span>
            </div>
            <dl class="space-y-1.5 text-sm">
              <div class="flex items-center gap-2 text-muted-foreground"><CalendarDays class="size-4" /> {{ dayLabel(meeting.startsAt) }} · {{ format(parseISO(meeting.startsAt), 'd MMM yyyy') }}</div>
              <div class="flex items-center gap-2 text-muted-foreground"><Clock3 class="size-4" /> {{ timeRange(meeting) }} · {{ durationLabel(meeting.durationMinutes) }}</div>
              <div v-if="meeting.recurrence" class="flex items-center gap-2 text-muted-foreground"><Repeat class="size-4" /> {{ recurrenceLabel(meeting.recurrence, meeting.startsAt) }}</div>
              <div v-if="meeting.host" class="flex items-center gap-2 text-muted-foreground"><UserAvatar :user="meeting.host" size="xs" /> Hosted by {{ meeting.host.name }}</div>
            </dl>
            <p v-if="meeting.agenda" class="border-t border-border/60 pt-3 text-sm whitespace-pre-wrap">{{ meeting.agenda }}</p>
          </section>

          <section class="flex h-[460px] min-h-0 flex-col overflow-hidden border border-border/70 shadow-soft">
            <MeetingPanel
              v-model:tab="panelTab"
              :meeting="meeting"
              :updates="updates"
              :polls="polls"
              @posted="onPosted"
              @removed="onRemoved"
              @notes="onNotes"
              @changed="onChanged"
            />
          </section>
        </div>
      </div>
    </div>
  </div>
</template>

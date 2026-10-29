<script setup lang="ts">
import { useIntervalFn, useNow } from '@vueuse/core'
import { isAxiosError } from 'axios'
import { differenceInSeconds, format, parseISO } from 'date-fns'
import {
  ArrowLeft,
  CalendarDays,
  Clock3,
  LoaderCircle,
  Mic,
  MicOff,
  MonitorUp,
  MonitorX,
  PanelRightClose,
  PanelRightOpen,
  PhoneOff,
  SquareX,
  Trash2,
  UsersRound,
  Video,
  VideoOff,
} from 'lucide-vue-next'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
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
import MeetingPanel from '../components/MeetingPanel.vue'
import VideoTile from '../components/VideoTile.vue'
import { BADGE_CLASSES, dayLabel, durationLabel, isJoinable, meetingBadge, timeRange } from '../meeting-format'
import { type Meeting, type MeetingUpdate, meetingsApi } from '../meetings.api'
import { type PeerConnection, canShareScreen, useMeetingCall } from '../useMeetingCall'

const props = defineProps<{ meetingId: string }>()

const router = useRouter()
const auth = useAuthStore()
const confirm = useConfirm()
const { isDesktop } = useDevice()
const call = useMeetingCall()
const now = useNow({ scheduler: (callback) => useIntervalFn(callback, 1000) })

const meeting = ref<Meeting | null>(null)
const updates = ref<MeetingUpdate[]>([])
const isLoading = ref(true)
const isJoining = ref(false)
const panelOpen = ref(isDesktop.value)
const panelTab = ref<'updates' | 'people' | 'notes'>('updates')

async function load() {
  try {
    const data = await meetingsApi.get(props.meetingId)
    meeting.value = data.meeting
    updates.value = data.updates
  } catch (error) {
    toast.error(getErrorMessage(error))
    if (!meeting.value || (isAxiosError(error) && error.response?.status === 404)) {
      if (inCall.value) call.leave()
      void router.replace({ name: 'meetings' })
    }
  } finally {
    isLoading.value = false
  }
}

const inCall = computed(() => call.status.value === 'joined' || call.status.value === 'reconnecting')
const canJoin = computed(() => Boolean(meeting.value && isJoinable(meeting.value, now.value)))

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
    if (message) {
      toast.error(message)
      void load()
    }
  },
)

async function join() {
  isJoining.value = true
  try {
    await call.join(props.meetingId)
    panelTab.value = 'updates'
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    isJoining.value = false
  }
}

function leave() {
  call.leave()
  void load()
}

async function endForEveryone() {
  if (!meeting.value) return
  const ok = await confirm({
    title: 'End the meeting for everyone?',
    description: 'Everyone leaves the call. The updates and notes stay with the meeting.',
    confirmLabel: 'End meeting',
    destructive: true,
  })
  if (!ok) return
  try {
    meeting.value = await meetingsApi.end(meeting.value.id)
    call.leave()
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

const elapsed = computed(() => {
  const startedAt = meeting.value?.startedAt
  if (!startedAt) return ''
  const seconds = Math.max(0, differenceInSeconds(now.value, parseISO(startedAt)))
  const pad = (value: number) => String(value).padStart(2, '0')
  const hours = Math.floor(seconds / 3600)
  return `${hours ? `${hours}:` : ''}${pad(Math.floor((seconds % 3600) / 60))}:${pad(seconds % 60)}`
})

interface Tile {
  id: string
  stream: MediaStream | null
  user: Meeting['host']
  label: string
  audio: boolean
  video: boolean
  screen: boolean
  self: boolean
  revision: number
  connection?: PeerConnection
}

const tiles = computed<Tile[]>(() => [
  {
    id: 'self',
    stream: call.media.screen ? call.screenStream.value : call.localStream.value,
    user: auth.user,
    label: call.media.screen ? 'You are presenting' : 'You',
    audio: call.media.audio,
    video: call.media.video,
    screen: call.media.screen,
    self: true,
    revision: call.localRevision.value,
  },
  ...call.peers.value.map((peer) => ({
    id: peer.socketId,
    stream: peer.stream,
    user: peer.user,
    label: peer.media.screen ? `${peer.user.name} is presenting` : peer.user.name,
    audio: peer.media.audio,
    video: peer.media.video,
    screen: peer.media.screen,
    self: false,
    revision: peer.revision,
    connection: peer.connection,
  })),
])
/** Someone sharing their screen gets the big tile; everyone else sits in a strip beside it. */
const spotlight = computed(() => tiles.value.find((tile) => tile.screen && !tile.self) ?? tiles.value.find((tile) => tile.screen) ?? null)
const others = computed(() => tiles.value.filter((tile) => tile.id !== spotlight.value?.id))
const gridClass = computed(() => {
  const count = tiles.value.length
  if (count === 1) return 'grid-cols-1 max-w-4xl'
  if (count <= 4) return 'grid-cols-1 sm:grid-cols-2 max-w-6xl'
  return 'grid-cols-2 lg:grid-cols-3'
})

const SOCKET_EVENTS = {
  'meeting:changed': async ({ id, status }: { id: string; status: Meeting['status'] }) => {
    if (id !== props.meetingId) return
    if (inCall.value && (status === 'ended' || status === 'cancelled')) {
      call.leave()
      toast.info(status === 'ended' ? 'The host ended the meeting' : 'The meeting was cancelled')
    }
    await load()
  },
  'meeting:update': (update: MeetingUpdate) => {
    if (update.meetingId !== props.meetingId || updates.value.some((item) => item.id === update.id)) return
    updates.value = [...updates.value, update]
    if (inCall.value && update.authorId !== auth.user?.id && !(panelOpen.value && panelTab.value === 'updates')) {
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

watch(
  () => props.meetingId,
  async () => {
    if (inCall.value) call.leave()
    isLoading.value = true
    await load()
    if (canJoin.value && call.status.value === 'idle') void call.startPreview()
  },
)

onMounted(async () => {
  bindSocket(true)
  await load()
  if (canJoin.value) void call.startPreview()
})
onBeforeUnmount(() => bindSocket(false))

const onPosted = (update: MeetingUpdate) => {
  if (!updates.value.some((item) => item.id === update.id)) updates.value = [...updates.value, update]
}
const onRemoved = (id: string) => (updates.value = updates.value.filter((item) => item.id !== id))
const onNotes = (notes: string | null) => meeting.value && (meeting.value = { ...meeting.value, notes })

function rejoin() {
  void join()
}
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <div v-if="isLoading" class="grid w-full gap-5 p-5 lg:grid-cols-[1.6fr_1fr]">
      <Skeleton class="aspect-video w-full" />
      <Skeleton class="h-80 w-full" />
    </div>

    <!-- In the call -->
    <div v-else-if="meeting && inCall" class="flex min-h-0 flex-1 bg-[#0d1017] text-white">
      <div class="flex min-w-0 flex-1 flex-col">
        <header class="flex shrink-0 items-center gap-3 px-4 py-3">
          <span class="relative flex size-2.5"><span class="absolute inline-flex size-full animate-ping rounded-full bg-red-500 opacity-75" /><span class="relative inline-flex size-2.5 rounded-full bg-red-500" /></span>
          <h1 class="min-w-0 truncate text-sm font-semibold">{{ meeting.title }}</h1>
          <span class="font-mono text-xs text-white/60 tabular-nums">{{ elapsed }}</span>
          <span class="ml-auto inline-flex items-center gap-1.5 text-xs text-white/70"><UsersRound class="size-3.5" /> {{ tiles.length }} in the call</span>
        </header>
        <div v-if="call.status.value === 'reconnecting'" class="mx-4 mb-2 flex items-center justify-center gap-2 rounded-lg bg-amber-500/15 px-3 py-2 text-sm text-amber-200" role="status">
          <LoaderCircle class="size-4 animate-spin" /> Your connection dropped. Reconnecting to the call…
        </div>

        <div class="min-h-0 flex-1 overflow-y-auto px-4 pb-2">
          <div v-if="spotlight" class="flex h-full min-h-0 flex-col gap-3 lg:flex-row">
            <VideoTile class="min-h-0 flex-1 !aspect-auto" v-bind="spotlight" />
            <div class="flex shrink-0 gap-3 overflow-auto lg:w-56 lg:flex-col">
              <VideoTile v-for="tile in others" :key="tile.id" class="w-48 shrink-0 lg:w-full" v-bind="tile" />
            </div>
          </div>
          <div v-else class="mx-auto grid h-full content-center gap-3" :class="gridClass">
            <VideoTile v-for="tile in tiles" :key="tile.id" v-bind="tile" />
          </div>
        </div>

        <footer class="flex shrink-0 flex-wrap items-center justify-center gap-2 px-4 py-3">
          <button
            type="button"
            class="flex size-11 items-center justify-center rounded-full transition-colors disabled:opacity-40"
            :class="call.media.audio ? 'bg-white/10 hover:bg-white/20' : 'bg-red-500 hover:bg-red-500/90'"
            :aria-label="call.media.audio ? 'Mute microphone' : 'Unmute microphone'"
            :title="call.media.audio ? 'Mute' : 'Unmute'"
            @click="run(call.toggleAudio)"
          >
            <Mic v-if="call.media.audio" class="size-5" />
            <MicOff v-else class="size-5" />
          </button>
          <button
            type="button"
            class="flex size-11 items-center justify-center rounded-full transition-colors disabled:opacity-40"
            :class="call.media.video ? 'bg-white/10 hover:bg-white/20' : 'bg-red-500 hover:bg-red-500/90'"
            :aria-label="call.media.video ? 'Turn camera off' : 'Turn camera on'"
            :title="call.media.video ? 'Camera off' : 'Camera on'"
            @click="run(call.toggleVideo)"
          >
            <Video v-if="call.media.video" class="size-5" />
            <VideoOff v-else class="size-5" />
          </button>
          <button
            v-if="canShareScreen"
            type="button"
            class="flex size-11 items-center justify-center rounded-full transition-colors"
            :class="call.media.screen ? 'bg-sky-500 hover:bg-sky-500/90' : 'bg-white/10 hover:bg-white/20'"
            :aria-label="call.media.screen ? 'Stop presenting' : 'Share your screen'"
            :title="call.media.screen ? 'Stop presenting' : 'Share screen'"
            @click="run(call.toggleScreenShare)"
          >
            <MonitorX v-if="call.media.screen" class="size-5" />
            <MonitorUp v-else class="size-5" />
          </button>
          <button
            type="button"
            class="flex size-11 items-center justify-center rounded-full bg-white/10 transition-colors hover:bg-white/20"
            :aria-label="panelOpen ? 'Hide updates panel' : 'Show updates panel'"
            :title="panelOpen ? 'Hide panel' : 'Updates, people and notes'"
            @click="panelOpen = !panelOpen"
          >
            <PanelRightClose v-if="panelOpen" class="size-5" />
            <PanelRightOpen v-else class="size-5" />
          </button>
          <button type="button" class="ml-2 flex h-11 items-center gap-2 rounded-full bg-red-600 px-5 text-sm font-semibold transition-colors hover:bg-red-600/90" @click="leave">
            <PhoneOff class="size-5" /> Leave
          </button>
          <button
            v-if="meeting.canManage"
            type="button"
            class="flex h-11 items-center gap-2 rounded-full border border-red-400/50 px-4 text-sm font-medium text-red-300 transition-colors hover:bg-red-500/15"
            @click="endForEveryone"
          >
            <SquareX class="size-4" /> End for everyone
          </button>
        </footer>
      </div>

      <aside
        v-if="panelOpen"
        class="flex min-h-0 shrink-0 flex-col border-l border-white/10"
        :class="isDesktop ? 'w-[340px]' : 'fixed inset-x-0 bottom-0 z-40 h-[60vh] w-full rounded-t-2xl shadow-2xl'"
      >
        <MeetingPanel v-model:tab="panelTab" :meeting="meeting" :updates="updates" @posted="onPosted" @removed="onRemoved" @notes="onNotes" />
      </aside>
    </div>

    <!-- Lobby, or the summary of a meeting that is over -->
    <div v-else-if="meeting" class="min-h-0 flex-1 overflow-y-auto">
      <div class="grid w-full gap-5 lg:grid-cols-[1.6fr_1fr]" :class="isDesktop ? 'p-5' : 'p-3'">
        <div class="space-y-4">
          <button type="button" class="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground" @click="router.push({ name: 'meetings' })">
            <ArrowLeft class="size-4" /> All meetings
          </button>

          <template v-if="canJoin">
            <div class="relative overflow-hidden bg-[#0d1017] p-2 shadow-soft">
              <VideoTile
                :stream="call.localStream.value"
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
              </div>
            </div>
            <p v-if="call.deviceNote.value" class="border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-amber-700 dark:text-warning">{{ call.deviceNote.value }}</p>

            <div class="flex flex-wrap items-center gap-3 border border-border/70 bg-card p-4 shadow-soft">
              <div class="min-w-0 flex-1">
                <p class="text-sm font-semibold">{{ call.status.value === 'left' ? 'You left the call' : 'Ready to join?' }}</p>
                <p class="text-xs text-muted-foreground">
                  <template v-if="meeting.inCall.length">{{ meeting.inCall.length }} {{ meeting.inCall.length === 1 ? 'person is' : 'people are' }} in the call now.</template>
                  <template v-else>No one is in the call yet. You can start it.</template>
                </p>
              </div>
              <UserAvatarStack
                v-if="meeting.inCall.length"
                :users="[...(meeting.host ? [meeting.host] : []), ...meeting.participants].filter((person, index, all) => meeting!.inCall.includes(person.id) && all.findIndex((item) => item.id === person.id) === index)"
                :max="5"
              />
              <Button variant="brand" size="lg" :loading="isJoining" @click="call.status.value === 'left' ? rejoin() : join()">
                <Video /> {{ call.status.value === 'left' ? 'Rejoin' : meeting.status === 'live' ? 'Join now' : 'Start the call' }}
              </Button>
            </div>
          </template>

          <div v-else class="flex flex-col items-center gap-2 border border-border/70 bg-card px-6 py-12 text-center shadow-soft">
            <span class="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground"><VideoOff class="size-6" /></span>
            <p class="font-semibold">{{ meeting.status === 'cancelled' ? 'This meeting was cancelled' : 'This meeting has ended' }}</p>
            <p class="max-w-sm text-sm text-muted-foreground">
              {{ meeting.status === 'cancelled' ? 'It was removed from everyone’s calendar.' : 'The updates people shared and the host’s notes are kept here.' }}
            </p>
            <Button v-if="meeting.canManage" variant="ghost" size="sm" class="mt-2 text-destructive" @click="remove"><Trash2 /> Delete meeting</Button>
          </div>
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
              <div v-if="meeting.host" class="flex items-center gap-2 text-muted-foreground"><UserAvatar :user="meeting.host" size="xs" /> Hosted by {{ meeting.host.name }}</div>
            </dl>
            <p v-if="meeting.agenda" class="border-t border-border/60 pt-3 text-sm whitespace-pre-wrap">{{ meeting.agenda }}</p>
          </section>

          <section class="flex h-[460px] min-h-0 flex-col overflow-hidden border border-border/70 shadow-soft">
            <MeetingPanel v-model:tab="panelTab" :meeting="meeting" :updates="updates" @posted="onPosted" @removed="onRemoved" @notes="onNotes" />
          </section>
        </div>
      </div>
    </div>
  </div>
</template>

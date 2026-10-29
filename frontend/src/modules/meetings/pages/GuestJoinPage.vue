<script setup lang="ts">
import { format, parseISO } from 'date-fns'
import { CalendarDays, DoorOpen, LoaderCircle, Mic, MicOff, Sparkles, Video, VideoOff } from 'lucide-vue-next'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import BrandMark from '@/components/layout/BrandMark.vue'
import UserAvatar from '@/components/common/UserAvatar.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { useDevice } from '@/composables/useDevice'
import { assetUrl, getErrorMessage } from '@/lib/http'
import { connectGuestRealtime, connectRealtime, disconnectRealtime } from '@/lib/realtime'
import { useAuthStore } from '@/modules/auth/auth.store'
import CallView from '../components/CallView.vue'
import GuestPanel from '../components/GuestPanel.vue'
import VideoTile from '../components/VideoTile.vue'
import { type GuestLinkInfo, meetingsApi } from '../meetings.api'
import { type CallUser, blurSupported, useMeetingCall } from '../useMeetingCall'

/**
 * Where people outside the organization land with a meeting's guest link: they give their name, check camera and
 * microphone, and ask to join. Someone in the call lets them in.
 */
const props = defineProps<{ token: string }>()

const NAME_KEY = 'vector.guestName'
const auth = useAuthStore()
const call = useMeetingCall()
const { isDesktop } = useDevice()

const info = ref<GuestLinkInfo | null>(null)
const problem = ref<string | null>(null)
const isLoading = ref(true)
const isAsking = ref(false)
const name = ref(auth.user?.name ?? localStorage.getItem(NAME_KEY) ?? '')
const guest = ref<CallUser | null>(null)
const panelOpen = ref(isDesktop.value)
const ended = ref<string | null>(null)

const inCall = computed(() => call.inCall.value && call.meetingId.value === info.value?.meeting.id)
const waiting = computed(() => call.status.value === 'waiting')
/** Signed-in members of this organization join as themselves, not as guests. */
const memberOf = computed(() => auth.organizations.find((organization) => organization.id === info.value?.organization.id) ?? null)
const previewUser = computed<CallUser>(() => guest.value ?? { id: 'guest', name: name.value.trim() || 'Guest', email: '', avatarColor: '#0ea5e9', avatarUrl: null })

async function run(action: () => Promise<unknown>) {
  try {
    await action()
  } catch (error) {
    toast.error(getErrorMessage(error))
  }
}

onMounted(async () => {
  try {
    info.value = await meetingsApi.guestLink(props.token)
    if (info.value.joinable) await call.startPreview()
  } catch (error) {
    problem.value = getErrorMessage(error, 'This meeting link does not work.')
  } finally {
    isLoading.value = false
  }
})

function connected(socket: ReturnType<typeof connectGuestRealtime>) {
  return new Promise<void>((resolve, reject) => {
    if (socket.connected) return resolve()
    const timer = setTimeout(() => reject(new Error('Could not reach the meeting. Check your connection.')), 10_000)
    socket.once('connect', () => {
      clearTimeout(timer)
      resolve()
    })
    socket.once('connect_error', () => {
      clearTimeout(timer)
      reject(new Error('Could not reach the meeting. Check your connection.'))
    })
  })
}

async function ask() {
  const chosen = name.value.trim()
  if (chosen.length < 2) return toast.error('Enter your name so people know who is asking')
  isAsking.value = true
  ended.value = null
  try {
    localStorage.setItem(NAME_KEY, chosen)
    const pass = await meetingsApi.joinAsGuest(props.token, chosen)
    info.value = pass
    guest.value = { id: pass.guest.id, name: pass.guest.name, email: '', avatarColor: '#0ea5e9', avatarUrl: null, title: 'Guest' }
    const socket = connectGuestRealtime(pass.token)
    await connected(socket)
    await call.join(pass.meeting.id, { user: guest.value, title: pass.meeting.title, guest: true, iceServers: pass.ice.iceServers })
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    isAsking.value = false
  }
}

function stopGuestConnection() {
  disconnectRealtime()
  if (auth.isAuthenticated) connectRealtime()
}

function leave() {
  call.leave()
  ended.value = 'You left the call.'
  stopGuestConnection()
  void call.startPreview()
}

watch(
  () => call.callError.value,
  (message) => {
    if (!message) return
    toast.error(message)
    call.callError.value = null
  },
)
watch(
  () => call.closedReason.value,
  (reason) => {
    if (!reason) return
    ended.value = reason === 'cancelled' ? 'The meeting was cancelled.' : 'The host ended the meeting.'
    call.closedReason.value = null
    stopGuestConnection()
  },
)

onBeforeUnmount(() => {
  if (call.isGuest.value) {
    call.leave()
    stopGuestConnection()
  }
  call.stopPreview()
  call.reset()
})

const startsLabel = computed(() => (info.value ? format(parseISO(info.value.meeting.startsAt), 'EEEE d MMMM, HH:mm') : ''))
</script>

<template>
  <div class="flex min-h-dvh flex-col bg-background">
    <CallView v-if="inCall && info" v-model:panel-open="panelOpen" class="h-dvh" :title="info.meeting.title" @leave="leave">
      <template #panel><GuestPanel /></template>
    </CallView>

    <template v-else>
      <header class="flex items-center gap-3 border-b border-border/70 px-5 py-3">
        <span class="flex items-center gap-2.5">
          <span class="relative flex size-8 shrink-0 items-center justify-center overflow-hidden bg-brand text-white shadow-glow">
            <BrandMark class="relative size-[22px]" />
          </span>
          <span class="text-[17px] font-semibold tracking-tight">Vector</span>
        </span>
        <span v-if="info" class="ml-auto flex items-center gap-2 text-sm text-muted-foreground">
          <img v-if="info.organization.logoUrl" :src="assetUrl(info.organization.logoUrl)" alt="" class="size-6 object-contain" />
          {{ info.organization.name }}
        </span>
      </header>

      <main class="mx-auto grid w-full max-w-5xl flex-1 content-center gap-6 p-5 lg:grid-cols-[1.4fr_1fr]">
        <template v-if="isLoading">
          <Skeleton class="aspect-video w-full" />
          <Skeleton class="h-64 w-full" />
        </template>

        <div v-else-if="problem" class="col-span-full flex flex-col items-center gap-2 py-16 text-center">
          <span class="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground"><VideoOff class="size-6" /></span>
          <p class="font-semibold">{{ problem }}</p>
        </div>

        <template v-else-if="info">
          <div class="space-y-3">
            <div class="relative overflow-hidden bg-[#0d1017] p-2 shadow-soft">
              <VideoTile :stream="call.selfStream.value" :user="previewUser" label="You" :audio="call.media.audio" :video="call.media.video" :revision="call.localRevision.value" self />
              <div v-if="info.joinable" class="absolute inset-x-0 bottom-5 flex justify-center gap-2">
                <button
                  type="button"
                  class="flex size-11 items-center justify-center rounded-full text-white backdrop-blur transition-colors"
                  :class="call.media.audio ? 'bg-white/15 hover:bg-white/25' : 'bg-red-500 hover:bg-red-500/90'"
                  :aria-label="call.media.audio ? 'Mute microphone' : 'Unmute microphone'"
                  @click="run(call.toggleAudio)"
                >
                  <Mic v-if="call.media.audio" class="size-5" />
                  <MicOff v-else class="size-5" />
                </button>
                <button
                  type="button"
                  class="flex size-11 items-center justify-center rounded-full text-white backdrop-blur transition-colors"
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
                  @click="run(call.toggleBlur)"
                >
                  <Sparkles class="size-5" />
                </button>
              </div>
            </div>
            <p v-if="call.deviceNote.value" class="border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-amber-700 dark:text-warning">{{ call.deviceNote.value }}</p>
          </div>

          <section class="space-y-4 border border-border/70 bg-card p-5 shadow-soft">
            <div class="space-y-1">
              <p class="text-xs font-semibold tracking-wider text-brand uppercase">You are invited</p>
              <h1 class="text-xl font-semibold">{{ info.meeting.title }}</h1>
              <p class="flex items-center gap-1.5 text-sm text-muted-foreground"><CalendarDays class="size-4" /> {{ startsLabel }}</p>
              <p v-if="info.meeting.host" class="flex items-center gap-1.5 text-sm text-muted-foreground">
                <UserAvatar :user="{ id: 'host', email: '', ...info.meeting.host }" size="xs" /> Hosted by {{ info.meeting.host.name }}
              </p>
            </div>

            <p v-if="!info.joinable" class="border border-border/70 bg-muted/40 px-3 py-2 text-sm">{{ info.reason }}</p>

            <div v-else-if="waiting" class="flex flex-col items-center gap-3 py-4 text-center">
              <LoaderCircle class="size-8 animate-spin text-primary" />
              <p class="font-medium">Waiting for someone to let you in…</p>
              <p class="text-xs text-muted-foreground">The people in the call have been told you are here.</p>
              <Button variant="ghost" size="sm" @click="leave">Cancel</Button>
            </div>

            <template v-else>
              <p v-if="ended" class="border border-border/70 bg-muted/40 px-3 py-2 text-sm">{{ ended }}</p>
              <div v-if="memberOf && auth.user" class="space-y-2">
                <p class="text-sm text-muted-foreground">You are a member of {{ info.organization.name }}.</p>
                <Button variant="brand" class="w-full" @click="auth.switchOrganization(memberOf.id, `/meetings/${info.meeting.id}?join=1`)">
                  <Video /> Join as {{ auth.user.name }}
                </Button>
              </div>
              <form v-else class="space-y-3" @submit.prevent="ask">
                <label class="grid gap-1.5 text-sm font-medium" for="guest-name">
                  Your name
                  <Input id="guest-name" v-model="name" maxlength="60" placeholder="How others will see you" autocomplete="name" />
                </label>
                <Button type="submit" variant="brand" class="w-full" :loading="isAsking"><DoorOpen /> {{ ended ? 'Ask to join again' : 'Ask to join' }}</Button>
                <p class="text-xs text-muted-foreground">You join as a guest. Check your camera and microphone in the preview before you ask.</p>
              </form>
            </template>
          </section>
        </template>
      </main>
    </template>
  </div>
</template>

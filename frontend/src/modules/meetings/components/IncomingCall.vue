<script setup lang="ts">
import { Phone, PhoneOff } from 'lucide-vue-next'
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import UserAvatar from '@/components/common/UserAvatar.vue'
import { getSocket } from '@/lib/realtime'
import type { UserSummary } from '@/types/models'
import { usePushNotifications } from '../call/usePushNotifications'
import { useMeetingCall } from '../useMeetingCall'

interface Ring {
  meeting: { id: string; title: string }
  caller: Pick<UserSummary, 'id' | 'name' | 'avatarUrl' | 'avatarColor'>
  url: string
}

/**
 * Rings when someone starts a call you are invited to: a card with Join and Dismiss and a ringtone, for 30 seconds.
 * Hosts are also told here when a guest waits to be let in.
 */
const RING_MS = 30_000
const router = useRouter()
const call = useMeetingCall()
const push = usePushNotifications()
const ringing = ref<Ring | null>(null)
let timeout: ReturnType<typeof setTimeout> | null = null
let tone: { context: AudioContext; timer: ReturnType<typeof setInterval> } | null = null

function startTone() {
  stopTone()
  try {
    const context = new AudioContext()
    const beep = (at: number, frequency: number) => {
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      oscillator.frequency.value = frequency
      gain.gain.setValueAtTime(0, at)
      gain.gain.linearRampToValueAtTime(0.12, at + 0.02)
      gain.gain.linearRampToValueAtTime(0, at + 0.35)
      oscillator.connect(gain).connect(context.destination)
      oscillator.start(at)
      oscillator.stop(at + 0.4)
    }
    const ring = () => {
      const start = context.currentTime + 0.05
      beep(start, 880)
      beep(start + 0.45, 660)
    }
    void context.resume().then(ring)
    tone = { context, timer: setInterval(ring, 2000) }
  } catch {
    tone = null
  }
}

function stopTone() {
  if (!tone) return
  clearInterval(tone.timer)
  void tone.context.close().catch(() => undefined)
  tone = null
}

function dismiss() {
  stopTone()
  if (timeout) clearTimeout(timeout)
  timeout = null
  ringing.value = null
}

function answer() {
  const target = ringing.value
  dismiss()
  if (target) void router.push(`${target.url}${target.url.includes('?') ? '&' : '?'}join=1`)
}

const onRing = (card: Ring) => {
  if (call.meetingId.value === card.meeting.id && (call.inCall.value || call.status.value === 'joining')) return
  dismiss()
  ringing.value = card
  startTone()
  timeout = setTimeout(dismiss, RING_MS)
}
const onChanged = ({ id, status }: { id: string; status: string }) => {
  if (ringing.value?.meeting.id === id && status !== 'live') dismiss()
}
const onKnock = ({ meeting, name, url }: { meeting: { id: string; title: string }; name: string; url: string }) => {
  if (call.inCall.value && call.meetingId.value === meeting.id) return
  toast(`${name} is waiting to join “${meeting.title}”`, {
    description: 'Join the call to let them in.',
    duration: 15_000,
    action: { label: 'Join', onClick: () => void router.push(`${url}?join=1`) },
  })
}

onMounted(() => {
  const socket = getSocket()
  socket?.on('meeting:ringing', onRing)
  socket?.on('meeting:changed', onChanged)
  socket?.on('meeting:knock', onKnock)
  void push.sync().catch(() => undefined)
})
onBeforeUnmount(() => {
  const socket = getSocket()
  socket?.off('meeting:ringing', onRing)
  socket?.off('meeting:changed', onChanged)
  socket?.off('meeting:knock', onKnock)
  dismiss()
})
</script>

<template>
  <Transition
    enter-active-class="transition duration-200"
    enter-from-class="translate-y-3 opacity-0"
    leave-active-class="transition duration-150"
    leave-to-class="translate-y-3 opacity-0"
  >
    <div
      v-if="ringing"
      class="fixed top-4 left-1/2 z-[80] flex w-[min(24rem,calc(100%-2rem))] -translate-x-1/2 items-center gap-3 rounded-2xl bg-[#0d1017] p-3 text-white shadow-2xl ring-1 ring-white/10"
      role="alertdialog"
      aria-live="assertive"
      :aria-label="`${ringing.caller.name} is calling`"
    >
      <span class="relative">
        <span class="absolute inset-0 animate-ping rounded-full bg-emerald-400/40" />
        <UserAvatar :user="{ ...ringing.caller, email: '' }" size="lg" class="relative" />
      </span>
      <div class="min-w-0 flex-1">
        <p class="truncate text-sm font-semibold">{{ ringing.caller.name }} started a call</p>
        <p class="truncate text-xs text-white/70">{{ ringing.meeting.title }}</p>
      </div>
      <button type="button" class="flex size-10 items-center justify-center rounded-full bg-red-600 hover:bg-red-600/90" aria-label="Dismiss" title="Dismiss" @click="dismiss">
        <PhoneOff class="size-4" />
      </button>
      <button type="button" class="flex size-10 items-center justify-center rounded-full bg-emerald-500 hover:bg-emerald-500/90" aria-label="Join the call" title="Join" @click="answer">
        <Phone class="size-4" />
      </button>
    </div>
  </Transition>
</template>

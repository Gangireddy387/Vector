<script setup lang="ts">
import { PhoneOff, Video } from 'lucide-vue-next'
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import UserAvatar from '@/components/common/UserAvatar.vue'
import { useSocketEvents } from '@/lib/socket-events'
import { startRingtone } from '@/lib/sounds'
import type { UserSummary } from '@/types/models'
import { usePushNotifications } from '../call/usePushNotifications'
import { useMeetingCall } from '../useMeetingCall'

interface Ring {
  meeting: { id: string; title: string }
  caller: Pick<UserSummary, 'id' | 'name' | 'avatarUrl' | 'avatarColor'>
  url: string
}

/**
 * Rings when someone starts a call you are invited to: a card in the middle of the screen with Join and Decline and
 * the person's ringtone (chosen in Settings), for 30 seconds. Hosts are also told here when a guest waits to be let in.
 */
const RING_MS = 30_000

const router = useRouter()
const call = useMeetingCall()
const push = usePushNotifications()
const ringing = ref<Ring | null>(null)
let timeout: ReturnType<typeof setTimeout> | null = null
let stopRingtone: (() => void) | null = null

function startTone() {
  stopTone()
  stopRingtone = startRingtone()
}

function stopTone() {
  stopRingtone?.()
  stopRingtone = null
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
const onKey = (event: KeyboardEvent) => {
  if (ringing.value && event.key === 'Escape') dismiss()
}

useSocketEvents({ 'meeting:ringing': onRing, 'meeting:changed': onChanged, 'meeting:knock': onKnock })
onMounted(() => {
  window.addEventListener('keydown', onKey)
  void push.sync().catch(() => undefined)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  dismiss()
})
</script>

<template>
  <Transition
    enter-active-class="transition duration-300 ease-out"
    enter-from-class="opacity-0 [&>div]:scale-95"
    leave-active-class="transition duration-200 ease-in"
    leave-to-class="opacity-0 [&>div]:scale-95"
  >
    <div v-if="ringing" class="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm">
      <div
        class="relative w-full max-w-sm overflow-hidden rounded-3xl bg-gradient-to-b from-[#1c2233] to-[#0d1017] px-6 pt-8 pb-7 text-center text-white shadow-2xl ring-1 ring-white/10 transition-transform duration-300"
        role="alertdialog"
        aria-live="assertive"
        :aria-label="`${ringing.caller.name} is calling`"
      >
        <div class="pointer-events-none absolute inset-x-0 -top-28 mx-auto size-72 rounded-full bg-emerald-500/25 blur-3xl" />

        <p class="relative inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold tracking-[0.18em] text-emerald-300 uppercase">
          <span class="size-1.5 animate-pulse rounded-full bg-emerald-400" /> Incoming call
        </p>

        <div class="relative mx-auto mt-7 flex size-28 items-center justify-center">
          <span class="ripple absolute inset-0 rounded-full border-2 border-emerald-400/70" />
          <span class="ripple absolute inset-0 rounded-full border-2 border-emerald-400/70 [animation-delay:0.9s]" />
          <span class="ripple absolute inset-0 rounded-full border-2 border-emerald-400/70 [animation-delay:1.8s]" />
          <UserAvatar :user="{ ...ringing.caller, email: '' }" size="xl" class="relative size-24 text-3xl ring-4 ring-white/15" />
        </div>

        <p class="relative mt-6 truncate text-xl font-semibold">{{ ringing.caller.name }}</p>
        <p class="relative mt-1 truncate text-sm text-white/60">is calling you to “{{ ringing.meeting.title }}”</p>

        <div class="relative mt-8 flex items-start justify-center gap-14">
          <button type="button" class="group flex flex-col items-center gap-2 text-xs font-medium text-white/75" @click="dismiss">
            <span class="flex size-16 items-center justify-center rounded-full bg-red-500 shadow-lg shadow-red-500/30 transition-transform group-hover:scale-105 group-active:scale-95">
              <PhoneOff class="size-6" />
            </span>
            Decline
          </button>
          <button type="button" class="group flex flex-col items-center gap-2 text-xs font-medium text-white/75" @click="answer">
            <span class="answer flex size-16 items-center justify-center rounded-full bg-emerald-500 shadow-lg shadow-emerald-500/40 transition-transform group-hover:scale-105 group-active:scale-95">
              <Video class="size-6" />
            </span>
            Join
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.ripple {
  animation: ripple 2.7s ease-out infinite;
}
@keyframes ripple {
  0% {
    transform: scale(0.9);
    opacity: 0.9;
  }
  100% {
    transform: scale(1.9);
    opacity: 0;
  }
}
.answer {
  animation: nudge 1.3s ease-in-out infinite;
}
@keyframes nudge {
  0%,
  60%,
  100% {
    transform: rotate(0deg);
  }
  70% {
    transform: rotate(-12deg);
  }
  80% {
    transform: rotate(12deg);
  }
  90% {
    transform: rotate(-6deg);
  }
}
</style>

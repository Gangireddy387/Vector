<script setup lang="ts">
import { Hand, LoaderCircle, MicOff, MonitorUp, WifiOff } from 'lucide-vue-next'
import { computed, onMounted, useTemplateRef, watch } from 'vue'
import UserAvatar from '@/components/common/UserAvatar.vue'
import type { UserSummary } from '@/types/models'
import { useMeetingCall, type PeerConnection } from '../useMeetingCall'

/**
 * One person in the call: their video, or their photo while the camera is off. Sound plays separately (CallAudio),
 * so it keeps playing when this tile is not on screen.
 */
const props = withDefaults(
  defineProps<{
    id?: string
    stream: MediaStream | null
    user: UserSummary | null
    label: string
    audio: boolean
    video: boolean
    screen?: boolean
    self?: boolean
    revision?: number
    connection?: PeerConnection
    hand?: number | null
    speaking?: boolean
    guest?: boolean
    compact?: boolean
  }>(),
  { id: undefined, hand: null, speaking: false, guest: false, compact: false },
)

const call = useMeetingCall()
const element = useTemplateRef<HTMLVideoElement>('video')
function attach() {
  const video = element.value
  if (!video) return
  if (video.srcObject !== props.stream) video.srcObject = props.stream
  else if (props.stream) {
    // Same stream with a new or resumed track: re-assigning makes every browser pick it up.
    video.srcObject = null
    video.srcObject = props.stream
  }
  if (props.stream) void video.play().catch(() => undefined)
}
onMounted(attach)
watch(() => [props.stream, props.revision] as const, attach)

const showsVideo = computed(() => Boolean((props.video || props.screen) && props.stream?.getVideoTracks().some((track) => track.readyState === 'live')))
const network = computed(() => {
  if (props.self || !props.connection) return null
  if (props.connection === 'failed') return { label: 'Can’t connect', icon: WifiOff }
  if (props.connection === 'disconnected') return { label: 'Reconnecting…', icon: LoaderCircle }
  if ((props.connection === 'new' || props.connection === 'connecting') && !props.stream) return { label: 'Connecting…', icon: LoaderCircle }
  return null
})
const floating = computed(() => (props.id ? call.reactions.value.filter((reaction) => reaction.tileId === props.id) : []))

defineExpose({ video: element })
</script>

<template>
  <div
    class="relative flex aspect-video min-h-0 items-center justify-center overflow-hidden rounded-xl bg-[#1f2330] ring-1 transition-shadow"
    :class="speaking && audio ? 'ring-2 ring-emerald-400 shadow-[0_0_0_3px_rgba(52,211,153,0.25)]' : 'ring-white/5'"
  >
    <video
      v-show="showsVideo"
      ref="video"
      class="size-full object-cover"
      :class="[self && !screen && 'scale-x-[-1]', screen && 'bg-black object-contain']"
      autoplay
      playsinline
      muted
    />
    <div v-if="!showsVideo" class="flex flex-col items-center gap-2">
      <UserAvatar :user="user" size="xl" :class="compact ? 'size-12 text-base ring-2 ring-white/10' : 'size-20 text-2xl ring-4 ring-white/10'" />
    </div>
    <div v-if="network" class="absolute inset-x-0 top-2 flex justify-center">
      <span class="inline-flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur">
        <component :is="network.icon" class="size-3.5" :class="network.icon === LoaderCircle && 'animate-spin'" /> {{ network.label }}
      </span>
    </div>
    <span
      v-if="hand"
      class="absolute top-2 left-2 flex items-center gap-1 rounded-full bg-amber-400 px-2 py-1 text-[11px] font-semibold text-amber-950 shadow-lg"
      title="Hand raised"
    >
      <Hand class="size-3.5" /><span v-if="!compact">Hand raised</span>
    </span>
    <div class="absolute bottom-2 left-2 flex max-w-[85%] items-center gap-1.5 rounded-md bg-black/55 px-2 py-1 text-xs font-medium text-white backdrop-blur">
      <MonitorUp v-if="screen" class="size-3.5 shrink-0 text-sky-300" />
      <span class="truncate">{{ label }}</span>
    </div>
    <span v-if="!audio" class="absolute top-2 right-2 flex size-7 items-center justify-center rounded-full bg-red-500/90 text-white" title="Muted">
      <MicOff class="size-3.5" />
    </span>
    <div class="pointer-events-none absolute inset-x-0 bottom-8 flex justify-center">
      <span v-for="reaction in floating" :key="reaction.key" class="reaction-float absolute text-4xl drop-shadow-lg">{{ reaction.emoji }}</span>
    </div>
  </div>
</template>

<style scoped>
.reaction-float {
  animation: reaction-rise 4s ease-out forwards;
}
@keyframes reaction-rise {
  0% {
    opacity: 0;
    transform: translateY(10px) scale(0.6);
  }
  12% {
    opacity: 1;
    transform: translateY(0) scale(1.15);
  }
  80% {
    opacity: 1;
  }
  100% {
    opacity: 0;
    transform: translateY(-120px) scale(1);
  }
}
</style>

<script setup lang="ts">
import { LoaderCircle, MicOff, MonitorUp, WifiOff } from 'lucide-vue-next'
import { computed, onMounted, useTemplateRef, watch } from 'vue'
import UserAvatar from '@/components/common/UserAvatar.vue'
import type { UserSummary } from '@/types/models'
import type { PeerConnection } from '../useMeetingCall'

/** One person in the call: their video, or their photo while the camera is off. Remote audio plays from here too. */
const props = defineProps<{
  stream: MediaStream | null
  user: UserSummary | null
  label: string
  audio: boolean
  video: boolean
  screen?: boolean
  self?: boolean
  revision?: number
  connection?: PeerConnection
}>()

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
</script>

<template>
  <div class="relative flex aspect-video min-h-0 items-center justify-center overflow-hidden rounded-xl bg-[#1f2330] ring-1 ring-white/5">
    <video
      v-show="showsVideo"
      ref="video"
      class="size-full object-cover"
      :class="[self && !screen && 'scale-x-[-1]', screen && 'bg-black object-contain']"
      autoplay
      playsinline
      :muted="self"
    />
    <div v-if="!showsVideo" class="flex flex-col items-center gap-2">
      <UserAvatar :user="user" size="xl" class="size-20 text-2xl ring-4 ring-white/10" />
    </div>
    <div v-if="network" class="absolute inset-x-0 top-2 flex justify-center">
      <span class="inline-flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur">
        <component :is="network.icon" class="size-3.5" :class="network.icon === LoaderCircle && 'animate-spin'" /> {{ network.label }}
      </span>
    </div>
    <div class="absolute bottom-2 left-2 flex max-w-[85%] items-center gap-1.5 rounded-md bg-black/55 px-2 py-1 text-xs font-medium text-white backdrop-blur">
      <MonitorUp v-if="screen" class="size-3.5 shrink-0 text-sky-300" />
      <span class="truncate">{{ label }}</span>
    </div>
    <span v-if="!audio" class="absolute top-2 right-2 flex size-7 items-center justify-center rounded-full bg-red-500/90 text-white" title="Muted">
      <MicOff class="size-3.5" />
    </span>
  </div>
</template>

<script setup lang="ts">
import { ChevronDown, ChevronUp, Hand, Maximize2, Mic, MicOff, PhoneOff, PictureInPicture2, Video, VideoOff } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import UserAvatar from '@/components/common/UserAvatar.vue'
import { useCallTiles } from '../call/tiles'
import { usePictureInPicture } from '../call/usePictureInPicture'
import { useMeetingCall } from '../useMeetingCall'
import VideoTile from './VideoTile.vue'

/**
 * The call while its page is closed: a small window in the corner (`floating`) or the pop-out window that stays on
 * top of other apps (`pip`). It shows who is talking or presenting, with the main buttons.
 */
const props = defineProps<{ variant: 'floating' | 'pip' }>()

const call = useMeetingCall()
const route = useRoute()
const router = useRouter()
const pip = usePictureInPicture()
const { tiles, featured } = useCallTiles()
const minimized = ref(false)

const onCallPage = computed(
  () => (route.name === 'meeting-room' && route.params.meetingId === call.meetingId.value) || route.name === 'meeting-guest',
)
const visible = computed(() => props.variant === 'pip' || (call.inCall.value && !onCallPage.value && !pip.pipWindow.value))
const others = computed(() => tiles.value.filter((tile) => tile.id !== featured.value.id).slice(0, 5))

async function run(action: () => unknown) {
  try {
    await action()
  } catch (error) {
    toast.error(error instanceof Error ? error.message : 'That did not work')
  }
}

function backToCall() {
  if (props.variant === 'pip') {
    window.focus()
    pip.close()
  }
  if (call.meetingId.value) void router.push({ name: 'meeting-room', params: { meetingId: call.meetingId.value } })
}

const button = 'flex size-9 items-center justify-center rounded-full transition-colors'
const idle = 'bg-white/10 hover:bg-white/20'
</script>

<template>
  <div
    v-if="visible && call.inCall.value"
    class="flex flex-col overflow-hidden bg-[#0d1017] text-white"
    :class="variant === 'pip' ? 'h-full' : 'fixed right-3 bottom-20 z-50 w-72 rounded-2xl shadow-2xl ring-1 ring-white/10 lg:right-4 lg:bottom-4'"
    role="region"
    aria-label="Current call"
  >
    <header class="flex items-center gap-2 px-3 py-2">
      <span class="relative flex size-2"><span class="absolute inline-flex size-full animate-ping rounded-full bg-red-500 opacity-75" /><span class="relative inline-flex size-2 rounded-full bg-red-500" /></span>
      <p class="min-w-0 flex-1 truncate text-xs font-semibold">{{ call.roomName.value ? `${call.roomName.value} · ` : '' }}{{ call.title.value || 'Meeting' }}</p>
      <button v-if="variant === 'floating'" type="button" class="rounded p-1 text-white/70 hover:bg-white/10 hover:text-white" :aria-label="minimized ? 'Show video' : 'Hide video'" @click="minimized = !minimized">
        <ChevronUp v-if="minimized" class="size-4" />
        <ChevronDown v-else class="size-4" />
      </button>
      <button type="button" class="rounded p-1 text-white/70 hover:bg-white/10 hover:text-white" aria-label="Back to the call" title="Back to the call" @click="backToCall">
        <Maximize2 class="size-4" />
      </button>
    </header>

    <div v-if="!minimized" class="relative min-h-0 px-2" :class="variant === 'pip' && 'flex-1'">
      <VideoTile :data-tile-id="featured.id" v-bind="featured" compact :class="variant === 'pip' && 'h-full !aspect-auto'" />
      <div v-if="others.length" class="absolute top-2 right-4 flex -space-x-1.5">
        <span v-for="tile in others" :key="tile.id" class="relative rounded-full ring-2" :class="tile.speaking && tile.audio ? 'ring-emerald-400' : 'ring-[#0d1017]'">
          <UserAvatar :user="tile.user" size="sm" />
          <Hand v-if="tile.hand" class="absolute -right-1 -bottom-1 size-3 rounded-full bg-amber-400 p-px text-amber-950" />
        </span>
      </div>
    </div>

    <footer class="flex items-center justify-center gap-1.5 px-3 py-2">
      <button type="button" :class="[button, call.media.audio ? idle : 'bg-red-500 hover:bg-red-500/90']" :aria-label="call.media.audio ? 'Mute' : 'Unmute'" @click="run(call.toggleAudio)">
        <Mic v-if="call.media.audio" class="size-4" />
        <MicOff v-else class="size-4" />
      </button>
      <button
        type="button"
        :class="[button, call.media.video ? idle : 'bg-red-500 hover:bg-red-500/90']"
        :aria-label="call.media.video ? 'Camera off' : 'Camera on'"
        @click="run(call.toggleVideo)"
      >
        <Video v-if="call.media.video" class="size-4" />
        <VideoOff v-else class="size-4" />
      </button>
      <button
        type="button"
        :class="[button, call.hand.value ? 'bg-amber-400 text-amber-950 hover:bg-amber-400/90' : idle]"
        :aria-label="call.hand.value ? 'Lower hand' : 'Raise hand'"
        @click="call.toggleHand()"
      >
        <Hand class="size-4" />
      </button>
      <button
        v-if="variant === 'floating' && pip.supported"
        type="button"
        :class="[button, idle]"
        aria-label="Pop out the call"
        title="Keep the call on top of other windows"
        @click="run(() => pip.open(featured.id))"
      >
        <PictureInPicture2 class="size-4" />
      </button>
      <button type="button" class="ml-1 flex h-9 items-center gap-1.5 rounded-full bg-red-600 px-3 text-xs font-semibold hover:bg-red-600/90" @click="call.leave()">
        <PhoneOff class="size-4" /> Leave
      </button>
    </footer>
  </div>
</template>

<script setup lang="ts">
import {
  Captions,
  CaptionsOff,
  Circle,
  DoorOpen,
  Ellipsis,
  Hand,
  Lock,
  LockOpen,
  Mic,
  MicOff,
  MonitorUp,
  MonitorX,
  PanelRightClose,
  PanelRightOpen,
  PhoneOff,
  PictureInPicture2,
  PenTool,
  Smile,
  Sparkles,
  SquareX,
  Video,
  VideoOff,
} from 'lucide-vue-next'
import { computed } from 'vue'
import { toast } from 'vue-sonner'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useConfirm } from '@/composables/useConfirm'
import { useCallTiles } from '../call/tiles'
import { usePictureInPicture } from '../call/usePictureInPicture'
import { type CallPermissions, REACTIONS, blurSupported, canShareScreen, captionsSupported, recordingSupported, useMeetingCall } from '../useMeetingCall'
import DeviceSettings from './DeviceSettings.vue'

/** The buttons under the call: devices, presenting, hand and reactions, whiteboard, rooms, and leaving. */
const props = withDefaults(defineProps<{ panelOpen?: boolean; canEnd?: boolean }>(), { panelOpen: false, canEnd: false })
const emit = defineEmits<{ panel: []; leave: []; end: []; breakouts: [] }>()

const call = useMeetingCall()
const pip = usePictureInPicture()
const { featured } = useCallTiles()

async function run(action: () => unknown) {
  try {
    await action()
  } catch (error) {
    toast.error(error instanceof Error ? error.message : 'That did not work')
  }
}

async function muteEveryone() {
  const muted = await call.muteEveryone()
  toast.success(muted ? `Muted ${muted} ${muted === 1 ? 'person' : 'people'}` : 'Everyone was already muted')
}

async function toggleLock() {
  const next = !call.locked.value
  await call.setLocked(next)
  toast.success(next ? 'Call locked. Nobody new can join.' : 'Call unlocked')
}

const confirm = useConfirm()
const isManager = computed(() => call.canManage.value && !call.isGuest.value)
const PERMISSION_LABELS: Array<{ key: keyof CallPermissions; label: string }> = [
  { key: 'unmute', label: 'Others can unmute themselves' },
  { key: 'share', label: 'Others can share their screen' },
  { key: 'chat', label: 'Others can chat' },
]
const setPermission = (key: keyof CallPermissions, value: boolean) => run(() => call.setPermissions({ [key]: value }))

async function toggleRecording() {
  if (call.recordingHere.value) return call.stopRecording()
  const ok = await confirm({
    title: 'Record this call?',
    description:
      'Everyone in the call is told it is being recorded. Your browser asks what to record: choose this tab. The recording is saved with the meeting when you stop, and everyone invited can watch it.',
    confirmLabel: 'Start recording',
  })
  if (ok) await call.startRecording()
}

async function toggleTranscription() {
  const on = !call.transcribing.value
  await call.setTranscribing(on)
  if (on && !captionsSupported) toast('Captions are on', { description: 'This browser cannot caption your own speech; use Chrome or Edge for that.' })
}

const round = 'flex size-11 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-40'
const idle = 'bg-white/10 hover:bg-white/20'
const badge = computed(() => (call.unreadChat.value > 9 ? '9+' : String(call.unreadChat.value)))
</script>

<template>
  <footer class="flex shrink-0 flex-wrap items-center justify-center gap-2 px-4 py-3">
    <button
      type="button"
      :class="[round, call.media.audio ? idle : 'bg-red-500 hover:bg-red-500/90']"
      :aria-label="call.media.audio ? 'Mute microphone' : 'Unmute microphone'"
      :title="call.media.audio ? 'Mute' : 'Unmute'"
      @click="run(call.toggleAudio)"
    >
      <Mic v-if="call.media.audio" class="size-5" />
      <MicOff v-else class="size-5" />
    </button>
    <button
      type="button"
      :class="[round, call.media.video ? idle : 'bg-red-500 hover:bg-red-500/90']"
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
      :class="[round, call.media.screen ? 'bg-sky-500 hover:bg-sky-500/90' : idle]"
      :aria-label="call.media.screen ? 'Stop presenting' : 'Share your screen'"
      :title="call.media.screen ? 'Stop presenting' : 'Share screen'"
      @click="run(call.toggleScreenShare)"
    >
      <MonitorX v-if="call.media.screen" class="size-5" />
      <MonitorUp v-else class="size-5" />
    </button>
    <button
      type="button"
      :class="[round, call.hand.value ? 'bg-amber-400 text-amber-950 hover:bg-amber-400/90' : idle]"
      :aria-label="call.hand.value ? 'Lower your hand' : 'Raise your hand'"
      :title="call.hand.value ? 'Lower hand' : 'Raise hand'"
      @click="call.toggleHand()"
    >
      <Hand class="size-5" />
    </button>
    <Popover>
      <PopoverTrigger as-child>
        <button type="button" :class="[round, idle]" aria-label="Send a reaction" title="React"><Smile class="size-5" /></button>
      </PopoverTrigger>
      <PopoverContent side="top" class="w-auto border-white/10 bg-[#1f2330] p-1.5">
        <div class="flex gap-0.5">
          <button
            v-for="emoji in REACTIONS"
            :key="emoji"
            type="button"
            class="flex size-10 items-center justify-center rounded-lg text-2xl transition-transform hover:scale-125 hover:bg-white/10"
            :aria-label="`React with ${emoji}`"
            @click="call.sendReaction(emoji)"
          >
            {{ emoji }}
          </button>
        </div>
      </PopoverContent>
    </Popover>
    <button
      type="button"
      :class="[round, call.boardOpen.value ? 'bg-sky-500 hover:bg-sky-500/90' : idle]"
      :aria-label="call.boardOpen.value ? 'Close the whiteboard' : 'Open the whiteboard'"
      :title="call.boardOpen.value ? 'Close whiteboard' : 'Whiteboard'"
      @click="call.setBoardOpen(!call.boardOpen.value)"
    >
      <PenTool class="size-5" />
    </button>
    <button
      v-if="call.transcribing.value"
      type="button"
      :class="[round, call.showCaptions.value ? 'bg-sky-500 hover:bg-sky-500/90' : idle]"
      :aria-label="call.showCaptions.value ? 'Hide captions' : 'Show captions'"
      :title="call.showCaptions.value ? 'Hide captions' : 'Show captions'"
      @click="call.toggleCaptionsView()"
    >
      <Captions v-if="call.showCaptions.value" class="size-5" />
      <CaptionsOff v-else class="size-5" />
    </button>
    <DeviceSettings :button-class="[round, idle].join(' ')" />
    <DropdownMenu>
      <DropdownMenuTrigger as-child>
        <button type="button" :class="[round, idle]" aria-label="More options" title="More"><Ellipsis class="size-5" /></button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="center" class="max-h-[70vh] w-64 overflow-y-auto">
        <DropdownMenuItem v-if="blurSupported" :disabled="call.blurBusy.value || !call.media.video" @select="run(call.toggleBlur)">
          <Sparkles /> {{ call.blurOn.value ? 'Turn off background blur' : 'Blur my background' }}
        </DropdownMenuItem>
        <DropdownMenuItem v-if="pip.supported" @select="run(() => pip.open(featured.id))"><PictureInPicture2 /> Pop out the call</DropdownMenuItem>
        <template v-if="isManager">
          <DropdownMenuSeparator />
          <DropdownMenuItem v-if="recordingSupported" :disabled="Boolean(call.recording.value && !call.recordingHere.value)" @select="run(toggleRecording)">
            <Circle :class="call.recordingHere.value ? 'fill-red-500 text-red-500' : ''" />
            {{ call.recordingHere.value ? 'Stop recording' : call.recording.value ? `${call.recording.value.by} is recording` : 'Record the call' }}
          </DropdownMenuItem>
          <DropdownMenuItem @select="run(toggleTranscription)">
            <Captions /> {{ call.transcribing.value ? 'Turn off live captions' : 'Turn on live captions' }}
          </DropdownMenuItem>
          <DropdownMenuItem @select="run(muteEveryone)"><MicOff /> Mute everyone</DropdownMenuItem>
          <DropdownMenuItem @select="run(toggleLock)">
            <template v-if="call.locked.value"><LockOpen /> Unlock the call</template>
            <template v-else><Lock /> Lock the call</template>
          </DropdownMenuItem>
          <DropdownMenuItem @select="emit('breakouts')"><DoorOpen /> Breakout rooms</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel class="text-xs text-muted-foreground">People who do not run the call</DropdownMenuLabel>
          <DropdownMenuCheckboxItem
            v-for="item in PERMISSION_LABELS"
            :key="item.key"
            :model-value="call.permissions.value[item.key]"
            @select.prevent
            @update:model-value="(value: boolean) => setPermission(item.key, value)"
          >
            {{ item.label }}
          </DropdownMenuCheckboxItem>
        </template>
      </DropdownMenuContent>
    </DropdownMenu>
    <button
      type="button"
      :class="[round, idle, 'relative']"
      :aria-label="props.panelOpen ? 'Hide the side panel' : 'Show chat, people and polls'"
      :title="props.panelOpen ? 'Hide panel' : 'Chat, people and polls'"
      @click="emit('panel')"
    >
      <PanelRightClose v-if="props.panelOpen" class="size-5" />
      <PanelRightOpen v-else class="size-5" />
      <span v-if="call.unreadChat.value" class="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold">
        {{ badge }}
      </span>
    </button>
    <button type="button" class="ml-2 flex h-11 items-center gap-2 rounded-full bg-red-600 px-5 text-sm font-semibold transition-colors hover:bg-red-600/90" @click="emit('leave')">
      <PhoneOff class="size-5" /> Leave
    </button>
    <button
      v-if="canEnd"
      type="button"
      class="flex h-11 items-center gap-2 rounded-full border border-red-400/50 px-4 text-sm font-medium text-red-300 transition-colors hover:bg-red-500/15"
      @click="emit('end')"
    >
      <SquareX class="size-4" /> End for everyone
    </button>
  </footer>
</template>

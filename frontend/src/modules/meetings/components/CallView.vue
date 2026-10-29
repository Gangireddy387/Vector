<script setup lang="ts">
import { useIntervalFn, useNow } from '@vueuse/core'
import { differenceInSeconds, parseISO } from 'date-fns'
import { DoorOpen, LoaderCircle, Undo2, UsersRound } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { toast } from 'vue-sonner'
import { useDevice } from '@/composables/useDevice'
import { useCallTiles } from '../call/tiles'
import { useMeetingCall } from '../useMeetingCall'
import BreakoutRoomsDialog from './BreakoutRoomsDialog.vue'
import CallControls from './CallControls.vue'
import CallWhiteboard from './CallWhiteboard.vue'
import VideoTile from './VideoTile.vue'

/**
 * The call itself: everyone's video (or the shared screen or whiteboard as the main view), notices for guests
 * waiting and breakout rooms, the controls, and a side panel the page fills in (chat, people, polls…).
 */
const props = withDefaults(defineProps<{ title: string; startedAt?: string | null; canEnd?: boolean }>(), { startedAt: null, canEnd: false })
const emit = defineEmits<{ leave: []; end: [] }>()
const panelOpen = defineModel<boolean>('panelOpen', { default: false })

const call = useMeetingCall()
const { isDesktop } = useDevice()
const { tiles, presenter } = useCallTiles()
const breakoutsOpen = ref(false)
const now = useNow({ scheduler: (callback) => useIntervalFn(callback, 1000) })

const elapsed = computed(() => {
  if (!props.startedAt) return ''
  const seconds = Math.max(0, differenceInSeconds(now.value, parseISO(props.startedAt)))
  const pad = (value: number) => String(value).padStart(2, '0')
  const hours = Math.floor(seconds / 3600)
  return `${hours ? `${hours}:` : ''}${pad(Math.floor((seconds % 3600) / 60))}:${pad(seconds % 60)}`
})

const others = computed(() => tiles.value.filter((tile) => tile.id !== presenter.value?.id))
const gridClass = computed(() => {
  const count = tiles.value.length
  if (count === 1) return 'grid-cols-1 max-w-4xl'
  if (count <= 4) return 'grid-cols-1 sm:grid-cols-2 max-w-6xl'
  return 'grid-cols-2 lg:grid-cols-3'
})
const firstWaiting = computed(() => (call.isGuest.value ? null : (call.lobby.value[0] ?? null)))

const backToMain = () => call.moveToRoom(null, null).catch((error: Error) => toast.error(error.message))
</script>

<template>
  <div class="flex min-h-0 flex-1 overflow-hidden bg-[#0d1017] text-white">
    <div class="flex min-w-0 flex-1 flex-col">
      <header class="flex shrink-0 items-center gap-3 px-4 py-3">
        <span class="relative flex size-2.5"><span class="absolute inline-flex size-full animate-ping rounded-full bg-red-500 opacity-75" /><span class="relative inline-flex size-2.5 rounded-full bg-red-500" /></span>
        <h1 class="min-w-0 truncate text-sm font-semibold">{{ title }}</h1>
        <span v-if="call.roomName.value" class="shrink-0 rounded-full bg-sky-500/20 px-2 py-0.5 text-[11px] font-medium text-sky-200">{{ call.roomName.value }}</span>
        <span class="font-mono text-xs text-white/60 tabular-nums">{{ elapsed }}</span>
        <span class="ml-auto inline-flex items-center gap-1.5 text-xs text-white/70"><UsersRound class="size-3.5" /> {{ tiles.length }} {{ call.room.value ? 'in this room' : 'in the call' }}</span>
      </header>

      <div v-if="call.status.value === 'reconnecting'" class="mx-4 mb-2 flex items-center justify-center gap-2 rounded-lg bg-amber-500/15 px-3 py-2 text-sm text-amber-200" role="status">
        <LoaderCircle class="size-4 animate-spin" /> Your connection dropped. Reconnecting to the call…
      </div>
      <div v-if="firstWaiting" class="mx-4 mb-2 flex flex-wrap items-center gap-2 rounded-lg bg-sky-500/15 px-3 py-2 text-sm text-sky-100" role="status">
        <DoorOpen class="size-4 shrink-0" />
        <span class="min-w-0 flex-1 truncate">
          <strong>{{ firstWaiting.user.name }}</strong> (guest) wants to join<template v-if="call.lobby.value.length > 1"> · {{ call.lobby.value.length - 1 }} more waiting</template>
        </span>
        <button type="button" class="rounded-full px-3 py-1 text-xs font-medium hover:bg-white/10" @click="call.admit(firstWaiting.socketId, false)">Turn away</button>
        <button type="button" class="rounded-full bg-sky-500 px-3 py-1 text-xs font-semibold text-white hover:bg-sky-500/90" @click="call.admit(firstWaiting.socketId, true)">Let in</button>
      </div>
      <div v-if="call.room.value" class="mx-4 mb-2 flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-sm text-white/80" role="status">
        <DoorOpen class="size-4 shrink-0 text-sky-300" />
        <span class="min-w-0 flex-1 truncate">You are in <strong>{{ call.roomName.value }}</strong>. Only people in this room see and hear you.</span>
        <button type="button" class="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium hover:bg-white/10" @click="backToMain"><Undo2 class="size-3.5" /> Main room</button>
      </div>

      <div class="min-h-0 flex-1 overflow-y-auto px-4 pb-2">
        <div v-if="call.boardOpen.value" class="flex h-full min-h-0 flex-col gap-3 lg:flex-row">
          <div class="min-h-[320px] min-w-0 flex-1"><CallWhiteboard @close="call.setBoardOpen(false)" /></div>
          <div class="flex shrink-0 gap-3 overflow-auto lg:w-48 lg:flex-col">
            <VideoTile v-for="tile in tiles" :key="tile.id" :data-tile-id="tile.id" class="w-40 shrink-0 lg:w-full" compact v-bind="tile" />
          </div>
        </div>
        <div v-else-if="presenter" class="flex h-full min-h-0 flex-col gap-3 lg:flex-row">
          <VideoTile class="min-h-0 flex-1 !aspect-auto" :data-tile-id="presenter.id" v-bind="presenter" />
          <div class="flex shrink-0 gap-3 overflow-auto lg:w-56 lg:flex-col">
            <VideoTile v-for="tile in others" :key="tile.id" :data-tile-id="tile.id" class="w-48 shrink-0 lg:w-full" compact v-bind="tile" />
          </div>
        </div>
        <div v-else class="mx-auto grid h-full content-center gap-3" :class="gridClass">
          <VideoTile v-for="tile in tiles" :key="tile.id" :data-tile-id="tile.id" v-bind="tile" />
        </div>
      </div>

      <CallControls :panel-open="panelOpen" :can-end="canEnd" @panel="panelOpen = !panelOpen" @leave="emit('leave')" @end="emit('end')" @breakouts="breakoutsOpen = true" />
    </div>

    <aside
      v-if="panelOpen"
      class="flex min-h-0 shrink-0 flex-col border-l border-white/10 text-foreground"
      :class="isDesktop ? 'w-[340px]' : 'fixed inset-x-0 bottom-0 z-40 h-[60vh] w-full rounded-t-2xl shadow-2xl'"
    >
      <slot name="panel" :open-breakouts="() => (breakoutsOpen = true)" />
    </aside>

    <BreakoutRoomsDialog v-model:open="breakoutsOpen" />
  </div>
</template>

<script setup lang="ts">
import { BarChart3, CalendarDays, LayoutGrid, MessagesSquare, Mic, MicOff, Video } from 'lucide-vue-next'
import { TEAM, type Teammate } from './team'

/* A small glass card sketching one of Vector's features, for the sign-in showcase. Decorative only. */
defineProps<{ kind: 'board' | 'reports' | 'calendar' | 'chat' | 'meeting'; person?: Teammate }>()

const HEADINGS = {
  board: { icon: LayoutGrid, title: 'Sprint board', meta: 'Sprint 14' },
  reports: { icon: BarChart3, title: 'Velocity', meta: '+18%' },
  calendar: { icon: CalendarDays, title: 'This week', meta: '6 events' },
  chat: { icon: MessagesSquare, title: '#design', meta: '3 new' },
  meeting: { icon: Video, title: 'Design review', meta: 'REC' },
}

const BOARD = [
  { title: 'To do', cards: ['bg-sky-300', 'bg-amber-300', 'bg-white/60'] },
  { title: 'Doing', cards: ['bg-fuchsia-300', 'bg-sky-300'] },
  { title: 'Done', cards: ['bg-emerald-300', 'bg-emerald-300', 'bg-emerald-300'] },
]
const BARS = [38, 52, 45, 64, 58, 76, 92]
const DAYS = ['M', 'T', 'W', 'T', 'F']
/* Events on the week grid: column (day), start and length in rows of a six-row day. */
const EVENTS = [
  { day: 1, start: 1, span: 2, tone: 'bg-sky-300/90' },
  { day: 2, start: 3, span: 2, tone: 'bg-fuchsia-300/90' },
  { day: 3, start: 1, span: 1, tone: 'bg-amber-300/90' },
  { day: 3, start: 4, span: 2, tone: 'bg-emerald-300/90' },
  { day: 4, start: 2, span: 3, tone: 'bg-violet-300/90' },
  { day: 5, start: 1, span: 2, tone: 'bg-rose-300/90' },
]
const TILES = [
  { who: TEAM.aisha, speaking: true, muted: false },
  { who: TEAM.james, speaking: false, muted: true },
  { who: TEAM.meera, speaking: false, muted: false },
  { who: TEAM.david, speaking: false, muted: true },
]
</script>

<template>
  <div class="relative w-44 shrink-0 rounded-[1rem] border border-white/20 bg-white/10 p-3 text-white shadow-xl shadow-black/15 backdrop-blur-md">
    <img
      v-if="person"
      :src="person.src"
      alt=""
      class="absolute -top-3.5 -right-3.5 size-9 rounded-full bg-linear-to-br shadow-lg ring-2 ring-white/80"
      :class="person.tone"
    />
    <div class="mb-2.5 flex items-center gap-1.5 text-[11px] font-semibold" :class="person && 'pr-4'">
      <component :is="HEADINGS[kind].icon" class="size-3.5 text-white/85" />
      <span class="flex-1 truncate">{{ HEADINGS[kind].title }}</span>
      <span
        class="rounded-full px-1.5 py-px text-[9px] font-semibold"
        :class="kind === 'meeting' ? 'bg-rose-500/90' : kind === 'reports' ? 'bg-emerald-400/25 text-emerald-100' : 'bg-white/15 text-white/80'"
      >
        {{ HEADINGS[kind].meta }}
      </span>
    </div>

    <div v-if="kind === 'board'" class="grid grid-cols-3 gap-1.5">
      <div v-for="column in BOARD" :key="column.title" class="space-y-1 rounded-[0.5rem] bg-white/10 p-1">
        <p class="px-0.5 text-[8px] font-medium text-white/70">{{ column.title }}</p>
        <div v-for="(tone, index) in column.cards" :key="index" class="space-y-0.5 rounded-[0.375rem] bg-white/85 p-1 shadow-sm">
          <span class="block h-1 w-3/4 rounded-full" :class="tone" />
          <span class="block h-1 w-1/2 rounded-full bg-slate-300" />
        </div>
      </div>
    </div>

    <div v-else-if="kind === 'reports'" class="flex h-16 items-end gap-1.5 border-b border-white/25 pb-px">
      <span
        v-for="(height, index) in BARS"
        :key="index"
        class="flex-1 rounded-t-[0.125rem] bg-linear-to-t from-cyan-300/80 to-fuchsia-300"
        :style="{ height: `${height}%` }"
      />
    </div>

    <div v-else-if="kind === 'calendar'">
      <div class="mb-1 grid grid-cols-5 text-center text-[8px] font-medium text-white/70">
        <span v-for="(day, index) in DAYS" :key="index">{{ day }}</span>
      </div>
      <div class="grid h-16 grid-cols-5 grid-rows-6 gap-x-1 gap-y-0.5 rounded-[0.5rem] bg-white/10 p-1">
        <span
          v-for="(event, index) in EVENTS"
          :key="index"
          class="rounded-[0.125rem]"
          :class="event.tone"
          :style="{ gridColumn: event.day, gridRow: `${event.start} / span ${event.span}` }"
        />
      </div>
    </div>

    <div v-else-if="kind === 'chat'" class="space-y-1.5 text-[10px] leading-snug">
      <div class="flex items-end gap-1.5">
        <img :src="TEAM.sofia.src" alt="" class="size-5 shrink-0 rounded-full bg-linear-to-br" :class="TEAM.sofia.tone" />
        <span class="rounded-[0.75rem] rounded-bl-[0.25rem] bg-white/20 px-2 py-1">Mockups are ready</span>
      </div>
      <div class="flex items-end justify-end gap-1.5">
        <span class="rounded-[0.75rem] rounded-br-[0.25rem] bg-linear-to-r from-indigo-400 to-fuchsia-400 px-2 py-1">Looks great, ship it</span>
      </div>
      <div class="flex items-center gap-1.5">
        <img :src="TEAM.arjun.src" alt="" class="size-5 shrink-0 rounded-full bg-linear-to-br" :class="TEAM.arjun.tone" />
        <span class="typing flex gap-0.5 rounded-[0.75rem] rounded-bl-[0.25rem] bg-white/20 px-2 py-1.5">
          <span class="size-1 rounded-full bg-white/80" />
          <span class="size-1 rounded-full bg-white/80" />
          <span class="size-1 rounded-full bg-white/80" />
        </span>
      </div>
    </div>

    <div v-else class="grid grid-cols-2 gap-1">
      <div
        v-for="tile in TILES"
        :key="tile.who.name"
        class="relative flex h-10 items-end justify-center overflow-hidden rounded-[0.5rem] bg-linear-to-br"
        :class="[tile.who.tone, tile.speaking && 'ring-2 ring-emerald-300']"
      >
        <img :src="tile.who.src" alt="" class="h-9" />
        <span class="absolute bottom-0.5 left-0.5 flex size-3.5 items-center justify-center rounded-full bg-black/40">
          <component :is="tile.muted ? MicOff : Mic" class="size-2" />
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.typing > span {
  animation: typing 1.2s ease-in-out infinite;
}
.typing > span:nth-child(2) {
  animation-delay: 0.15s;
}
.typing > span:nth-child(3) {
  animation-delay: 0.3s;
}
@keyframes typing {
  0%,
  60%,
  100% {
    opacity: 0.35;
    transform: translateY(0);
  }
  30% {
    opacity: 1;
    transform: translateY(-2px);
  }
}
@media (prefers-reduced-motion: reduce) {
  .typing > span {
    animation: none;
  }
}
</style>

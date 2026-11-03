<script setup lang="ts">
import { Video } from 'lucide-vue-next'
import { TEAM } from './team'

/* A glass pill about the team for the sign-in showcase: who is online, a recent update, or a meeting in progress. */
defineProps<{ kind: 'online' | 'activity' | 'standup' }>()

const ONLINE = [TEAM.aisha, TEAM.meera, TEAM.priya]
const STANDUP = [TEAM.liam, TEAM.maria, TEAM.kenji]
</script>

<template>
  <span
    class="flex w-max items-center gap-2.5 rounded-full border border-white/20 bg-white/10 py-1.5 pr-4 pl-1.5 whitespace-nowrap text-white shadow-xl shadow-black/15 backdrop-blur-md"
  >
    <template v-if="kind === 'online'">
      <span class="flex shrink-0 -space-x-2">
        <img v-for="who in ONLINE" :key="who.name" :src="who.src" alt="" class="size-8 rounded-full bg-linear-to-br ring-2 ring-white/70" :class="who.tone" />
        <span class="flex size-8 items-center justify-center rounded-full bg-white/25 text-[10px] font-semibold ring-2 ring-white/70 backdrop-blur">+9</span>
      </span>
      <span class="flex items-center gap-1.5 text-xs font-semibold">
        <span class="live-dot size-1.5 rounded-full bg-emerald-300" />
        12 online
      </span>
    </template>

    <template v-else-if="kind === 'activity'">
      <span class="relative shrink-0">
        <img :src="TEAM.priya.src" alt="" class="size-9 rounded-full bg-linear-to-br ring-2 ring-white/70" :class="TEAM.priya.tone" />
        <span class="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full bg-emerald-400 ring-2 ring-white" />
      </span>
      <span>
        <span class="block text-xs leading-tight font-semibold">Priya closed VEC-128</span>
        <span class="block text-[11px] text-white/70 short:hidden">Sprint 14 · just now</span>
      </span>
    </template>

    <template v-else>
      <span class="flex shrink-0 -space-x-2">
        <img v-for="who in STANDUP" :key="who.name" :src="who.src" alt="" class="size-8 rounded-full bg-linear-to-br ring-2 ring-white/70" :class="who.tone" />
      </span>
      <span>
        <span class="flex items-center gap-1.5 text-xs leading-tight font-semibold"><Video class="size-3.5" /> Daily standup</span>
        <span class="flex items-center gap-1.5 text-[11px] text-white/70 short:hidden">
          <span class="size-1.5 animate-pulse rounded-full bg-rose-400" /> Live · 3 joined
        </span>
      </span>
    </template>
  </span>
</template>

<style scoped>
.live-dot {
  box-shadow: 0 0 0 0 rgb(110 231 183 / 0.7);
  animation: live-pulse 2s ease-out infinite;
}
@keyframes live-pulse {
  to {
    box-shadow: 0 0 0 6px rgb(110 231 183 / 0);
  }
}
@media (prefers-reduced-motion: reduce) {
  .live-dot {
    animation: none;
  }
}
</style>

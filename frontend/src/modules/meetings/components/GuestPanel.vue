<script setup lang="ts">
import { BarChart3, MessageCircle, UsersRound } from 'lucide-vue-next'
import { ref } from 'vue'
import { useMeetingCall } from '../useMeetingCall'
import CallChat from './CallChat.vue'
import CallPeople from './CallPeople.vue'
import CallPolls from './CallPolls.vue'

/** A guest's side panel in the call: chat, who is there, and polls. */
const call = useMeetingCall()
const tab = ref<'chat' | 'people' | 'polls'>('chat')
const TABS = [
  { value: 'chat', label: 'Chat', icon: MessageCircle },
  { value: 'people', label: 'People', icon: UsersRound },
  { value: 'polls', label: 'Polls', icon: BarChart3 },
] as const
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col bg-card text-card-foreground">
    <div class="flex shrink-0 border-b border-border/70" role="tablist">
      <button
        v-for="item in TABS"
        :key="item.value"
        type="button"
        role="tab"
        class="relative flex flex-1 items-center justify-center gap-1.5 px-3 py-2.5 text-sm font-medium transition-colors"
        :class="tab === item.value ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'"
        :aria-selected="tab === item.value"
        @click="tab = item.value"
      >
        <component :is="item.icon" class="size-4" /> {{ item.label }}
        <span v-if="item.value === 'chat' && call.unreadChat.value && tab !== 'chat'" class="rounded-full bg-red-500 px-1.5 text-[10px] text-white tabular-nums">
          {{ call.unreadChat.value }}
        </span>
        <span v-if="tab === item.value" class="absolute inset-x-3 -bottom-px h-0.5 bg-primary" />
      </button>
    </div>
    <CallChat v-if="tab === 'chat'" />
    <CallPeople v-else-if="tab === 'people'" />
    <CallPolls v-else />
  </div>
</template>

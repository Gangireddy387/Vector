<script setup lang="ts">
import { ClipboardList, Lock, MessageCircle, MessagesSquare, Video } from 'lucide-vue-next'
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { useAuthStore } from '@/modules/auth/auth.store'

/** One map of Vector collab — Free includes these; the guide still shows what’s on vs off. */
const props = withDefaults(
  defineProps<{
    /** Compact strip (Home / Messages) vs fuller list (locked page). */
    dense?: boolean
  }>(),
  { dense: false },
)

const auth = useAuthStore()

const items = computed(() => [
  {
    key: 'chat',
    label: 'Work chat & standup',
    blurb: 'Inside each project: task talk + daily standup',
    icon: MessagesSquare,
    on: auth.hasFeature('chat'),
    to: auth.hasFeature('chat')
      ? { name: 'home' }
      : { name: 'feature-locked', query: { feature: 'chat' } },
  },
  {
    key: 'messages',
    label: 'Messages',
    blurb: 'DMs and team channels — people, not tasks',
    icon: MessageCircle,
    on: auth.hasFeature('directMessages') || auth.hasFeature('teamChat'),
    to:
      auth.hasFeature('directMessages') || auth.hasFeature('teamChat')
        ? { name: 'messages' }
        : { name: 'feature-locked', query: { feature: ['directMessages', 'teamChat'] } },
  },
  {
    key: 'meetings',
    label: 'Meetings',
    blurb: 'Video calls → action items → tracked tasks',
    icon: Video,
    on: auth.hasFeature('meetings'),
    to: auth.hasFeature('meetings') ? { name: 'meetings' } : { name: 'feature-locked', query: { feature: 'meetings' } },
  },
  {
    key: 'standup',
    label: 'Standup ritual',
    blurb: 'Post → clear tasks → keep the board moving',
    icon: ClipboardList,
    on: auth.hasFeature('chat'),
    to: auth.hasFeature('chat')
      ? { name: 'home' }
      : { name: 'feature-locked', query: { feature: 'chat' } },
  },
])
</script>

<template>
  <ul :class="dense ? 'grid gap-1.5 sm:grid-cols-2' : 'divide-y divide-border/70'">
    <li v-for="item in items" :key="item.key">
      <RouterLink
        :to="item.to"
        class="flex items-start gap-2.5 transition-colors"
        :class="dense ? 'rounded-lg border border-border/70 bg-muted/20 px-3 py-2 hover:bg-accent/50' : 'px-4 py-3 hover:bg-accent/40'"
      >
        <span
          class="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md"
          :class="item.on ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground'"
        >
          <component :is="item.on ? item.icon : Lock" class="size-3.5" />
        </span>
        <span class="min-w-0 flex-1">
          <span class="flex flex-wrap items-center gap-2 text-[12.5px] font-medium">
            {{ item.label }}
            <span
              class="rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
              :class="item.on ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground'"
            >
              {{ item.on ? 'On' : 'Locked' }}
            </span>
          </span>
          <span class="mt-0.5 block text-[11.5px] text-muted-foreground">{{ item.blurb }}</span>
        </span>
      </RouterLink>
    </li>
  </ul>
</template>

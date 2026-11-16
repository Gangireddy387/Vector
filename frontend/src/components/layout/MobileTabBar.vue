<script setup lang="ts">
import { CircleCheck, FolderKanban, Inbox, Menu, MessageCircle, Plus } from 'lucide-vue-next'
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useMessagesStore } from '@/modules/messages/messages.store'
import { useNotificationsStore } from '@/modules/notifications/notifications.store'
import { useUiStore } from '@/stores/ui.store'

const route = useRoute()
const ui = useUiStore()
const notifications = useNotificationsStore()
const messages = useMessagesStore()

/** Messages takes the second slot when chat is on the plan; otherwise Projects stays there. */
const TABS = computed(() => {
  const second = messages.isAvailable
    ? { name: 'messages', label: 'Messages', icon: MessageCircle }
    : { name: 'projects', label: 'Projects', icon: FolderKanban }
  return [
    { name: 'home', label: 'Home', icon: CircleCheck },
    second,
    { name: 'inbox', label: 'Inbox', icon: Inbox },
    { name: 'more', label: 'More', icon: Menu },
  ] as const
})

const isActive = (name: string) => {
  if (name === 'projects') return route.path.startsWith('/projects')
  if (name === 'messages') return route.path.startsWith('/messages')
  return route.name === name
}

const badgeFor = (name: string) => {
  if (name === 'inbox') return notifications.unreadCount
  if (name === 'messages') return messages.unreadTotal
  return 0
}

const openCreateIssue = () =>
  ui.openCreateIssue({ projectId: typeof route.params.projectId === 'string' ? route.params.projectId : undefined })
</script>

<template>
  <nav
    class="glass fixed inset-x-2 bottom-[max(0.5rem,env(safe-area-inset-bottom))] z-40 rounded-2xl border border-border shadow-elevated sm:inset-x-3 sm:bottom-[max(0.75rem,env(safe-area-inset-bottom))]"
    aria-label="Primary"
  >
    <ul class="grid h-14 grid-cols-5 items-center sm:h-16">
      <template v-for="(tab, index) in TABS" :key="tab.name">
        <li v-if="index === 2" class="flex justify-center">
          <button
            type="button"
            class="-mt-6 flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-glow ring-4 ring-background transition active:scale-95 sm:-mt-7 sm:size-14"
            aria-label="Create task"
            @click="openCreateIssue"
          >
            <Plus class="size-5 sm:size-6" />
          </button>
        </li>
        <li>
          <RouterLink
            :to="{ name: tab.name }"
            class="relative mx-auto flex w-14 flex-col items-center gap-0.5 py-1 text-[10px] font-medium transition-colors sm:w-16 sm:gap-1 sm:py-1.5 sm:text-[11px]"
            :class="isActive(tab.name) ? 'text-primary' : 'text-muted-foreground'"
            :aria-current="isActive(tab.name) ? 'page' : undefined"
          >
            <span class="flex h-6 w-10 items-center justify-center rounded-full transition-colors sm:h-7 sm:w-12" :class="isActive(tab.name) && 'bg-primary/12'">
              <component :is="tab.icon" class="size-4 sm:size-5" />
            </span>
            {{ tab.label }}
            <span
              v-if="badgeFor(tab.name)"
              class="absolute top-0.5 right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] leading-none font-semibold text-white tabular-nums ring-2 ring-card"
            >
              {{ badgeFor(tab.name) > 9 ? '9+' : badgeFor(tab.name) }}
            </span>
          </RouterLink>
        </li>
      </template>
    </ul>
  </nav>
</template>

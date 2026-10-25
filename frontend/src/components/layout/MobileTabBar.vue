<script setup lang="ts">
import { CircleCheck, FolderKanban, Inbox, Menu, Plus } from 'lucide-vue-next'
import { useRoute } from 'vue-router'
import { useNotificationsStore } from '@/modules/notifications/notifications.store'
import { useUiStore } from '@/stores/ui.store'

const route = useRoute()
const ui = useUiStore()
const notifications = useNotificationsStore()

const TABS = [
  { name: 'home', label: 'My tasks', icon: CircleCheck },
  { name: 'projects', label: 'Projects', icon: FolderKanban },
  { name: 'inbox', label: 'Inbox', icon: Inbox },
  { name: 'more', label: 'More', icon: Menu },
] as const

const isActive = (name: string) =>
  name === 'projects' ? route.path.startsWith('/projects') : route.name === name

const openCreateIssue = () =>
  ui.openCreateIssue({ projectId: typeof route.params.projectId === 'string' ? route.params.projectId : undefined })
</script>

<template>
  <nav
    class="glass fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 border border-border/70 shadow-elevated"
    aria-label="Primary"
  >
    <ul class="grid h-16 grid-cols-5 items-center">
      <template v-for="(tab, index) in TABS" :key="tab.name">
        <li v-if="index === 2" class="flex justify-center">
          <button
            type="button"
            class="-mt-7 flex size-14 items-center justify-center bg-brand text-primary-foreground shadow-glow ring-4 ring-background transition active:scale-95"
            aria-label="Create issue"
            @click="openCreateIssue"
          >
            <Plus class="size-6" />
          </button>
        </li>
        <li>
          <RouterLink
            :to="{ name: tab.name }"
            class="relative mx-auto flex w-16 flex-col items-center gap-1 py-1.5 text-[11px] font-medium transition-colors"
            :class="isActive(tab.name) ? 'text-primary' : 'text-muted-foreground'"
            :aria-current="isActive(tab.name) ? 'page' : undefined"
          >
            <span class="flex h-7 w-12 items-center justify-center transition-colors" :class="isActive(tab.name) && 'bg-primary/12'">
              <component :is="tab.icon" class="size-5" />
            </span>
            {{ tab.label }}
            <span
              v-if="tab.name === 'inbox' && notifications.unreadCount"
              class="absolute top-0.5 right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] leading-none font-semibold text-white tabular-nums ring-2 ring-card"
            >
              {{ notifications.unreadCount > 9 ? '9+' : notifications.unreadCount }}
            </span>
          </RouterLink>
        </li>
      </template>
    </ul>
  </nav>
</template>

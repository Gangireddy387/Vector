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
    class="mobile-tab-bar glass fixed inset-x-2 bottom-[max(0.5rem,env(safe-area-inset-bottom))] z-40 rounded-2xl border border-border shadow-elevated sm:inset-x-3 sm:bottom-[max(0.75rem,env(safe-area-inset-bottom))]"
    aria-label="Primary"
  >
    <ul class="grid h-14 grid-cols-5 items-center sm:h-16">
      <template v-for="(tab, index) in TABS" :key="tab.name">
        <li v-if="index === 2" class="mobile-tab-bar__create flex justify-center">
          <button
            type="button"
            class="mobile-tab-bar__create-btn -mt-6 flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-glow ring-4 ring-background sm:-mt-7 sm:size-14"
            aria-label="Create task"
            @click="openCreateIssue"
          >
            <Plus class="size-5 sm:size-6" />
          </button>
        </li>
        <li class="mobile-tab-bar__item" :style="{ '--i': index < 2 ? index : index + 1 }">
          <RouterLink
            :to="{ name: tab.name }"
            class="mobile-tab-bar__link relative mx-auto flex w-14 flex-col items-center gap-0.5 py-1 text-[10px] font-medium sm:w-16 sm:gap-1 sm:py-1.5 sm:text-[11px]"
            :class="isActive(tab.name) ? 'is-active text-primary' : 'text-muted-foreground'"
            :aria-current="isActive(tab.name) ? 'page' : undefined"
          >
            <span class="mobile-tab-bar__icon flex h-6 w-10 items-center justify-center rounded-full sm:h-7 sm:w-12" :class="isActive(tab.name) && 'bg-primary/12'">
              <component :is="tab.icon" class="size-4 sm:size-5" />
            </span>
            {{ tab.label }}
            <span
              v-if="badgeFor(tab.name)"
              class="mobile-tab-bar__badge absolute top-0.5 right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] leading-none font-semibold text-white tabular-nums ring-2 ring-card"
            >
              {{ badgeFor(tab.name) > 9 ? '9+' : badgeFor(tab.name) }}
            </span>
          </RouterLink>
        </li>
      </template>
    </ul>
  </nav>
</template>

<style scoped>
.mobile-tab-bar {
  transform-origin: 50% 100%;
  animation: mobile-tab-bar-bounce 780ms cubic-bezier(0.22, 1.2, 0.36, 1) both;
}

.mobile-tab-bar__item {
  animation: mobile-tab-item-bounce 620ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
  animation-delay: calc(180ms + var(--i, 0) * 55ms);
}

.mobile-tab-bar__create {
  animation: mobile-tab-create-bounce 720ms cubic-bezier(0.34, 1.7, 0.64, 1) both;
  animation-delay: 260ms;
}

.mobile-tab-bar__create-btn {
  transition:
    transform 200ms cubic-bezier(0.34, 1.4, 0.64, 1),
    filter 200ms ease;
  animation: motion-pulse-ring 2.8s ease-out 1.2s 2;
}

.mobile-tab-bar__create-btn:hover {
  transform: scale(1.06);
  filter: brightness(1.05);
}

.mobile-tab-bar__create-btn:active {
  transform: scale(0.94);
}

.mobile-tab-bar__link {
  transition:
    color 180ms ease,
    transform 180ms cubic-bezier(0.34, 1.4, 0.64, 1);
}

.mobile-tab-bar__link:active {
  transform: scale(0.94);
}

.mobile-tab-bar__icon {
  transition:
    background-color 200ms ease,
    transform 280ms cubic-bezier(0.34, 1.56, 0.64, 1),
    box-shadow 280ms ease;
}

.mobile-tab-bar__link.is-active .mobile-tab-bar__icon {
  transform: scale(1.08);
  box-shadow: 0 0 0 4px color-mix(in oklch, var(--primary) 12%, transparent);
}

.mobile-tab-bar__badge {
  animation: motion-pop 480ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
}

@keyframes mobile-tab-bar-bounce {
  0% {
    opacity: 0;
    transform: translateY(calc(100% + 1.5rem)) scale(0.94);
  }
  55% {
    opacity: 1;
    transform: translateY(-0.45rem) scale(1.02);
  }
  72% {
    transform: translateY(0.22rem) scale(0.985);
  }
  86% {
    transform: translateY(-0.1rem) scale(1.008);
  }
  100% {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes mobile-tab-item-bounce {
  0% {
    opacity: 0;
    transform: translateY(1rem) scale(0.8);
  }
  60% {
    opacity: 1;
    transform: translateY(-0.28rem) scale(1.12);
  }
  78% {
    transform: translateY(0.12rem) scale(0.96);
  }
  100% {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes mobile-tab-create-bounce {
  0% {
    opacity: 0;
    transform: translateY(1.15rem) scale(0.45);
  }
  55% {
    opacity: 1;
    transform: translateY(-0.4rem) scale(1.18);
  }
  72% {
    transform: translateY(0.18rem) scale(0.92);
  }
  86% {
    transform: translateY(-0.08rem) scale(1.05);
  }
  100% {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .mobile-tab-bar,
  .mobile-tab-bar__item,
  .mobile-tab-bar__create,
  .mobile-tab-bar__create-btn,
  .mobile-tab-bar__badge {
    animation: none;
  }

  .mobile-tab-bar__link.is-active .mobile-tab-bar__icon {
    transform: none;
  }
}
</style>

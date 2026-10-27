<script setup lang="ts">
import { Bell, BellOff } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import EmptyState from '@/components/common/EmptyState.vue'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { AppNotification } from '@/types/models'
import { useNotificationsStore } from '../notifications.store'
import NotificationList from './NotificationList.vue'

const notifications = useNotificationsStore()
const router = useRouter()
const isOpen = ref(false)

const latest = computed(() => notifications.items.slice(0, 8))

function open(notification: AppNotification) {
  isOpen.value = false
  void notifications.markRead(notification)
  if (notification.link) void router.push(notification.link)
}
</script>

<template>
  <Popover v-model:open="isOpen">
    <PopoverTrigger as-child>
      <Button variant="ghost" size="icon" class="relative" :aria-label="`Notifications (${notifications.unreadCount} unread)`">
        <Bell />
        <span
          v-if="notifications.unreadCount"
          class="absolute top-0.5 right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] leading-none font-semibold text-white tabular-nums ring-2 ring-background"
        >
          {{ notifications.unreadCount > 9 ? '9+' : notifications.unreadCount }}
        </span>
      </Button>
    </PopoverTrigger>
    <PopoverContent align="end" class="w-96 p-0">
      <div class="flex items-center justify-between border-b px-4 py-3">
        <p class="text-sm font-semibold">Notifications</p>
        <Button v-if="notifications.unreadCount" variant="link" size="xs" class="h-auto p-0" @click="notifications.markAllRead()">
          Mark all as read
        </Button>
      </div>
      <div class="max-h-[420px] overflow-y-auto">
        <NotificationList v-if="latest.length" :notifications="latest" dense @open="open" @read="notifications.markRead" @remove="notifications.remove" />
        <EmptyState v-else :icon="BellOff" title="You're all caught up" class="py-10" />
      </div>
      <div class="border-t p-2">
        <Button variant="ghost" size="sm" class="w-full" @click="isOpen = false; router.push({ name: 'inbox' })">View all</Button>
      </div>
    </PopoverContent>
  </Popover>
</template>

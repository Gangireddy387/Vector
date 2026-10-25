<script setup lang="ts">
import { AtSign, Bell, CalendarClock, CircleAlert, CircleCheck, MessageSquare, MessagesSquare, Rocket, UserPlus, Workflow, X } from 'lucide-vue-next'
import type { Component } from 'vue'
import UserAvatar from '@/components/common/UserAvatar.vue'
import { timeAgo } from '@/lib/format'
import { toPlainText } from '@/lib/markdown'
import type { AppNotification } from '@/types/models'

withDefaults(defineProps<{ notifications: AppNotification[]; dense?: boolean }>(), { dense: false })
defineEmits<{ open: [notification: AppNotification]; remove: [notification: AppNotification] }>()

const TYPE_ICONS: Record<string, Component> = {
  assigned: UserPlus,
  mentioned: AtSign,
  commented: MessageSquare,
  status_changed: CircleCheck,
  due_soon: CalendarClock,
  automation: Workflow,
  sprint_started: Rocket,
  sprint_completed: Rocket,
  member_added: UserPlus,
  chat_mention: AtSign,
  chat_task: MessagesSquare,
  standup_blocker: CircleAlert,
}
</script>

<template>
  <ul class="divide-y">
    <li v-for="notification in notifications" :key="notification.id" class="group relative">
      <button
        type="button"
        class="flex w-full gap-3 px-4 text-left transition-colors hover:bg-muted/60"
        :class="dense ? 'py-3' : 'py-4'"
        @click="$emit('open', notification)"
      >
        <span class="relative mt-0.5 shrink-0">
          <UserAvatar v-if="notification.actor" :user="notification.actor" size="md" />
          <span v-else class="flex size-8 items-center justify-center bg-primary/10 text-primary">
            <component :is="TYPE_ICONS[notification.type] ?? Bell" class="size-4" />
          </span>
          <span
            v-if="notification.actor && TYPE_ICONS[notification.type]"
            class="absolute -right-1 -bottom-1 flex size-4 items-center justify-center bg-background text-muted-foreground ring-1 ring-border"
          >
            <component :is="TYPE_ICONS[notification.type]" class="size-2.5" />
          </span>
        </span>
        <span class="min-w-0 flex-1 pr-6">
          <span class="block text-sm" :class="notification.readAt ? 'text-muted-foreground' : 'font-medium'">{{ notification.title }}</span>
          <span v-if="notification.body" class="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">
            {{ toPlainText(notification.body, 180) }}
          </span>
          <span class="mt-1 block text-[11px] text-muted-foreground">{{ timeAgo(notification.createdAt) }}</span>
        </span>
        <span v-if="!notification.readAt" class="absolute top-5 right-4 size-2 rounded-full bg-primary" aria-label="Unread" />
      </button>
      <button
        type="button"
        class="absolute right-2 bottom-2 p-1 text-muted-foreground opacity-0 transition group-hover:opacity-100 hover:bg-muted focus-visible:opacity-100"
        aria-label="Dismiss notification"
        @click="$emit('remove', notification)"
      >
        <X class="size-3.5" />
      </button>
    </li>
  </ul>
</template>

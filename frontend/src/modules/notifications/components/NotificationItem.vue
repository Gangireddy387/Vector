<script setup lang="ts">
import { format, isToday, parseISO } from 'date-fns'
import { Check, X } from 'lucide-vue-next'
import { computed } from 'vue'
import UserAvatar from '@/components/common/UserAvatar.vue'
import { formatDateTime, timeAgo } from '@/lib/format'
import { toPlainText } from '@/lib/markdown'
import type { AppNotification } from '@/types/models'
import { kindOf } from '../notification-kinds'

/**
 * One Inbox entry. `count` > 1 means several notifications in a row about the same thing were folded together;
 * the newest one is shown.
 */
const props = withDefaults(defineProps<{ notification: AppNotification; count?: number; unread?: boolean; dense?: boolean }>(), {
  count: 1,
  unread: undefined,
  dense: false,
})
const emit = defineEmits<{ open: []; read: []; remove: [] }>()

const kind = computed(() => kindOf(props.notification.type))
const isUnread = computed(() => props.unread ?? !props.notification.readAt)
const when = computed(() => {
  const date = parseISO(props.notification.createdAt)
  return isToday(date) ? format(date, 'HH:mm') : format(date, 'd MMM')
})
</script>

<template>
  <div
    class="group relative flex gap-3 border-l-2 transition-colors hover:bg-muted/50"
    :class="[isUnread ? 'border-l-brand bg-primary/[0.04]' : 'border-l-transparent', dense ? 'px-3 py-2.5' : 'px-4 py-3.5']"
  >
    <button type="button" class="absolute inset-0 z-0" :aria-label="`Open: ${notification.title}`" @click="emit('open')" />

    <span class="pointer-events-none relative z-10 mt-0.5 shrink-0">
      <span class="flex size-10 items-center justify-center" :class="kind.tone">
        <component :is="kind.icon" class="size-[18px]" />
      </span>
      <UserAvatar v-if="notification.actor" :user="notification.actor" size="sm" class="absolute -right-1.5 -bottom-1.5 ring-2 ring-card" />
    </span>

    <span class="pointer-events-none relative z-10 min-w-0 flex-1">
      <span class="flex items-baseline gap-2">
        <span class="min-w-0 flex-1 truncate text-sm" :class="isUnread ? 'font-semibold text-foreground' : 'text-foreground/80'">{{ notification.title }}</span>
        <span class="shrink-0 text-[11px] text-muted-foreground tabular-nums" :title="formatDateTime(notification.createdAt)">{{ when }}</span>
      </span>
      <span v-if="notification.body" class="mt-0.5 line-clamp-2 block text-[13px] leading-snug text-muted-foreground">{{ toPlainText(notification.body, 200) }}</span>
      <span class="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
        <span class="font-medium text-foreground/70">{{ kind.label }}</span>
        <span v-if="count > 1" class="bg-muted px-1.5 py-px font-medium text-foreground/80">{{ count }} {{ notification.type === 'support_message' ? 'messages' : 'updates' }}</span>
        <span>{{ timeAgo(notification.createdAt) }}</span>
      </span>
    </span>

    <span class="relative z-10 flex shrink-0 flex-col items-end justify-between gap-1">
      <span v-if="isUnread" class="mt-1.5 size-2.5 rounded-full bg-brand" aria-label="Unread" />
      <span v-else class="mt-1.5 size-2.5" />
      <span class="flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <button
          v-if="isUnread"
          type="button"
          class="flex size-7 items-center justify-center text-muted-foreground hover:bg-card hover:text-foreground"
          title="Mark as read"
          aria-label="Mark as read"
          @click="emit('read')"
        >
          <Check class="size-3.5" />
        </button>
        <button
          type="button"
          class="flex size-7 items-center justify-center text-muted-foreground hover:bg-card hover:text-destructive"
          title="Dismiss"
          aria-label="Dismiss notification"
          @click="emit('remove')"
        >
          <X class="size-3.5" />
        </button>
      </span>
    </span>
  </div>
</template>

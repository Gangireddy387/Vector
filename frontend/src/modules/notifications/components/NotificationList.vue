<script setup lang="ts">
import type { AppNotification } from '@/types/models'
import NotificationItem from './NotificationItem.vue'

/** Compact list used by the bell menu; the Inbox page groups and filters the same items. */
withDefaults(defineProps<{ notifications: AppNotification[]; dense?: boolean }>(), { dense: false })
const emit = defineEmits<{ open: [notification: AppNotification]; remove: [notification: AppNotification]; read: [notification: AppNotification] }>()
</script>

<template>
  <ul class="divide-y divide-border/60">
    <li v-for="notification in notifications" :key="notification.id">
      <NotificationItem
        :notification="notification"
        :dense="dense"
        @open="emit('open', notification)"
        @read="emit('read', notification)"
        @remove="emit('remove', notification)"
      />
    </li>
  </ul>
</template>

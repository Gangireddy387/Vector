<script setup lang="ts">
import { BellOff, CheckCheck } from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import EmptyState from '@/components/common/EmptyState.vue'
import PageHeader from '@/components/common/PageHeader.vue'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useDevice } from '@/composables/useDevice'
import type { AppNotification } from '@/types/models'
import NotificationList from '../components/NotificationList.vue'
import { useNotificationsStore } from '../notifications.store'

const notifications = useNotificationsStore()
const router = useRouter()
const { isDesktop } = useDevice()
const filter = ref<'all' | 'unread'>('all')

const visible = computed(() => (filter.value === 'unread' ? notifications.items.filter((item) => !item.readAt) : notifications.items))

onMounted(() => notifications.fetchNotifications())

function open(notification: AppNotification) {
  void notifications.markRead(notification)
  if (notification.link) void router.push(notification.link)
}
</script>

<template>
  <div class="w-full space-y-4" :class="isDesktop ? 'p-5' : 'p-3'">
    <PageHeader v-if="isDesktop" title="Inbox" description="Assignments, mentions, status changes and reminders.">
      <template #actions>
        <Button variant="outline" size="sm" :disabled="!notifications.unreadCount" @click="notifications.markAllRead()">
          <CheckCheck /> Mark all as read
        </Button>
      </template>
    </PageHeader>

    <div class="flex items-center justify-between gap-2">
      <Tabs v-model="filter">
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="unread">Unread ({{ notifications.unreadCount }})</TabsTrigger>
        </TabsList>
      </Tabs>
      <Button v-if="!isDesktop && notifications.unreadCount" variant="ghost" size="sm" @click="notifications.markAllRead()">
        <CheckCheck /> Read all
      </Button>
    </div>

    <div class="overflow-hidden border bg-card">
      <div v-if="notifications.isLoading && !notifications.items.length" class="space-y-3 p-4">
        <Skeleton v-for="index in 5" :key="index" class="h-14 w-full" />
      </div>
      <NotificationList v-else-if="visible.length" :notifications="visible" @open="open" @remove="notifications.remove" />
      <EmptyState
        v-else
        :icon="BellOff"
        :title="filter === 'unread' ? 'No unread notifications' : 'Nothing here yet'"
        description="You will be notified when you are assigned, mentioned, or when work you watch changes."
      />
    </div>
  </div>
</template>

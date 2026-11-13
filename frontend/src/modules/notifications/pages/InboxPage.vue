<script setup lang="ts">
import { format, isThisWeek, isToday, isYesterday, parseISO } from 'date-fns'
import { ArrowUpRight, BellOff, BellRing, Check, CheckCheck, Eraser, Inbox, MessageCircle, Search, Trash2 } from 'lucide-vue-next'
import { computed, onMounted, ref, useTemplateRef } from 'vue'
import { useRouter } from 'vue-router'
import EmptyState from '@/components/common/EmptyState.vue'
import UserAvatar from '@/components/common/UserAvatar.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { useDevice } from '@/composables/useDevice'
import { formatDateTime, timeAgo } from '@/lib/format'
import { toPlainText } from '@/lib/markdown'
import { useAuthStore } from '@/modules/auth/auth.store'
import IssueDetailView from '@/modules/issues/components/detail/IssueDetailView.vue'
import SupportChatThread from '@/modules/support/components/SupportChatThread.vue'
import { organizationSupportApi } from '@/modules/support/support.api'
import type { AppNotification } from '@/types/models'
import NotificationItem from '../components/NotificationItem.vue'
import { INBOX_FILTERS, type InboxFilter, kindOf, matchesFilter, openLabel } from '../notification-kinds'
import { useNotificationsStore } from '../notifications.store'

const notifications = useNotificationsStore()
const auth = useAuthStore()
const router = useRouter()
const { isDesktop } = useDevice()
const filter = ref<InboxFilter>('all')
const supportChat = useTemplateRef<InstanceType<typeof SupportChatThread>>('supportChat')
const search = ref('')
const selectedKey = ref<string | null>(null)

onMounted(() => notifications.fetchNotifications())

const counts = computed(() =>
  Object.fromEntries(INBOX_FILTERS.map((item) => [item.value, notifications.items.filter((notification) => matchesFilter(notification, item.value)).length])),
)
const unreadIn = (value: InboxFilter) => notifications.items.filter((notification) => !notification.readAt && matchesFilter(notification, value)).length
/** Category chips only show when they have something in them (All, Unread and the open one always do). */
const chips = computed(() => INBOX_FILTERS.filter((item) => item.value === 'all' || item.value === 'unread' || item.value === filter.value || counts.value[item.value]))
function chooseFilter(value: InboxFilter) {
  filter.value = value
  selectedKey.value = null
}

const visible = computed(() => {
  const term = search.value.trim().toLowerCase()
  return notifications.items.filter(
    (notification) =>
      matchesFilter(notification, filter.value) &&
      (!term || `${notification.title} ${toPlainText(notification.body ?? '', 400)}`.toLowerCase().includes(term)),
  )
})

interface Entry {
  key: string
  latest: AppNotification
  items: AppNotification[]
}

const dayOf = (notification: AppNotification) => {
  const date = parseISO(notification.createdAt)
  if (isToday(date)) return 'Today'
  if (isYesterday(date)) return 'Yesterday'
  if (isThisWeek(date, { weekStartsOn: 1 })) return 'This week'
  return 'Earlier'
}

/**
 * Day sections. Messages from the Vector team are one conversation per organization, so they always fold into a
 * single entry at the newest message; other notifications in a row about the same thing (same type and link) fold too.
 */
const sections = computed(() => {
  const result: Array<{ label: string; entries: Entry[] }> = []
  let supportEntry: Entry | null = null
  for (const notification of visible.value) {
    if (notification.type === 'support_message' && supportEntry) {
      supportEntry.items.push(notification)
      continue
    }
    const label = dayOf(notification)
    let section = result.at(-1)
    if (!section || section.label !== label) result.push((section = { label, entries: [] }))
    const previous = section.entries.at(-1)
    const sameThread = previous && notification.link && previous.latest.type === notification.type && previous.latest.link === notification.link
    if (sameThread) previous.items.push(notification)
    else {
      const entry = { key: notification.id, latest: notification, items: [notification] }
      section.entries.push(entry)
      if (notification.type === 'support_message') supportEntry = entry
    }
  }
  return result
})
const entries = computed(() => sections.value.flatMap((section) => section.entries))
const selected = computed(() => entries.value.find((entry) => entry.key === selectedKey.value) ?? null)

/** Task links look like /issues/KEY-12; those open the full task in the pane. */
const taskKeyOf = (notification: AppNotification) => notification.link?.match(/^\/issues\/([A-Z][A-Z0-9]*-\d+)/i)?.[1]?.toUpperCase() ?? null
const taskKey = computed(() => (selected.value ? taskKeyOf(selected.value.latest) : null))
/** What the reading pane shows: the live support chat, the task itself, or the notification text. */
const paneMode = computed(() => {
  if (!selected.value) return null
  if (selected.value.latest.type === 'support_message' && auth.isOrganizationAdmin && auth.organization) return 'chat'
  return taskKey.value ? 'task' : 'thread'
})

const isUnread = (entry: Entry) => entry.items.some((item) => !item.readAt)
const markEntryRead = (entry: Entry) => Promise.all(entry.items.filter((item) => !item.readAt).map((item) => notifications.markRead(item)))
async function removeEntry(entry: Entry) {
  if (selectedKey.value === entry.key) selectedKey.value = null
  await Promise.all(entry.items.map((item) => notifications.remove(item)))
}

/** Desktop: show it in the reading pane (and mark it read, like opening an email). Phones: go straight to it. */
function select(entry: Entry) {
  void markEntryRead(entry)
  if (isDesktop.value) selectedKey.value = entry.key
  else if (entry.latest.link) void router.push(entry.latest.link)
}
function openLink(entry: Entry) {
  void markEntryRead(entry)
  if (entry.latest.link) void router.push(entry.latest.link)
}

const senderOf = (notification: AppNotification) => notification.actor?.name ?? kindOf(notification.type).label
const listTime = (notification: AppNotification) => {
  const date = parseISO(notification.createdAt)
  return isToday(date) ? format(date, 'HH:mm') : format(date, 'd MMM')
}

const EMPTY: Record<InboxFilter, { title: string; description: string }> = {
  all: { title: 'Nothing here yet', description: 'You will hear about tasks assigned to you, mentions, deadlines and work you watch.' },
  unread: { title: 'You are all caught up', description: 'New notifications show up here until you open them.' },
  assigned: { title: 'Nothing assigned', description: 'Tasks someone gives you appear here.' },
  mentions: { title: 'No mentions', description: 'When someone @mentions you in a comment or chat, it shows up here.' },
  updates: { title: 'No updates', description: 'Status changes, comments and sprint news on work you watch.' },
  reminders: { title: 'No reminders', description: 'Due dates and blockers that need your attention.' },
  support: { title: 'No messages from the Vector team', description: 'Messages from the portal team appear here and in Organization settings.' },
}
</script>

<template>
  <!-- Desktop: filters on the list, the list and a reading pane, fitted to the window -->
  <div v-if="isDesktop" class="flex h-full w-full flex-col">
    <header class="flex h-12 shrink-0 items-center gap-3 border-b border-border px-4">
      <h1 class="flex items-center gap-2 text-[15px] font-semibold">
        Inbox
        <span v-if="notifications.unreadCount" class="rounded-full bg-primary/12 px-1.5 text-[11px] font-semibold text-primary tabular-nums dark:bg-primary/20">{{ notifications.unreadCount }}</span>
      </h1>
      <div class="relative ml-auto w-60">
        <Search class="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input v-model="search" class="h-7 pl-8" placeholder="Search notifications" aria-label="Search notifications" />
      </div>
      <Button variant="outline" size="sm" :disabled="!notifications.unreadCount" @click="notifications.markAllRead()"><CheckCheck /> Mark all read</Button>
    </header>

    <div class="flex min-h-0 flex-1 overflow-hidden">
      <!-- The list, with its filters on top -->
      <section class="flex w-[26rem] shrink-0 flex-col border-r border-border xl:w-[30rem]">
        <div class="flex shrink-0 flex-wrap gap-1 px-2.5 pt-2.5 pb-1.5" role="tablist" aria-label="Filter notifications">
          <button
            v-for="chip in chips"
            :key="chip.value"
            type="button"
            role="tab"
            class="inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium transition-colors"
            :class="filter === chip.value ? 'bg-accent text-foreground shadow-[0_0_0_1px_var(--border)]' : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'"
            :aria-selected="filter === chip.value"
            @click="chooseFilter(chip.value)"
          >
            <component :is="chip.icon" class="size-3.5" />
            {{ chip.label }}
            <span
              v-if="unreadIn(chip.value)"
              class="min-w-4 rounded-full px-1 text-center text-[10px] font-semibold tabular-nums"
              :class="'bg-primary text-primary-foreground'"
              :aria-label="`${unreadIn(chip.value)} unread`"
            >
              {{ unreadIn(chip.value) }}
            </span>
          </button>
        </div>

        <div class="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
          <div v-if="notifications.isLoading && !notifications.items.length" class="space-y-2 p-3">
            <Skeleton v-for="index in 7" :key="index" class="h-14 w-full" />
          </div>
          <EmptyState
            v-else-if="!entries.length"
            :icon="search ? Search : filter === 'unread' ? Inbox : BellOff"
            :title="search ? `Nothing matches “${search}”` : EMPTY[filter].title"
            :description="search ? 'Try other words or another filter.' : EMPTY[filter].description"
            class="py-14"
          />
          <template v-for="section in sections" v-else :key="section.label">
            <p class="sticky top-0 z-10 bg-background/95 px-4 pt-3 pb-1 text-[11.5px] font-medium text-muted-foreground backdrop-blur">
              {{ section.label }}
            </p>
            <button
              v-for="entry in section.entries"
              :key="entry.key"
              type="button"
              class="relative mx-1.5 flex w-[calc(100%-0.75rem)] items-start gap-3 rounded-md px-2.5 py-2.5 text-left transition-colors"
              :class="
                selectedKey === entry.key
                  ? 'bg-accent'
                  : isUnread(entry)
                    ? 'hover:bg-accent/60'
                    : 'hover:bg-accent/60'
              "
              @click="select(entry)"
            >
              <UserAvatar v-if="entry.latest.actor" :user="entry.latest.actor" size="md" class="mt-0.5 size-8" />
              <span v-else class="mt-0.5 flex size-8 shrink-0 items-center justify-center" :class="kindOf(entry.latest.type).tone">
                <component :is="kindOf(entry.latest.type).icon" class="size-4" />
              </span>
              <span class="min-w-0 flex-1">
                <span class="flex items-baseline gap-2">
                  <span class="min-w-0 flex-1 truncate text-[13px]" :class="isUnread(entry) ? 'font-semibold' : 'font-medium text-foreground/85'">
                    {{ entry.latest.title }}
                    <span v-if="entry.items.length > 1" class="font-normal text-muted-foreground">({{ entry.items.length }})</span>
                  </span>
                  <span class="shrink-0 text-[11px] tabular-nums" :class="isUnread(entry) ? 'font-semibold text-primary' : 'text-muted-foreground'">
                    {{ listTime(entry.latest) }}
                  </span>
                </span>
                <span class="flex items-center gap-2">
                  <span class="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                    {{ senderOf(entry.latest) }} · {{ entry.latest.body ? toPlainText(entry.latest.body, 140) : kindOf(entry.latest.type).label }}
                  </span>
                  <span v-if="isUnread(entry)" class="size-2 shrink-0 rounded-full bg-brand" aria-label="Unread" />
                </span>
              </span>
            </button>
          </template>
        </div>
      </section>

      <!-- Reading pane: chat and tasks open right here, so you can reply without leaving the Inbox -->
      <article v-if="selected && paneMode === 'chat'" class="flex min-w-0 flex-1 flex-col">
        <div class="flex h-12 shrink-0 items-center gap-3 border-b border-border px-4">
          <span class="flex size-9 items-center justify-center" :class="kindOf('support_message').tone"><MessageCircle class="size-4" /></span>
          <span class="min-w-0 flex-1">
            <span class="block text-sm font-semibold">Vector team</span>
            <span class="block truncate text-xs text-muted-foreground">Your organization’s conversation with the portal team. Reply right here.</span>
          </span>
          <Button variant="ghost" size="sm" class="text-muted-foreground hover:text-destructive" @click="supportChat?.clearChat()"><Eraser /> Clear chat</Button>
          <Button variant="ghost" size="sm" class="text-muted-foreground hover:text-destructive" @click="removeEntry(selected)"><Trash2 /> Dismiss</Button>
        </div>
        <SupportChatThread
          ref="supportChat"
          :key="auth.organization!.id"
          class="min-h-0 flex-1"
          side="organization"
          :organization-id="auth.organization!.id"
          :api="organizationSupportApi"
          notice="Messages here are only between your organization’s admins and the Vector team."
        />
      </article>

      <article v-else-if="selected && paneMode === 'task'" class="min-w-0 flex-1 overflow-hidden">
        <IssueDetailView :key="taskKey!" :issue-key="taskKey!" mode="panel" class="h-full" @close="selectedKey = null" />
      </article>

      <article v-else class="min-w-0 flex-1 overflow-y-auto scrollbar-thin">
        <div v-if="!selected" class="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
          <span class="flex size-12 items-center justify-center bg-primary/10 text-primary"><BellRing class="size-6" /></span>
          <p class="text-sm font-medium">Select a notification</p>
          <p class="max-w-xs text-xs text-muted-foreground">Tasks and Vector team messages open right here, so you can comment or reply.</p>
        </div>

        <!-- A notification: who, what and when, its message, and what you can do with it -->
        <div v-else class="max-w-2xl space-y-4 p-6">
          <div class="flex items-start gap-3">
            <UserAvatar v-if="selected.latest.actor" :user="selected.latest.actor" size="lg" class="size-10" />
            <span v-else class="flex size-10 shrink-0 items-center justify-center" :class="kindOf(selected.latest.type).tone">
              <component :is="kindOf(selected.latest.type).icon" class="size-5" />
            </span>
            <div class="min-w-0 flex-1">
              <p class="flex items-center gap-2 text-xs text-muted-foreground">
                <span class="inline-flex items-center gap-1 px-1.5 py-0.5 font-medium" :class="kindOf(selected.latest.type).tone">
                  <component :is="kindOf(selected.latest.type).icon" class="size-3" /> {{ kindOf(selected.latest.type).label }}
                </span>
                <span :title="formatDateTime(selected.latest.createdAt)">{{ timeAgo(selected.latest.createdAt) }}</span>
              </p>
              <h2 class="mt-1.5 text-lg leading-snug font-semibold">{{ selected.latest.title }}</h2>
              <p class="text-sm text-muted-foreground">{{ senderOf(selected.latest) }} · {{ formatDateTime(selected.latest.createdAt) }}</p>
            </div>
          </div>

          <p v-if="selected.latest.body" class="border-l-2 border-primary/40 bg-muted/40 px-4 py-3 text-sm leading-relaxed whitespace-pre-line text-foreground/90">
            {{ toPlainText(selected.latest.body, 4000) }}
          </p>

          <div class="flex flex-wrap items-center gap-2">
            <Button v-if="selected.latest.link" variant="brand" size="sm" @click="openLink(selected)">{{ openLabel(selected.latest) }} <ArrowUpRight /></Button>
            <Button v-if="isUnread(selected)" variant="outline" size="sm" @click="markEntryRead(selected)"><Check /> Mark as read</Button>
            <Button variant="ghost" size="sm" class="text-muted-foreground hover:text-destructive" @click="removeEntry(selected)"><Trash2 /> Dismiss</Button>
          </div>

          <!-- Earlier notifications about the same thing, newest first -->
          <section v-if="selected.items.length > 1" class="space-y-2 pt-2">
            <h3 class="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Earlier ({{ selected.items.length - 1 }})</h3>
            <ol class="divide-y divide-border/70 overflow-hidden rounded-lg border border-border">
              <li v-for="item in selected.items.slice(1)" :key="item.id" class="flex items-start gap-2.5 px-3 py-2">
                <UserAvatar v-if="item.actor" :user="item.actor" size="sm" class="mt-0.5" />
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-[13px]">
                    <span class="font-medium">{{ senderOf(item) }}</span> <span class="text-muted-foreground">{{ item.title }}</span>
                  </span>
                  <span v-if="item.body" class="block truncate text-xs text-muted-foreground">{{ toPlainText(item.body, 200) }}</span>
                </span>
                <span class="shrink-0 text-[11px] text-muted-foreground tabular-nums" :title="formatDateTime(item.createdAt)">{{ timeAgo(item.createdAt) }}</span>
              </li>
            </ol>
          </section>
        </div>
      </article>
    </div>
  </div>

  <!-- Phones: one list, tapping an item opens what it points to -->
  <div v-else class="w-full space-y-3 p-3">
    <div class="flex items-center justify-between gap-2">
      <h1 class="text-lg font-bold">Inbox</h1>
      <Button v-if="notifications.unreadCount" variant="ghost" size="sm" @click="notifications.markAllRead()"><CheckCheck /> Read all</Button>
    </div>
    <div class="relative">
      <Search class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input v-model="search" class="pl-9" placeholder="Search notifications" aria-label="Search notifications" />
    </div>
    <div class="-mx-3 flex gap-1.5 overflow-x-auto px-3 pb-1" role="tablist" aria-label="Filter notifications">
      <button
        v-for="chip in chips"
        :key="chip.value"
        type="button"
        role="tab"
        class="inline-flex shrink-0 items-center gap-1.5 border px-3 py-1.5 text-xs font-medium"
        :class="filter === chip.value ? 'border-primary bg-primary text-primary-foreground' : 'border-border/80 bg-card text-muted-foreground'"
        :aria-selected="filter === chip.value"
        @click="filter = chip.value"
      >
        {{ chip.label }} <span v-if="unreadIn(chip.value)" class="tabular-nums opacity-75">{{ unreadIn(chip.value) }}</span>
      </button>
    </div>
    <EmptyState
      v-if="!entries.length && !(notifications.isLoading && !notifications.items.length)"
      :icon="filter === 'unread' ? Inbox : BellOff"
      :title="search ? `Nothing matches “${search}”` : EMPTY[filter].title"
      :description="search ? 'Try other words or another filter.' : EMPTY[filter].description"
      class="border border-dashed bg-card/60 py-12"
    />
    <section v-for="section in sections" :key="section.label" class="space-y-1.5">
      <h2 class="px-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">{{ section.label }}</h2>
      <ul class="divide-y divide-border/60 overflow-hidden border border-border/80 bg-card">
        <li v-for="entry in section.entries" :key="entry.key">
          <NotificationItem
            :notification="entry.latest"
            :count="entry.items.length"
            :unread="isUnread(entry)"
            dense
            @open="select(entry)"
            @read="markEntryRead(entry)"
            @remove="removeEntry(entry)"
          />
        </li>
      </ul>
    </section>
  </div>
</template>

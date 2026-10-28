<script setup lang="ts">
import { format, isThisWeek, isToday, isYesterday, parseISO } from 'date-fns'
import { ArrowUpRight, BellOff, BellRing, Check, CheckCheck, Inbox, MessageCircle, Search, Trash2 } from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'
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
const search = ref('')
const selectedKey = ref<string | null>(null)

onMounted(() => notifications.fetchNotifications())

const counts = computed(() =>
  Object.fromEntries(INBOX_FILTERS.map((item) => [item.value, notifications.items.filter((notification) => matchesFilter(notification, item.value)).length])),
)
const unreadIn = (value: InboxFilter) => notifications.items.filter((notification) => !notification.readAt && matchesFilter(notification, value)).length
/** On phones, category chips only show when they have something in them. */
const chips = computed(() => INBOX_FILTERS.filter((item) => item.value === 'all' || item.value === 'unread' || counts.value[item.value]))
const folderLabel = computed(() => INBOX_FILTERS.find((item) => item.value === filter.value)?.label ?? 'Inbox')

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
  <!-- Desktop: a mailbox with folders, the message list and a reading pane, fitted to the window -->
  <div v-if="isDesktop" class="flex h-full w-full flex-col gap-4 p-5">
    <header class="flex shrink-0 flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="flex items-center gap-2.5 text-2xl font-bold tracking-tight">
          Inbox
          <span v-if="notifications.unreadCount" class="bg-brand px-2 py-0.5 text-xs font-semibold text-white tabular-nums">{{ notifications.unreadCount }} new</span>
        </h1>
        <p class="text-sm text-muted-foreground">Assignments, mentions, updates on work you watch, reminders and messages from the Vector team.</p>
      </div>
      <div class="flex items-center gap-2">
        <div class="relative w-72">
          <Search class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input v-model="search" class="pl-9" placeholder="Search notifications" aria-label="Search notifications" />
        </div>
        <Button variant="outline" :disabled="!notifications.unreadCount" @click="notifications.markAllRead()"><CheckCheck /> Mark all as read</Button>
      </div>
    </header>

    <div class="flex min-h-[28rem] flex-1 overflow-hidden border border-border/80 bg-card shadow-soft">
      <!-- Folders -->
      <nav class="w-52 shrink-0 space-y-0.5 overflow-y-auto border-r border-border/70 bg-muted/25 p-2 scrollbar-thin" aria-label="Inbox folders">
        <button
          v-for="folder in INBOX_FILTERS"
          :key="folder.value"
          type="button"
          class="relative flex h-9 w-full items-center gap-2.5 px-2.5 text-left text-sm transition-colors"
          :class="
            filter === folder.value
              ? 'bg-card font-semibold text-primary shadow-soft before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:bg-brand'
              : 'text-foreground/75 hover:bg-card/70 hover:text-foreground'
          "
          :aria-current="filter === folder.value ? 'page' : undefined"
          @click="(filter = folder.value), (selectedKey = null)"
        >
          <component :is="folder.icon" class="size-4 shrink-0" />
          <span class="min-w-0 flex-1 truncate">{{ folder.label }}</span>
          <span
            v-if="unreadIn(folder.value)"
            class="flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-brand px-1.5 text-[10px] font-semibold text-white tabular-nums"
            :aria-label="`${unreadIn(folder.value)} unread`"
          >
            {{ unreadIn(folder.value) }}
          </span>
        </button>
      </nav>

      <!-- Message list -->
      <section class="flex w-[24rem] shrink-0 flex-col border-r border-border/70 xl:w-[28rem]">
        <div class="flex h-11 shrink-0 items-center justify-between border-b border-border/70 px-4">
          <span class="text-sm font-semibold">{{ folderLabel }}</span>
          <span class="text-xs text-muted-foreground tabular-nums">{{ entries.length }} {{ entries.length === 1 ? 'notification' : 'notifications' }}</span>
        </div>
        <div class="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
          <div v-if="notifications.isLoading && !notifications.items.length" class="space-y-2 p-3">
            <Skeleton v-for="index in 7" :key="index" class="h-16 w-full" />
          </div>
          <EmptyState
            v-else-if="!entries.length"
            :icon="search ? Search : filter === 'unread' ? Inbox : BellOff"
            :title="search ? `Nothing matches “${search}”` : EMPTY[filter].title"
            :description="search ? 'Try other words or another folder.' : EMPTY[filter].description"
            class="py-16"
          />
          <template v-for="section in sections" v-else :key="section.label">
            <p class="sticky top-0 z-10 border-b border-border/60 bg-card/95 px-4 py-1.5 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase backdrop-blur">
              {{ section.label }}
            </p>
            <button
              v-for="entry in section.entries"
              :key="entry.key"
              type="button"
              class="relative flex w-full gap-3 border-b border-border/50 px-4 py-3 text-left transition-colors"
              :class="
                selectedKey === entry.key
                  ? 'bg-primary/10 before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-brand'
                  : isUnread(entry)
                    ? 'bg-primary/[0.03] hover:bg-muted/60'
                    : 'hover:bg-muted/60'
              "
              @click="select(entry)"
            >
              <UserAvatar v-if="entry.latest.actor" :user="entry.latest.actor" size="lg" class="size-9" />
              <span v-else class="flex size-9 shrink-0 items-center justify-center" :class="kindOf(entry.latest.type).tone">
                <component :is="kindOf(entry.latest.type).icon" class="size-4" />
              </span>
              <span class="min-w-0 flex-1">
                <span class="flex items-baseline gap-2">
                  <span class="min-w-0 flex-1 truncate text-sm" :class="isUnread(entry) ? 'font-semibold' : 'text-foreground/80'">
                    {{ senderOf(entry.latest) }}
                    <span v-if="entry.items.length > 1" class="font-normal text-muted-foreground">({{ entry.items.length }})</span>
                  </span>
                  <span class="shrink-0 text-[11px] tabular-nums" :class="isUnread(entry) ? 'font-semibold text-primary' : 'text-muted-foreground'">
                    {{ listTime(entry.latest) }}
                  </span>
                </span>
                <span class="block truncate text-[13px]" :class="isUnread(entry) ? 'font-medium text-foreground' : 'text-foreground/75'">{{ entry.latest.title }}</span>
                <span class="flex items-center gap-2">
                  <span class="min-w-0 flex-1 truncate text-xs text-muted-foreground">{{ entry.latest.body ? toPlainText(entry.latest.body, 140) : kindOf(entry.latest.type).label }}</span>
                  <span v-if="isUnread(entry)" class="size-2 shrink-0 rounded-full bg-brand" aria-label="Unread" />
                </span>
              </span>
            </button>
          </template>
        </div>
      </section>

      <!-- Reading pane: chat and tasks open right here, so you can reply without leaving the Inbox -->
      <article v-if="selected && paneMode === 'chat'" class="flex min-w-0 flex-1 flex-col">
        <div class="flex shrink-0 items-center gap-3 border-b border-border/70 px-5 py-3">
          <span class="flex size-9 items-center justify-center" :class="kindOf('support_message').tone"><MessageCircle class="size-4" /></span>
          <span class="min-w-0 flex-1">
            <span class="block text-sm font-semibold">Vector team</span>
            <span class="block truncate text-xs text-muted-foreground">Your organization’s conversation with the portal team. Reply right here.</span>
          </span>
          <Button variant="ghost" size="sm" class="text-muted-foreground hover:text-destructive" @click="removeEntry(selected)"><Trash2 /> Dismiss</Button>
        </div>
        <SupportChatThread
          :key="auth.organization!.id"
          class="min-h-0 flex-1"
          side="organization"
          :organization-id="auth.organization!.id"
          :load="organizationSupportApi.thread"
          :send="organizationSupportApi.send"
          :mark-read="organizationSupportApi.markRead"
          :remove="organizationSupportApi.remove"
          :set-disappearing="organizationSupportApi.setDisappearing"
          notice="Messages here are only between your organization’s admins and the Vector team."
        />
      </article>

      <article v-else-if="selected && paneMode === 'task'" class="min-w-0 flex-1 overflow-hidden">
        <IssueDetailView :key="taskKey!" :issue-key="taskKey!" mode="panel" class="h-full" @close="selectedKey = null" />
      </article>

      <article v-else class="min-w-0 flex-1 overflow-y-auto scrollbar-thin">
        <div v-if="!selected" class="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
          <span class="flex size-16 items-center justify-center bg-primary/10 text-primary"><BellRing class="size-8" /></span>
          <p class="font-medium">Select a notification to read it</p>
          <p class="max-w-xs text-sm text-muted-foreground">Opening one marks it as read. Tasks and Vector team messages open right here, so you can comment or reply.</p>
        </div>

        <template v-else>
          <div class="sticky top-0 z-10 flex items-center gap-2 border-b border-border/70 bg-card/95 px-6 py-3 backdrop-blur">
            <Button v-if="selected.latest.link" variant="brand" size="sm" @click="openLink(selected)">{{ openLabel(selected.latest) }} <ArrowUpRight /></Button>
            <Button v-if="isUnread(selected)" variant="outline" size="sm" @click="markEntryRead(selected)"><Check /> Mark as read</Button>
            <Button variant="ghost" size="sm" class="ml-auto text-muted-foreground hover:text-destructive" @click="removeEntry(selected)"><Trash2 /> Dismiss</Button>
          </div>

          <div class="space-y-6 px-6 py-6">
            <div class="space-y-3">
              <span class="inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium" :class="kindOf(selected.latest.type).tone">
                <component :is="kindOf(selected.latest.type).icon" class="size-3.5" /> {{ kindOf(selected.latest.type).label }}
              </span>
              <h2 class="text-2xl font-semibold tracking-tight">{{ selected.latest.title }}</h2>
            </div>

            <!-- The conversation: every folded notification, oldest first, like an email thread -->
            <ol class="space-y-3">
              <li v-for="item in [...selected.items].reverse()" :key="item.id" class="border border-border/70 bg-background/60">
                <div class="flex items-center gap-3 border-b border-border/50 px-4 py-3">
                  <UserAvatar v-if="item.actor" :user="item.actor" size="lg" class="size-9" />
                  <span v-else class="flex size-9 items-center justify-center" :class="kindOf(item.type).tone"><component :is="kindOf(item.type).icon" class="size-4" /></span>
                  <span class="min-w-0 flex-1">
                    <span class="block truncate text-sm font-semibold">{{ senderOf(item) }}</span>
                    <span class="block truncate text-xs text-muted-foreground">{{ item.title }}</span>
                  </span>
                  <span class="shrink-0 text-right text-xs text-muted-foreground">
                    <span class="block">{{ formatDateTime(item.createdAt) }}</span>
                    <span class="block">{{ timeAgo(item.createdAt) }}</span>
                  </span>
                </div>
                <p class="px-4 py-4 text-sm leading-relaxed whitespace-pre-line text-foreground/90">
                  {{ item.body ? toPlainText(item.body, 4000) : 'No further details. Use the button above to open it.' }}
                </p>
              </li>
            </ol>
          </div>
        </template>
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

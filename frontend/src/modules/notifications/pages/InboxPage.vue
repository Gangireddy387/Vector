<script setup lang="ts">
import { format, isThisWeek, isToday, isYesterday, parseISO } from 'date-fns'
import { ArrowLeft, ArrowUpRight, BellOff, CheckCheck, EllipsisVertical, Eraser, Inbox, MessageCircle, Search, Trash2 } from 'lucide-vue-next'
import { computed, defineAsyncComponent, onMounted, ref, useTemplateRef } from 'vue'
import { useRouter } from 'vue-router'
import EmptyState from '@/components/common/EmptyState.vue'
import UserAvatar from '@/components/common/UserAvatar.vue'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { useDevice } from '@/composables/useDevice'
import { formatDate, timeAgo } from '@/lib/format'
import { toPlainText } from '@/lib/markdown'
import { useAuthStore } from '@/modules/auth/auth.store'
import IssueDetailView from '@/modules/issues/components/detail/IssueDetailView.vue'
import SupportChatThread from '@/modules/support/components/SupportChatThread.vue'
import { organizationSupportApi } from '@/modules/support/support.api'
import type { AppNotification } from '@/types/models'
import NotificationDetail from '../components/NotificationDetail.vue'
import { INBOX_FILTERS, type InboxFilter, kindOf, matchesFilter } from '../notification-kinds'
import { useNotificationsStore } from '../notifications.store'

const ProjectChatPage = defineAsyncComponent(() => import('@/modules/chat/pages/ProjectChatPage.vue'))

const notifications = useNotificationsStore()
const auth = useAuthStore()
const router = useRouter()
const { isDesktop, isWide } = useDevice()
const filter = ref<InboxFilter>('all')
const supportChat = useTemplateRef<InstanceType<typeof SupportChatThread>>('supportChat')
const search = ref('')
const selectedKey = ref<string | null>(null)

onMounted(() => void notifications.fetchNotifications().catch(() => undefined))

async function retryLoad() {
  try {
    await notifications.fetchNotifications()
  } catch {
    /* loadError is set on the store */
  }
}

const unreadIn = (value: InboxFilter) => notifications.items.filter((notification) => !notification.readAt && matchesFilter(notification, value)).length
const totalIn = (value: InboxFilter) => notifications.items.filter((notification) => matchesFilter(notification, value)).length
const folders = computed(() => INBOX_FILTERS)
const activeFolder = computed(() => folders.value.find((folder) => folder.value === filter.value) ?? folders.value[0]!)
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
/** Project chat links (/projects/:id/chat?message=…) open that conversation at the message, ready to reply. */
const chatTarget = computed(() => {
  const link = selected.value?.latest.link
  const projectId = link?.match(/^\/projects\/([^/?#]+)\/chat(?:[?#]|$)/)?.[1]
  if (!projectId || !auth.hasFeature('chat')) return null
  return { projectId, messageId: new URLSearchParams(link!.split('?')[1] ?? '').get('message') }
})
/** What the reading pane shows: the live support chat, the task itself, the project chat, or the notification with its context. */
const paneMode = computed(() => {
  if (!selected.value) return null
  if (selected.value.latest.type === 'support_message' && auth.isOrganizationAdmin && auth.organization) return 'chat'
  if (taskKey.value) return 'task'
  return chatTarget.value ? 'project-chat' : 'thread'
})

const projectOf = (notification: AppNotification) => notification.link?.match(/^\/projects\/([^/?#]+)/)?.[1] ?? null
/** Other notifications about the selected one's project, for the "More from…" list. */
const related = computed(() => {
  if (!selected.value) return []
  const projectId = projectOf(selected.value.latest)
  if (!projectId) return []
  const own = new Set(selected.value.items.map((item) => item.id))
  return notifications.items.filter((item) => !own.has(item.id) && projectOf(item) === projectId).slice(0, 6)
})
function selectNotification(id: string) {
  let entry = entries.value.find((item) => item.items.some((notification) => notification.id === id))
  if (!entry) {
    filter.value = 'all'
    search.value = ''
    entry = entries.value.find((item) => item.items.some((notification) => notification.id === id))
  }
  if (entry) select(entry)
}

const isUnread = (entry: Entry) => entry.items.some((item) => !item.readAt)
const markEntryRead = (entry: Entry, clicked = false) =>
  Promise.all(
    entry.items
      .filter((item) => !item.readAt || (clicked && !item.clickedAt))
      .map((item) => (clicked ? notifications.openNotification(item) : notifications.markRead(item))),
  )
async function removeEntry(entry: Entry) {
  if (selectedKey.value === entry.key) selectedKey.value = null
  await Promise.all(entry.items.map((item) => notifications.remove(item)))
}

/** Workspace shell: show it in the reading pane. Phones: go straight to the linked place. */
function select(entry: Entry) {
  const navigates = !isDesktop.value && Boolean(entry.latest.link)
  void markEntryRead(entry, navigates)
  if (isDesktop.value) selectedKey.value = entry.key
  else if (entry.latest.link) void router.push(entry.latest.link)
}
function openLink(entry: Entry) {
  void markEntryRead(entry, true)
  if (entry.latest.link) void router.push(entry.latest.link)
}

const senderOf = (notification: AppNotification) => notification.actor?.name ?? kindOf(notification.type).label
const listTime = (notification: AppNotification) => {
  const date = parseISO(notification.createdAt)
  return isToday(date) ? format(date, 'HH:mm') : format(date, 'd MMM')
}

const showFolderRail = computed(() => isDesktop.value && (isWide.value || !selected.value))
const showList = computed(() => !isDesktop.value || isWide.value || !selected.value)

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
  <!-- One adaptive shell: phone, tablet and desktop share the same folders + list language -->
  <div class="flex h-full min-h-0 w-full flex-1 flex-col bg-background">
    <header
      class="flex shrink-0 items-center gap-2 border-b border-border px-3"
      :class="isDesktop ? 'h-12 sm:gap-3 sm:px-4' : 'h-11 gap-2'"
    >
      <h1 v-if="isDesktop" class="flex min-w-0 items-center gap-2 text-[15px] font-semibold">
        Inbox
        <span
          v-if="notifications.unreadCount"
          class="rounded-full bg-primary/12 px-1.5 text-[11px] font-semibold text-primary tabular-nums dark:bg-primary/20"
        >
          {{ notifications.unreadCount }}
        </span>
      </h1>
      <div class="relative min-w-0 flex-1" :class="isDesktop ? 'ml-auto w-36 sm:w-44 lg:w-60 sm:flex-none' : ''">
        <Search class="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input v-model="search" class="h-8 pl-8 sm:h-7" placeholder="Search notifications" aria-label="Search notifications" />
      </div>
      <Button
        variant="outline"
        size="sm"
        class="shrink-0"
        :disabled="!notifications.unreadCount"
        @click="notifications.markAllRead()"
      >
        <CheckCheck />
        <span class="hidden sm:inline">Mark all read</span>
      </Button>
    </header>

    <div class="flex min-h-0 flex-1 overflow-hidden">
      <!-- Desktop/tablet: vertical folders -->
      <nav
        v-if="showFolderRail"
        class="flex w-[11.5rem] shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-border bg-muted/20 px-2 py-3 scrollbar-thin xl:w-[12.5rem]"
        aria-label="Inbox folders"
      >
        <p class="mb-1.5 px-2.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Folders</p>
        <button
          v-for="folder in folders"
          :key="folder.value"
          type="button"
          class="flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-left text-[13px] font-medium transition-colors"
          :class="
            filter === folder.value
              ? 'bg-card text-foreground shadow-soft ring-1 ring-border/80'
              : 'text-muted-foreground hover:bg-card/70 hover:text-foreground'
          "
          :aria-current="filter === folder.value ? 'page' : undefined"
          @click="chooseFilter(folder.value)"
        >
          <component :is="folder.icon" class="size-4 shrink-0" :class="filter === folder.value && 'text-primary'" />
          <span class="min-w-0 flex-1 truncate">{{ folder.label }}</span>
          <span
            v-if="unreadIn(folder.value)"
            class="min-w-5 rounded-full bg-primary px-1.5 text-center text-[10px] font-semibold text-primary-foreground tabular-nums"
            :aria-label="`${unreadIn(folder.value)} unread`"
          >
            {{ unreadIn(folder.value) }}
          </span>
          <span v-else-if="totalIn(folder.value)" class="text-[11px] font-medium text-muted-foreground/80 tabular-nums">
            {{ totalIn(folder.value) }}
          </span>
        </button>
      </nav>

      <!-- List column -->
      <section
        v-show="showList"
        class="flex min-w-0 flex-col border-border"
        :class="isWide && selected ? 'w-[min(24rem,34%)] shrink-0 border-r xl:w-[26rem]' : 'min-w-0 flex-1'"
      >
        <!-- Phone: same folders as chips so the model matches desktop -->
        <div
          v-if="!isDesktop"
          class="flex shrink-0 gap-1.5 overflow-x-auto border-b border-border/70 px-3 py-2 scrollbar-none"
          role="tablist"
          aria-label="Inbox folders"
        >
          <button
            v-for="folder in folders"
            :key="folder.value"
            type="button"
            role="tab"
            class="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors"
            :class="
              filter === folder.value
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted/60 text-muted-foreground hover:bg-accent hover:text-foreground'
            "
            :aria-selected="filter === folder.value"
            @click="chooseFilter(folder.value)"
          >
            <component :is="folder.icon" class="size-3.5" />
            {{ folder.label }}
            <span
              v-if="unreadIn(folder.value)"
              class="min-w-4 rounded-full px-1 text-center text-[10px] font-semibold tabular-nums"
              :class="filter === folder.value ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-primary text-primary-foreground'"
            >
              {{ unreadIn(folder.value) }}
            </span>
          </button>
        </div>

        <div v-else class="flex h-10 shrink-0 items-center gap-2 border-b border-border/70 px-3">
          <component :is="activeFolder.icon" class="size-3.5 text-primary" />
          <p class="min-w-0 flex-1 truncate text-[13px] font-semibold">{{ activeFolder.label }}</p>
          <span class="text-[11px] text-muted-foreground tabular-nums">{{ entries.length }}</span>
        </div>

        <div class="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
          <div v-if="notifications.isLoading && !notifications.items.length" class="space-y-2 p-3">
            <Skeleton v-for="index in 7" :key="index" class="h-14 w-full rounded-lg" />
          </div>
          <EmptyState
            v-else-if="notifications.loadError && !notifications.items.length"
            :icon="Inbox"
            title="Inbox did not load"
            :description="notifications.loadError"
            class="px-4 py-14"
          >
            <Button variant="outline" @click="retryLoad">Try again</Button>
          </EmptyState>
          <EmptyState
            v-else-if="!entries.length"
            :icon="search ? Search : filter === 'unread' ? Inbox : BellOff"
            :title="search ? `Nothing matches “${search}”` : EMPTY[filter].title"
            :description="search ? 'Try other words or another folder.' : EMPTY[filter].description"
            class="px-4 py-14"
          />
          <template v-for="section in sections" v-else :key="section.label">
            <p class="sticky top-0 z-10 bg-background/95 px-4 pt-3 pb-1 text-[11.5px] font-medium text-muted-foreground backdrop-blur">
              {{ section.label }}
            </p>
            <button
              v-for="entry in section.entries"
              :key="entry.key"
              type="button"
              class="relative mx-1.5 flex w-[calc(100%-0.75rem)] items-start gap-3 rounded-lg px-2.5 py-2.5 text-left transition-colors hover:bg-accent/60"
              :class="selectedKey === entry.key && 'bg-accent'"
              @click="select(entry)"
            >
              <UserAvatar v-if="entry.latest.actor" :user="entry.latest.actor" size="md" class="mt-0.5 size-8" />
              <span v-else class="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg" :class="kindOf(entry.latest.type).tone">
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

      <!-- Reading pane (desktop/tablet only) -->
      <article v-if="isDesktop && selected && paneMode === 'chat'" class="flex min-w-0 flex-1 flex-col">
        <div class="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3 sm:gap-3 sm:px-4">
          <Button v-if="!isWide" variant="ghost" size="icon-sm" aria-label="Back to inbox" @click="selectedKey = null"><ArrowLeft /></Button>
          <span class="flex size-9 items-center justify-center rounded-lg" :class="kindOf('support_message').tone"><MessageCircle class="size-4" /></span>
          <span class="min-w-0 flex-1">
            <span class="block text-sm font-semibold">Vector team</span>
            <span class="block truncate text-xs text-muted-foreground">Your organization’s conversation with the portal team. Reply right here.</span>
          </span>
          <div id="inbox-chat-actions" class="flex items-center gap-0.5" />
          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <Button variant="ghost" size="icon-sm" aria-label="Chat options"><EllipsisVertical /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" class="w-48">
              <DropdownMenuItem variant="destructive" @select="supportChat?.clearChat()"><Eraser /> Clear chat</DropdownMenuItem>
              <DropdownMenuItem @select="removeEntry(selected)"><Trash2 /> Dismiss from Inbox</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <SupportChatThread
          ref="supportChat"
          :key="auth.organization!.id"
          class="min-h-0 flex-1"
          side="organization"
          :organization-id="auth.organization!.id"
          :api="organizationSupportApi"
          actions-to="#inbox-chat-actions"
          notice="Messages here are only between your organization’s admins and the Vector team."
        />
      </article>

      <article v-else-if="isDesktop && selected && paneMode === 'task'" class="min-w-0 flex-1 overflow-hidden">
        <IssueDetailView :key="taskKey!" :issue-key="taskKey!" mode="panel" class="h-full" @close="selectedKey = null" />
      </article>

      <article v-else-if="isDesktop && selected && paneMode === 'project-chat'" class="flex min-w-0 flex-1 flex-col">
        <div class="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3 sm:gap-2.5 sm:px-4">
          <Button v-if="!isWide" variant="ghost" size="icon-sm" aria-label="Back to inbox" @click="selectedKey = null"><ArrowLeft /></Button>
          <UserAvatar v-if="selected.latest.actor" :user="selected.latest.actor" size="md" class="size-7" />
          <span class="min-w-0 flex-1">
            <span class="block truncate text-[13px] font-semibold">{{ selected.latest.title }}</span>
            <span class="block truncate text-[11.5px] text-muted-foreground">
              {{ timeAgo(selected.latest.createdAt) || formatDate(selected.latest.createdAt, 'd MMM, HH:mm') }}
            </span>
          </span>
          <Button variant="ghost" size="sm" class="text-muted-foreground hover:text-destructive" @click="removeEntry(selected)"><Trash2 /> Dismiss</Button>
          <Button variant="outline" size="sm" @click="openLink(selected)">Open full chat <ArrowUpRight /></Button>
        </div>
        <ProjectChatPage :key="chatTarget!.projectId" :project-id="chatTarget!.projectId" :message-id="chatTarget!.messageId" embedded class="min-h-0 flex-1" />
      </article>

      <article v-else-if="isDesktop && selected" class="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div v-if="!isWide" class="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3">
          <Button variant="ghost" size="icon-sm" aria-label="Back to inbox" @click="selectedKey = null"><ArrowLeft /></Button>
          <span class="truncate text-sm font-semibold">Notification</span>
        </div>
        <NotificationDetail
          class="min-h-0 flex-1"
          :latest="selected.latest"
          :items="selected.items"
          :unread="isUnread(selected)"
          :related="related"
          @open="openLink(selected)"
          @read="markEntryRead(selected)"
          @remove="removeEntry(selected)"
          @select="selectNotification"
        />
      </article>
    </div>
  </div>
</template>

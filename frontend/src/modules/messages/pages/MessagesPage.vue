<script setup lang="ts">
import { format, isToday, isYesterday, parseISO } from 'date-fns'
import {
  ArrowLeft,
  AtSign,
  BellOff,
  BellRing,
  Bookmark,
  Building2,
  Check,
  ChevronDown,
  Ellipsis,
  EllipsisVertical,
  Eraser,
  ExternalLink,
  FileText,
  FolderOpen,
  Hash,
  Kanban,
  Lock,
  LogOut,
  MessageCirclePlus,
  MessagesSquare,
  Pencil,
  Plus,
  Search,
  Trash2,
  UsersRound,
  X,
} from 'lucide-vue-next'
import { computed, nextTick, onMounted, onBeforeUnmount, ref, useTemplateRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import UserAvatar from '@/components/common/UserAvatar.vue'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { useConfirm } from '@/composables/useConfirm'
import { useDevice } from '@/composables/useDevice'
import { getErrorMessage } from '@/lib/http'
import { timeAgo } from '@/lib/format'
import { useAuthStore } from '@/modules/auth/auth.store'
import MeetButton from '@/modules/meetings/components/MeetButton.vue'
import type { MeetingPreset } from '@/modules/meetings/useMeetingActions'
import { usersApi } from '@/modules/projects/projects.api'
import PresenceBadge from '@/components/common/PresenceBadge.vue'
import { PRESENCE_LOOK } from '@/lib/presence'
import { usePresenceStore } from '@/stores/presence.store'
import type { UserSummary } from '@/types/models'
import ChannelDialog from '../components/ChannelDialog.vue'
import ChannelFiles from '../components/ChannelFiles.vue'
import ChannelBoard from '../components/ChannelBoard.vue'
import ChannelDocs from '../components/ChannelDocs.vue'
import ChannelMembersDialog from '../components/ChannelMembersDialog.vue'
import ChannelThread from '../components/ChannelThread.vue'
import ConversationThread from '../components/ConversationThread.vue'
import SavedMessagesDialog from '../components/SavedMessagesDialog.vue'
import { type ConversationSummary, type NotifyLevel, channelsApi, messagesApi, notifyLevelOf } from '../messages.api'
import { useMessagesStore } from '../messages.store'

/**
 * Like Microsoft Teams: "Chat" holds direct messages; "Teams" holds each team with its General chat and channels,
 * and the department chats. The list is on the left, the open conversation on the right.
 */
const props = defineProps<{ conversationId?: string }>()

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()
const store = useMessagesStore()
const presenceStore = usePresenceStore()
const confirm = useConfirm()
const { isWide } = useDevice()
const search = ref('')
const thread = useTemplateRef<InstanceType<typeof ConversationThread>>('thread')

const canDirect = computed(() => auth.hasFeature('directMessages'))
const canGroup = computed(() => auth.hasFeature('teamChat'))
const tab = ref<'chat' | 'teams'>(canDirect.value ? 'chat' : 'teams')

onMounted(() => store.load().catch((error) => toast.error(getErrorMessage(error))))

const selected = computed(() => store.conversations?.find((conversation) => conversation.id === props.conversationId) ?? null)
watch(
  () => props.conversationId ?? null,
  (id) => (store.openId = id),
  { immediate: true },
)
onBeforeUnmount(() => (store.openId = null))
// Opening a conversation (from a link or a notification) shows the tab it belongs to.
watch(
  () => selected.value?.kind,
  (kind) => kind && (tab.value = kind === 'direct' ? 'chat' : 'teams'),
  { immediate: true },
)
const focusPostId = computed(() => (typeof route.query.post === 'string' ? route.query.post : null))
const canAttach = computed(() => auth.hasFeature('attachments'))
const savedOpen = ref(false)

/** The open channel's tabs (Posts, Files, Docs, Board) and its in-channel search. */
const view = ref<'posts' | 'files' | 'docs' | 'board'>('posts')
const channelSearch = ref('')
const isSearching = ref(false)

const NOTIFY_OPTIONS: Array<{ value: NotifyLevel; label: string; description: string; icon: typeof BellRing }> = [
  { value: 'all', label: 'All messages', description: 'Sounds and unread badge for every post', icon: BellRing },
  { value: 'mentions', label: 'Mentions only', description: 'Quiet unless someone @mentions you', icon: AtSign },
  { value: 'none', label: 'Off', description: 'No sounds, badge, or mention alerts', icon: BellOff },
]

const channelTabs = computed(() => {
  const tabs: Array<{ value: 'posts' | 'files' | 'docs' | 'board'; label: string }> = [
    { value: 'posts', label: 'Posts' },
    { value: 'files', label: 'Files' },
    { value: 'docs', label: 'Docs' },
  ]
  if (selected.value?.team) tabs.push({ value: 'board', label: 'Board' })
  return tabs
})

watch(
  () => selected.value?.team?.id,
  () => {
    if (view.value === 'board' && !selected.value?.team) view.value = 'posts'
  },
)
watch(
  () => props.conversationId,
  () => {
    view.value = 'posts'
    channelSearch.value = ''
    isSearching.value = false
  },
)
async function openPost(postId: string) {
  view.value = 'posts'
  channelSearch.value = ''
  isSearching.value = false
  await router.replace({ query: { ...route.query, post: postId } })
}
function closeSearch() {
  channelSearch.value = ''
  isSearching.value = false
}

async function setNotifyLevel(conversation: ConversationSummary, notifyLevel: NotifyLevel) {
  if (notifyLevelOf(conversation) === notifyLevel) return
  try {
    const summary = await messagesApi.setNotifyLevel(conversation.id, notifyLevel)
    store.upsert(summary)
    const option = NOTIFY_OPTIONS.find((item) => item.value === notifyLevelOf(summary))
    toast.success(`${headerTitle(summary)}: ${option?.label ?? notifyLevel}`, {
      description: option?.description,
    })
  } catch (error) {
    toast.error(getErrorMessage(error))
  }
}

const notifyIcon = (conversation: ConversationSummary) => {
  const level = notifyLevelOf(conversation)
  if (level === 'none') return BellOff
  if (level === 'mentions') return AtSign
  return BellRing
}

/** Everyone in the open team chat or channel: who can be @mentioned, and who "Meet" calls. */
const conversationPeople = ref<UserSummary[]>([])
async function loadPeople() {
  const conversation = selected.value
  conversationPeople.value = []
  if (!conversation || conversation.kind === 'direct') return
  const people = await messagesApi.people(conversation.id).catch(() => [])
  if (selected.value?.id === conversation.id) conversationPeople.value = people
}
watch(() => [selected.value?.id, selected.value?.memberCount], loadPeople, { immediate: true })

const meetPreset = computed<MeetingPreset | null>(() => {
  const conversation = selected.value
  if (!conversation || conversation.kind === 'direct') return null
  if (conversation.kind === 'department') {
    return conversation.department ? { title: conversation.title, people: conversationPeople.value, context: { type: 'department', id: conversation.department.id } } : null
  }
  if (!conversation.team) return null
  const title = conversation.kind === 'team' ? conversation.team.name : `${conversation.team.name} · ${conversation.title}`
  return { title, people: conversationPeople.value, context: { type: 'team', id: conversation.team.id } }
})

const matches = (conversation: ConversationSummary) => {
  const term = search.value.trim().toLowerCase()
  return !term || `${conversation.title} ${conversation.subtitle} ${conversation.team?.name ?? ''}`.toLowerCase().includes(term)
}
const all = computed(() => store.conversations ?? [])
const directChats = computed(() => all.value.filter((conversation) => conversation.kind === 'direct' && matches(conversation)))

/** Each team: its General chat first, then its channels by name. */
const teamGroups = computed(() => {
  const groups = all.value
    .filter((conversation) => conversation.kind === 'team' && conversation.team)
    .map((general) => {
      const channels = all.value
        .filter((conversation) => conversation.kind === 'channel' && conversation.team?.id === general.team!.id)
        .sort((a, b) => a.title.localeCompare(b.title))
      const teamMatches = matches(general)
      return {
        team: general.team!,
        general,
        channels: teamMatches ? channels : channels.filter(matches),
        visible: teamMatches || channels.some(matches),
        unread: [general, ...channels].reduce((total, conversation) => total + (notifyLevelOf(conversation) === 'all' ? conversation.unread : 0), 0),
      }
    })
  return groups.filter((group) => group.visible).sort((a, b) => a.team.name.localeCompare(b.team.name))
})
const departmentChats = computed(() => all.value.filter((conversation) => conversation.kind === 'department' && matches(conversation)))
const teamsForChannels = computed(() => all.value.filter((conversation) => conversation.kind === 'team' && conversation.team).map((conversation) => conversation.team!))

const unreadOf = (list: ConversationSummary[]) =>
  list.reduce((total, conversation) => total + (notifyLevelOf(conversation) === 'all' ? conversation.unread : 0), 0)
const chatUnread = computed(() => unreadOf(all.value.filter((conversation) => conversation.kind === 'direct')))
const teamsUnread = computed(() => unreadOf(all.value.filter((conversation) => conversation.kind !== 'direct')))

const collapsed = ref(new Set<string>())
const toggleTeam = (teamId: string) => {
  const next = new Set(collapsed.value)
  if (next.has(teamId)) next.delete(teamId)
  else next.add(teamId)
  collapsed.value = next
}

const open = (conversation: ConversationSummary) => router.push({ name: 'messages', params: { conversationId: conversation.id } })

const listTime = (value: string) => {
  const date = parseISO(value)
  return isToday(date) ? format(date, 'HH:mm') : isYesterday(date) ? 'Yesterday' : format(date, 'd/M/yy')
}
const preview = (conversation: ConversationSummary) => {
  const last = conversation.lastMessage
  if (!last) return 'Say hello 👋'
  if (last.deleted) return 'This message was deleted'
  return last.author?.id === auth.user?.id ? `You: ${last.body}` : last.body
}
/** Live, like Teams: "Available", "In a call", "Offline · last seen 5 minutes ago"… */
const presence = (conversation: ConversationSummary) => {
  if (conversation.kind === 'channel' || conversation.kind === 'team' || conversation.kind === 'department') {
    const people = selected.value?.id === conversation.id ? conversationPeople.value : []
    if (people.length) presenceStore.track(people.map((person) => person.id))
    const online = people.filter((person) => {
      const status = presenceStore.statusOf(person.id)
      return status != null && status !== 'offline'
    }).length
    const total = conversation.memberCount ?? people.length
    const team = conversation.kind === 'department' ? '' : (conversation.team?.name ?? '')
    if (conversation.kind === 'department') {
      return online > 0 ? `${online} online · ${total} people · ${conversation.subtitle}` : `${total} people · ${conversation.subtitle}`
    }
    if (online > 0) return `${team} · ${online} online · ${total} people`
    return `${team} · ${total} people`
  }
  const live = presenceStore.describe(conversation.person?.id)
  if (live) return live
  if (conversation.person?.isOnline) return 'Available'
  return conversation.person?.lastSeenAt ? `last seen ${timeAgo(conversation.person.lastSeenAt)}` : (conversation.subtitle || 'Direct message')
}
const statusOf = (conversation: ConversationSummary) => (conversation.kind === 'direct' ? presenceStore.statusOf(conversation.person?.id) : null)
const headerTitle = (conversation: ConversationSummary) => (conversation.kind === 'team' ? 'General' : conversation.title)

// --- New direct chat ---------------------------------------------------------
const isPickerOpen = ref(false)
const people = ref<UserSummary[] | null>(null)
const peopleSearch = ref('')
const isOpening = ref<string | null>(null)

async function openPicker() {
  isPickerOpen.value = true
  peopleSearch.value = ''
  if (!people.value) people.value = (await usersApi.search({}).catch(() => [])).filter((person) => person.id !== auth.user?.id)
}
const pickable = computed(() => {
  const term = peopleSearch.value.trim().toLowerCase()
  return (people.value ?? []).filter((person) => !term || `${person.name} ${person.email} ${person.title ?? ''}`.toLowerCase().includes(term))
})

async function startChat(person: UserSummary) {
  isOpening.value = person.id
  try {
    const conversation = await messagesApi.openDirect(person.id)
    store.upsert(conversation)
    isPickerOpen.value = false
    await open(conversation)
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    isOpening.value = null
  }
}

// --- Channels ----------------------------------------------------------------
const channelDialog = ref<{ open: boolean; channel: ConversationSummary | null; teamId: string | null }>({ open: false, channel: null, teamId: null })
const membersOpen = ref(false)
watch(
  () => props.conversationId,
  () => (membersOpen.value = false),
)
const reload = () => void store.load().catch(() => undefined)

const addChannel = (teamId: string | null = null) => (channelDialog.value = { open: true, channel: null, teamId })
const editChannel = (conversation: ConversationSummary) => (channelDialog.value = { open: true, channel: conversation, teamId: null })

async function onChannelSaved(conversation: ConversationSummary, created: boolean) {
  store.upsert(conversation)
  if (!created) return
  toast.success(`${conversation.title} added`)
  await open(conversation)
  // After the page switched to the new channel (which closes the people dialog of the previous one).
  await nextTick()
  if (conversation.channel?.privacy === 'private') membersOpen.value = true
}

async function deleteChannel(conversation: ConversationSummary) {
  const ok = await confirm({
    title: `Delete ${conversation.title}?`,
    description: 'The channel and every post in it are removed for everyone in it. This cannot be undone.',
    confirmLabel: 'Delete channel',
    destructive: true,
  })
  if (!ok || !conversation.channel) return
  try {
    await channelsApi.remove(conversation.channel.id)
    store.remove(conversation.id)
    toast.success('Channel deleted')
    await router.push({ name: 'messages' })
  } catch (error) {
    toast.error(getErrorMessage(error))
  }
}

async function leaveChannel(conversation: ConversationSummary) {
  const ok = await confirm({
    title: `Leave ${conversation.title}?`,
    description: 'It is a private channel: you stop seeing it until someone adds you again.',
    confirmLabel: 'Leave channel',
    destructive: true,
  })
  if (!ok || !conversation.channel || !auth.user) return
  try {
    await channelsApi.removeMember(conversation.channel.id, auth.user.id)
    store.remove(conversation.id)
    await router.push({ name: 'messages' })
  } catch (error) {
    toast.error(getErrorMessage(error))
  }
}
</script>

<template>
  <div class="flex min-h-0 w-full flex-1 flex-col">
    <div class="flex min-h-0 flex-1 overflow-hidden bg-background">
      <!-- Conversation list: full width on phone/tablet until a chat is open -->
      <aside
        v-if="isWide || !selected"
        class="flex min-h-0 flex-col border-border"
        :class="isWide ? 'w-[min(22rem,36%)] shrink-0 border-r xl:w-[26rem]' : 'w-full'"
      >
        <header class="flex h-12 shrink-0 items-center gap-1 px-4">
          <h1 class="flex-1 text-[15px] font-semibold">{{ tab === 'chat' ? 'Chat' : 'Teams' }}</h1>
          <Button variant="ghost" size="icon-sm" title="Saved messages" aria-label="Saved messages" @click="savedOpen = true"><Bookmark /></Button>
          <Button v-if="tab === 'chat' && canDirect" variant="ghost" size="icon-sm" title="New chat" aria-label="New chat" @click="openPicker"><MessageCirclePlus /></Button>
          <Button v-else-if="tab === 'teams' && teamsForChannels.length" variant="ghost" size="icon-sm" title="Add a channel" aria-label="Add a channel" @click="addChannel()">
            <Plus />
          </Button>
        </header>

        <div v-if="canDirect && canGroup" class="shrink-0 px-3 pb-2">
          <div class="grid grid-cols-2 rounded-md bg-muted p-0.5" role="tablist">
            <button
              v-for="item in [{ value: 'chat', label: 'Chat', unread: chatUnread }, { value: 'teams', label: 'Teams', unread: teamsUnread }] as const"
              :key="item.value"
              type="button"
              role="tab"
              class="inline-flex h-7 items-center justify-center gap-1.5 rounded-[5px] text-xs font-medium transition-colors"
              :class="tab === item.value ? 'bg-card text-foreground shadow-[0_0_0_1px_var(--border)]' : 'text-muted-foreground hover:text-foreground'"
              :aria-selected="tab === item.value"
              @click="tab = item.value"
            >
              {{ item.label }}
              <span v-if="item.unread" class="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground tabular-nums">
                {{ item.unread > 99 ? '99+' : item.unread }}
              </span>
            </button>
          </div>
        </div>

        <div class="shrink-0 px-3 pb-2">
          <div class="relative">
            <Search class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input v-model="search" class="h-8 pl-9" :placeholder="tab === 'chat' ? 'Search chats' : 'Search teams and channels'" aria-label="Search" />
          </div>
        </div>

        <div class="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
          <div v-if="store.conversations === null" class="space-y-2 p-3">
            <Skeleton v-for="index in 6" :key="index" class="h-14 w-full" />
          </div>

          <!-- Chat: direct messages -->
          <template v-else-if="tab === 'chat'">
            <div v-if="!directChats.length" class="flex flex-col items-center gap-3 px-6 py-12 text-center">
              <span class="flex size-12 items-center justify-center bg-primary/10 text-primary"><MessagesSquare class="size-6" /></span>
              <p class="text-sm font-medium">{{ search ? `No chats match “${search}”` : 'No chats yet' }}</p>
              <p class="text-xs text-muted-foreground">Start a private chat with anyone in your organization.</p>
              <Button v-if="!search" variant="brand" size="sm" @click="openPicker"><MessageCirclePlus /> New chat</Button>
            </div>
            <button
              v-for="conversation in directChats"
              :key="conversation.id"
              type="button"
              class="mx-1.5 flex w-[calc(100%-0.75rem)] items-center gap-3 rounded-md px-2.5 py-2 text-left transition-colors"
              :class="selected?.id === conversation.id ? 'bg-accent' : 'hover:bg-accent/60'"
              @click="open(conversation)"
            >
              <span class="relative shrink-0">
                <UserAvatar :user="conversation.person" size="lg" class="size-10 text-sm" />
                <PresenceBadge v-if="statusOf(conversation)" :status="statusOf(conversation)!" size="md" class="absolute right-0 bottom-0" />
              </span>
              <span class="min-w-0 flex-1">
                <span class="flex items-baseline gap-2">
                  <span class="min-w-0 flex-1 truncate text-[13.5px]" :class="conversation.unread ? 'font-semibold' : 'font-medium'">{{ conversation.title }}</span>
                  <span class="shrink-0 text-[11px]" :class="conversation.unread ? 'font-semibold text-primary' : 'text-muted-foreground'">
                    {{ conversation.lastMessage ? listTime(conversation.lastMessage.createdAt) : '' }}
                  </span>
                </span>
                <span class="mt-0.5 flex items-center gap-2">
                  <span class="min-w-0 flex-1 truncate text-[13px]" :class="conversation.unread ? 'text-foreground' : 'text-muted-foreground'">{{ preview(conversation) }}</span>
                  <span v-if="conversation.unread" class="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1.5 text-[10.5px] font-semibold text-primary-foreground tabular-nums">
                    {{ conversation.unread > 99 ? '99+' : conversation.unread }}
                  </span>
                </span>
              </span>
            </button>
          </template>

          <!-- Teams: each team with its channels, then department chats -->
          <template v-else>
            <div v-if="!teamGroups.length && !departmentChats.length" class="flex flex-col items-center gap-3 px-6 py-12 text-center">
              <span class="flex size-12 items-center justify-center bg-primary/10 text-primary"><UsersRound class="size-6" /></span>
              <p class="text-sm font-medium">{{ search ? `Nothing matches “${search}”` : 'No teams yet' }}</p>
              <p v-if="!search" class="text-xs text-muted-foreground">
                {{
                  auth.isOrganizationAdmin
                    ? 'Channels live inside teams. Create a department, add a team to it with its people, and the team shows up here with its General channel. Then add more channels with +.'
                    : 'Your teams and their channels appear here once an admin adds you to a team.'
                }}
              </p>
              <Button v-if="auth.isOrganizationAdmin && !search" variant="brand" size="sm" @click="router.push({ name: 'departments' })"><Building2 /> Create a team</Button>
            </div>

            <section v-for="group in teamGroups" :key="group.team.id" class="px-1.5 pb-1">
              <div class="group/team flex items-center gap-1 rounded-md pr-1 hover:bg-accent/40">
                <button type="button" class="flex min-w-0 flex-1 items-center gap-2.5 px-2 py-2 text-left" :aria-expanded="!collapsed.has(group.team.id)" @click="toggleTeam(group.team.id)">
                  <ChevronDown class="size-3.5 shrink-0 text-muted-foreground transition-transform" :class="collapsed.has(group.team.id) && '-rotate-90'" />
                  <span class="flex size-7 shrink-0 items-center justify-center rounded-md bg-sky-500 text-xs font-semibold text-white">{{ group.team.name.slice(0, 2).toUpperCase() }}</span>
                  <span class="min-w-0 flex-1 truncate text-[13.5px]" :class="group.unread && collapsed.has(group.team.id) ? 'font-semibold' : 'font-medium'">{{ group.team.name }}</span>
                  <span v-if="group.unread && collapsed.has(group.team.id)" class="size-2 shrink-0 rounded-full bg-primary" aria-label="Unread messages" />
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger as-child>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      class="opacity-0 group-hover/team:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
                      :aria-label="`${group.team.name} options`"
                      title="More options"
                    >
                      <Ellipsis />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" class="w-52">
                    <DropdownMenuItem @select="addChannel(group.team.id)"><Plus /> Add a channel</DropdownMenuItem>
                    <DropdownMenuItem @select="router.push({ name: 'team', params: { teamId: group.team.id } })"><ExternalLink /> Open the team page</DropdownMenuItem>
                    <DropdownMenuLabel class="text-[11px] font-medium text-muted-foreground">General alerts</DropdownMenuLabel>
                    <DropdownMenuItem v-for="option in NOTIFY_OPTIONS" :key="option.value" @select="setNotifyLevel(group.general, option.value)">
                      <component :is="option.icon" /> {{ option.label }}
                      <Check v-if="notifyLevelOf(group.general) === option.value" class="ml-auto size-3.5" />
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div v-if="!collapsed.has(group.team.id)" class="pb-1">
                <button
                  v-for="conversation in [group.general, ...group.channels]"
                  :key="conversation.id"
                  type="button"
                  class="flex w-full items-center gap-2 rounded-md py-1.5 pr-2.5 pl-11 text-left transition-colors"
                  :class="selected?.id === conversation.id ? 'bg-accent' : 'hover:bg-accent/60'"
                  @click="open(conversation)"
                >
                  <Lock v-if="conversation.channel?.privacy === 'private'" class="size-3.5 shrink-0 text-muted-foreground" />
                  <Hash v-else class="size-3.5 shrink-0 text-muted-foreground" />
                  <span
                    class="min-w-0 flex-1 truncate text-[13px]"
                    :class="notifyLevelOf(conversation) !== 'all' ? 'text-muted-foreground' : conversation.unread ? 'font-semibold text-foreground' : 'text-foreground/85'"
                  >
                    {{ headerTitle(conversation) }}
                  </span>
                  <component
                    :is="notifyIcon(conversation)"
                    v-if="notifyLevelOf(conversation) !== 'all'"
                    class="size-3.5 shrink-0 text-muted-foreground"
                    :aria-label="notifyLevelOf(conversation) === 'none' ? 'Notifications off' : 'Mentions only'"
                  />
                  <span
                    v-if="conversation.unread"
                    class="flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1.5 text-[10.5px] font-semibold tabular-nums"
                    :class="notifyLevelOf(conversation) === 'all' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'"
                  >
                    {{ conversation.unread > 99 ? '99+' : conversation.unread }}
                  </span>
                </button>
              </div>
            </section>

            <section v-if="departmentChats.length" class="px-1.5 pt-2 pb-2">
              <p class="px-2 pb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Departments</p>
              <button
                v-for="conversation in departmentChats"
                :key="conversation.id"
                type="button"
                class="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors"
                :class="selected?.id === conversation.id ? 'bg-accent' : 'hover:bg-accent/60'"
                @click="open(conversation)"
              >
                <span class="flex size-7 shrink-0 items-center justify-center rounded-md bg-violet-500 text-white"><Building2 class="size-4" /></span>
                <span class="min-w-0 flex-1 truncate text-[13.5px]" :class="conversation.unread ? 'font-semibold' : 'font-medium'">{{ conversation.title }}</span>
                <span v-if="conversation.unread" class="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1.5 text-[10.5px] font-semibold text-primary-foreground tabular-nums">
                  {{ conversation.unread > 99 ? '99+' : conversation.unread }}
                </span>
              </button>
            </section>
          </template>
        </div>
      </aside>

      <!-- Open conversation -->
      <section v-if="selected" class="flex min-h-0 min-w-0 flex-1 flex-col">
        <header class="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-background px-2 sm:gap-3 sm:px-4">
          <Button v-if="!isWide" variant="ghost" size="icon-sm" class="shrink-0" aria-label="Back to the list" @click="router.push({ name: 'messages' })"><ArrowLeft /></Button>
          <UserAvatar v-if="selected.kind === 'direct'" :user="selected.person" size="md" class="size-8 shrink-0" />
          <span v-else-if="selected.kind === 'department'" class="flex size-8 shrink-0 items-center justify-center rounded-md bg-violet-500 text-white"><Building2 class="size-5" /></span>
          <span v-else class="flex size-8 shrink-0 items-center justify-center rounded-md bg-sky-500/15 text-sky-600 dark:text-sky-300">
            <Lock v-if="selected.channel?.privacy === 'private'" class="size-4" />
            <Hash v-else class="size-4" />
          </span>
          <span class="min-w-0 flex-1">
            <span class="flex items-center gap-1.5 truncate text-[13.5px] font-semibold">
              {{ headerTitle(selected) }}
              <component
                :is="notifyIcon(selected)"
                v-if="notifyLevelOf(selected) !== 'all'"
                class="size-3.5 shrink-0 text-muted-foreground"
                :aria-label="notifyLevelOf(selected) === 'none' ? 'Notifications off' : 'Mentions only'"
              />
            </span>
            <span class="flex items-center gap-1.5 truncate text-xs" :class="statusOf(selected) ? PRESENCE_LOOK[statusOf(selected)!].text : 'text-muted-foreground'">
              <PresenceBadge v-if="statusOf(selected)" :status="statusOf(selected)!" size="xs" />
              {{ presence(selected) }}
            </span>
          </span>

          <!-- Desktop/tablet: channel tabs. Phone: tabs live in the ··· menu so the header stays clean. -->
          <template v-if="selected.kind !== 'direct'">
            <div v-if="isSearching" class="relative min-w-0 flex-1 sm:ml-2">
              <Search class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input v-model="channelSearch" class="h-8 pr-8 pl-9" :placeholder="`Search in ${headerTitle(selected)}`" aria-label="Search in this channel" autofocus @keydown.esc="closeSearch" />
              <button type="button" class="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label="Close search" @click="closeSearch"><X class="size-4" /></button>
            </div>
            <nav v-else-if="isWide" class="ml-2 flex h-full min-w-0 flex-1 flex-wrap items-stretch gap-1" aria-label="Channel tabs">
              <button
                v-for="item in channelTabs"
                :key="item.value"
                type="button"
                class="relative shrink-0 px-2.5 text-[13px] font-medium transition-colors"
                :class="view === item.value ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'"
                :aria-current="view === item.value ? 'page' : undefined"
                @click="view = item.value"
              >
                {{ item.label }}
                <span v-if="view === item.value" class="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-primary" />
              </button>
            </nav>
            <Button v-if="!isSearching && view === 'posts'" variant="ghost" size="icon-sm" class="shrink-0" title="Search in this channel" aria-label="Search in this channel" @click="isSearching = true"><Search /></Button>
          </template>

          <MeetButton v-if="isWide && meetPreset && conversationPeople.length" :key="selected.id" :preset="meetPreset" />
          <Button v-if="isWide && selected.kind === 'channel'" variant="ghost" size="sm" class="shrink-0" title="People in this channel" @click="membersOpen = true">
            <UsersRound /> {{ selected.memberCount ?? 0 }}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <Button variant="ghost" size="icon-sm" class="shrink-0" aria-label="Options" title="Options"><EllipsisVertical /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" class="w-60">
              <DropdownMenuLabel class="text-[11px] font-medium text-muted-foreground">Notifications</DropdownMenuLabel>
              <DropdownMenuItem v-for="option in NOTIFY_OPTIONS" :key="option.value" @select="setNotifyLevel(selected, option.value)">
                <component :is="option.icon" /> {{ option.label }}
                <Check v-if="notifyLevelOf(selected) === option.value" class="ml-auto size-3.5" />
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem v-if="selected.kind !== 'direct' && !isWide && view !== 'posts'" @select="view = 'posts'"><Hash /> Posts</DropdownMenuItem>
              <DropdownMenuItem v-if="selected.kind !== 'direct'" @select="view = 'files'"><FolderOpen /> Files shared here</DropdownMenuItem>
              <DropdownMenuItem v-if="selected.kind !== 'direct'" @select="view = 'docs'"><FileText /> Docs</DropdownMenuItem>
              <DropdownMenuItem v-if="selected.team" @select="view = 'board'"><Kanban /> Board</DropdownMenuItem>
              <DropdownMenuSeparator v-if="selected.kind !== 'direct'" />
              <DropdownMenuItem v-if="selected.kind === 'direct'" variant="destructive" :disabled="thread?.isEmpty" @select="thread?.clearChat()"><Eraser /> Clear chat</DropdownMenuItem>
              <DropdownMenuItem v-if="selected.kind === 'team'" @select="addChannel(selected.team?.id ?? null)"><Plus /> Add a channel</DropdownMenuItem>
              <DropdownMenuItem v-if="selected.kind === 'team' && selected.team" @select="router.push({ name: 'team', params: { teamId: selected.team.id } })">
                <ExternalLink /> Open the team page
              </DropdownMenuItem>
              <template v-if="selected.kind === 'channel'">
                <DropdownMenuItem @select="membersOpen = true"><UsersRound /> {{ selected.channel?.privacy === 'private' && selected.channel.canManage ? 'Manage people' : 'People' }}</DropdownMenuItem>
                <DropdownMenuItem v-if="selected.channel?.canManage" @select="editChannel(selected)"><Pencil /> Edit channel</DropdownMenuItem>
                <DropdownMenuItem @select="addChannel(selected.team?.id ?? null)"><Plus /> Add a channel</DropdownMenuItem>
                <DropdownMenuSeparator v-if="selected.channel?.privacy === 'private' || selected.channel?.canManage" />
                <DropdownMenuItem v-if="selected.channel?.privacy === 'private'" variant="destructive" @select="leaveChannel(selected)"><LogOut /> Leave channel</DropdownMenuItem>
                <DropdownMenuItem v-if="selected.channel?.canManage" variant="destructive" @select="deleteChannel(selected)"><Trash2 /> Delete channel</DropdownMenuItem>
              </template>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>
        <ConversationThread v-if="selected.kind === 'direct'" ref="thread" :key="selected.id" :conversation="selected" class="min-h-0 flex-1" />
        <ChannelFiles v-else-if="view === 'files'" :key="`files-${selected.id}`" :conversation-id="selected.id" class="min-h-0 flex-1" @open-post="openPost" />
        <ChannelDocs v-else-if="view === 'docs'" :key="`docs-${selected.id}`" :conversation-id="selected.id" class="min-h-0 flex-1" />
        <ChannelBoard v-else-if="view === 'board'" :key="`board-${selected.id}`" :conversation="selected" class="min-h-0 flex-1" />
        <ChannelThread
          v-else
          :key="selected.id"
          :conversation="selected"
          :focus-post-id="focusPostId"
          :people="conversationPeople"
          :search="channelSearch"
          :can-attach="canAttach"
          class="min-h-0 flex-1"
        />
      </section>

      <section v-else-if="isWide" class="flex min-w-0 flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
        <span class="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <MessagesSquare v-if="tab === 'chat'" class="size-6" />
          <UsersRound v-else class="size-6" />
        </span>
        <p class="text-sm font-medium">{{ tab === 'chat' ? 'Chat' : 'Teams' }}</p>
        <p class="max-w-sm text-sm text-muted-foreground">
          {{
            tab === 'chat'
              ? 'Pick a chat on the left, or start a new one with anyone in your organization.'
              : 'Pick a team’s General chat or one of its channels. Add channels to keep conversations organized by topic; private channels include only the people you add.'
          }}
        </p>
      </section>
    </div>

    <Dialog v-model:open="isPickerOpen">
      <DialogContent class="gap-3 sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New chat</DialogTitle>
          <DialogDescription>A private conversation that only the two of you can see.</DialogDescription>
        </DialogHeader>
        <div class="relative">
          <Search class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input v-model="peopleSearch" class="pl-9" placeholder="Search people" aria-label="Search people" autofocus />
        </div>
        <div class="max-h-80 overflow-y-auto scrollbar-thin">
          <Skeleton v-if="people === null" class="h-14 w-full" />
          <p v-else-if="!pickable.length" class="py-6 text-center text-sm text-muted-foreground">Nobody matches</p>
          <button
            v-for="person in pickable"
            :key="person.id"
            type="button"
            class="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-accent disabled:opacity-60"
            :disabled="isOpening !== null"
            @click="startChat(person)"
          >
            <UserAvatar :user="person" size="md" class="size-10" presence />
            <span class="min-w-0 flex-1">
              <span class="block truncate text-sm font-medium">{{ person.name }}</span>
              <span class="block truncate text-xs text-muted-foreground">{{ presenceStore.describe(person.id) || person.title || person.email }}</span>
            </span>
            <span v-if="isOpening === person.id" class="text-xs text-muted-foreground">Opening…</span>
          </button>
        </div>
      </DialogContent>
    </Dialog>

    <ChannelDialog
      v-model:open="channelDialog.open"
      :teams="teamsForChannels"
      :channel="channelDialog.channel"
      :team-id="channelDialog.teamId"
      @saved="onChannelSaved"
    />
    <SavedMessagesDialog v-model:open="savedOpen" />
    <ChannelMembersDialog v-if="selected?.kind === 'channel'" v-model:open="membersOpen" :conversation="selected" @changed="reload" />
  </div>
</template>

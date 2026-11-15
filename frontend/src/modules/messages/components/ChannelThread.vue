<script setup lang="ts">
import { useIntervalFn } from '@vueuse/core'
import { format, isSameDay, isToday, isYesterday, parseISO } from 'date-fns'
import { ArrowDown, BarChart3, ChevronDown, ClipboardCheck, Hash, Lock, MessageSquareReply, Pin, SearchX, UsersRound } from 'lucide-vue-next'
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue'
import { toast } from 'vue-sonner'
import UserAvatarStack from '@/components/common/UserAvatarStack.vue'
import { Skeleton } from '@/components/ui/skeleton'
import { useConfirm } from '@/composables/useConfirm'
import { getErrorMessage } from '@/lib/http'
import { toPlainText } from '@/lib/markdown'
import { getSocket } from '@/lib/realtime'
import { useSocketEvents } from '@/lib/socket-events'
import { useAuthStore } from '@/modules/auth/auth.store'
import { useUiStore } from '@/stores/ui.store'
import type { UserSummary } from '@/types/models'
import { type ChatMessage, type ComposerExtras, type ConversationSummary, type MessageReaction, messagesApi } from '../messages.api'
import { useMessagesStore } from '../messages.store'
import ChannelComposer from './ChannelComposer.vue'
import ChannelMessage from './ChannelMessage.vue'
import CreateApprovalDialog from './CreateApprovalDialog.vue'
import CreatePollDialog from './CreatePollDialog.vue'
import ForwardMessageDialog from './ForwardMessageDialog.vue'
import MessageHistoryDialog from './MessageHistoryDialog.vue'

/**
 * A team chat or channel, Microsoft Teams style: posts as cards (newest at the bottom), each with its replies,
 * reactions, files and @mentions; pinned posts sit in a bar at the top, and who is typing shows at the bottom.
 * `focusPostId` scrolls to that post (notifications and copied links open it). `people`: everyone in the
 * conversation. `search`: only posts (or replies) containing it are shown.
 */
const props = withDefaults(defineProps<{ conversation: ConversationSummary; focusPostId?: string | null; people?: UserSummary[]; search?: string; canAttach?: boolean }>(), {
  focusPostId: null,
  people: () => [],
  search: '',
  canAttach: false,
})

const auth = useAuthStore()
const store = useMessagesStore()
const ui = useUiStore()
const confirm = useConfirm()
const messages = ref<ChatMessage[] | null>(null)
const savedIds = ref(new Set<string>())
/** The post whose reply box is open. */
const replyingTo = ref<string | null>(null)
/** Your message whose text is being changed in place. */
const editingId = ref<string | null>(null)
/** Posts showing all their replies (long threads show the latest few until opened). */
const expanded = ref(new Set<string>())
const highlighted = ref<string | null>(null)
const pinsOpen = ref(false)
/** New posts that arrived while scrolled up. */
const unseen = ref(0)
/** First unread post when opening the channel (Teams-style “New” line). */
const unreadAnchorId = ref<string | null>(null)
const forwardMessage = ref<ChatMessage | null>(null)
const historyMessage = ref<ChatMessage | null>(null)
const pollOpen = ref(false)
const approvalOpen = ref(false)
const scroller = useTemplateRef<HTMLElement>('scroller')
const replyBoxes = ref<Record<string, InstanceType<typeof ChannelComposer> | null>>({})

const COLLAPSED_REPLIES = 2
const isMine = (message: ChatMessage) => message.authorId === auth.user?.id

const posts = computed(() => (messages.value ?? []).filter((message) => !message.parentId).sort((a, b) => a.createdAt.localeCompare(b.createdAt)))
const pinned = computed(() => posts.value.filter((post) => post.pinnedAt && !post.deletedAt).sort((a, b) => b.pinnedAt!.localeCompare(a.pinnedAt!)))
const repliesOf = computed(() => {
  const map = new Map<string, ChatMessage[]>()
  for (const message of messages.value ?? []) {
    if (message.parentId) map.set(message.parentId, [...(map.get(message.parentId) ?? []), message])
  }
  return map
})

const term = computed(() => props.search.trim().toLowerCase())
const matches = (message: ChatMessage) =>
  `${message.subject ?? ''} ${toPlainText(message.body, 4000)} ${message.author?.name ?? ''} ${(message.files ?? []).map((file) => file.fileName).join(' ')}`.toLowerCase().includes(term.value)

/** Each post with its replies; long threads show only the latest replies until opened (all of them while searching). */
const threads = computed(() => {
  const list = term.value ? posts.value.filter((post) => matches(post) || (repliesOf.value.get(post.id) ?? []).some(matches)) : posts.value
  return list.map((post, index) => {
    const replies = repliesOf.value.get(post.id) ?? []
    const hidden = expanded.value.has(post.id) || term.value ? 0 : Math.max(0, replies.length - COLLAPSED_REPLIES)
    const previous = list[index - 1]
    const hiddenAuthors = [...new Map(replies.slice(0, hidden).flatMap((reply) => (reply.author ? [[reply.author.id, reply.author] as const] : []))).values()]
    return {
      post,
      replies: replies.slice(hidden),
      hidden,
      hiddenAuthors,
      showDay: !previous || !isSameDay(parseISO(previous.createdAt), parseISO(post.createdAt)),
      showUnread: post.id === unreadAnchorId.value,
    }
  })
})
const firstNames = (people: UserSummary[]) => {
  const names = people.map((person) => person.name.split(' ')[0])
  return names.length > 2 ? `${names.slice(0, 2).join(', ')} and ${names.length - 2} more` : names.join(' and ')
}

async function scrollToEnd(smooth = false) {
  unseen.value = 0
  await nextTick()
  scroller.value?.scrollTo({ top: scroller.value.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })
}

async function focusPost(postId: string) {
  pinsOpen.value = false
  expanded.value = new Set([...expanded.value, postId])
  await nextTick()
  const element = scroller.value?.querySelector(`[data-post-id="${postId}"]`)
  if (!element) return scrollToEnd()
  element.scrollIntoView({ block: 'center', behavior: 'smooth' })
  highlighted.value = postId
  setTimeout(() => highlighted.value === postId && (highlighted.value = null), 2500)
}

async function markRead() {
  store.markReadLocally(props.conversation.id)
  await messagesApi.markRead(props.conversation.id).catch(() => undefined)
}

async function load() {
  messages.value = null
  unreadAnchorId.value = null
  const conversationId = props.conversation.id
  const unreadWhenOpened = props.conversation.unread
  try {
    const thread = await messagesApi.get(conversationId)
    if (conversationId !== props.conversation.id) return
    messages.value = thread.messages
    savedIds.value = new Set(thread.savedIds ?? [])
    if (unreadWhenOpened > 0) {
      const topLevel = thread.messages.filter((message) => !message.parentId).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      const start = Math.max(0, topLevel.length - unreadWhenOpened)
      unreadAnchorId.value = topLevel[start]?.id ?? null
    }
    if (props.focusPostId) await focusPost(props.focusPostId)
    else await scrollToEnd()
    await markRead()
  } catch (error) {
    messages.value = []
    toast.error(getErrorMessage(error))
  }
}

function isNearBottom() {
  const element = scroller.value
  return !element || element.scrollHeight - element.scrollTop - element.clientHeight < 160
}
function onScroll() {
  if (unseen.value && isNearBottom()) unseen.value = 0
}

function onMessage(message: ChatMessage) {
  if (message.conversationId !== props.conversation.id || !messages.value) return
  if (messages.value.some((item) => item.id === message.id)) return
  if (message.authorId) typers.value.delete(message.authorId)
  // A reply lands inside its thread; only new posts (at the bottom) are worth following.
  const follow = !message.parentId && (isMine(message) || isNearBottom())
  messages.value = [...messages.value, message]
  if (message.parentId) expanded.value = new Set([...expanded.value, message.parentId])
  if (follow) void scrollToEnd(true)
  else if (!message.parentId) unseen.value += 1
  if (!isMine(message)) void markRead()
}
function onUpdated(message: ChatMessage) {
  if (message.conversationId !== props.conversation.id || !messages.value) return
  messages.value = messages.value.map((item) => (item.id === message.id ? message : item))
  if (message.deletedAt && editingId.value === message.id) editingId.value = null
  if (message.deletedAt && replyingTo.value === message.id) replyingTo.value = null
}
function onReactions(event: { conversationId: string; messageId: string; reactions: MessageReaction[] }) {
  if (event.conversationId !== props.conversation.id || !messages.value) return
  messages.value = messages.value.map((item) => (item.id === event.messageId ? { ...item, reactions: event.reactions } : item))
}
function onSaved(event: { conversationId: string; messageId: string; saved: boolean }) {
  if (event.conversationId !== props.conversation.id) return
  const next = new Set(savedIds.value)
  if (event.saved) next.add(event.messageId)
  else next.delete(event.messageId)
  savedIds.value = next
}
function onCleared(event: { conversationId: string }) {
  if (event.conversationId === props.conversation.id) messages.value = []
}
function onHidden(event: { conversationId: string; messageId: string }) {
  if (event.conversationId !== props.conversation.id || !messages.value) return
  messages.value = messages.value.filter((item) => item.id !== event.messageId)
}

// --- Who is typing -----------------------------------------------------------
const typers = ref(new Map<string, { name: string; parentId: string | null; until: number }>())
function onTyping(event: { conversationId: string; userId: string; name: string; parentId: string | null }) {
  if (event.conversationId !== props.conversation.id || event.userId === auth.user?.id) return
  typers.value = new Map(typers.value).set(event.userId, { name: event.name, parentId: event.parentId, until: Date.now() + 5000 })
}
useIntervalFn(() => {
  const now = Date.now()
  if ([...typers.value.values()].some((typer) => typer.until < now)) typers.value = new Map([...typers.value].filter(([, typer]) => typer.until >= now))
}, 1000)
const typingLine = (parentId: string | null) => {
  const names = [...typers.value.values()].filter((typer) => typer.parentId === parentId).map((typer) => typer.name.split(' ')[0])
  if (!names.length) return ''
  const verb = parentId ? 'replying' : 'typing'
  return names.length === 1 ? `${names[0]} is ${verb}…` : names.length === 2 ? `${names[0]} and ${names[1]} are ${verb}…` : `Several people are ${verb}…`
}
const sendTyping = (parentId: string | null = null) => getSocket()?.emit('conversation:typing', { conversationId: props.conversation.id, parentId })

let connectedBefore = false
useSocketEvents(
  {
    'conversation:message': onMessage,
    'conversation:updated': onUpdated,
    'conversation:reactions': onReactions,
    'conversation:saved': onSaved,
    'conversation:typing': onTyping,
    'conversation:cleared': onCleared,
    'conversation:hidden': onHidden,
  },
  {
    onConnect: () => {
      if (connectedBefore) void load()
      connectedBefore = true
    },
  },
)
watch(
  () => props.conversation.id,
  () => {
    replyingTo.value = null
    editingId.value = null
    pinsOpen.value = false
    unseen.value = 0
    typers.value = new Map()
    expanded.value = new Set()
    void load()
  },
  { immediate: true },
)
watch(
  () => props.focusPostId,
  (postId) => postId && messages.value && void focusPost(postId),
)

// --- Actions -----------------------------------------------------------------
/** Runs a request and reports failure; true when it worked (the composer then clears). */
async function attempt(action: () => Promise<unknown>) {
  try {
    await action()
    return true
  } catch (error) {
    toast.error(getErrorMessage(error))
    return false
  }
}

const post = (body: string, extras: ComposerExtras) =>
  attempt(async () => onMessage(await messagesApi.send(props.conversation.id, body, { subject: extras.subject, important: extras.important, fileIds: extras.fileIds })))
const reply = (postId: string, body: string, extras: ComposerExtras) =>
  attempt(async () => onMessage(await messagesApi.send(props.conversation.id, body, { parentId: postId, fileIds: extras.fileIds })))
const saveEdit = (message: ChatMessage, body: string, extras: ComposerExtras) =>
  attempt(async () => {
    const subject = message.parentId ? undefined : extras.subject
    const changed = body !== message.body || (subject !== undefined && subject !== (message.subject ?? null))
    if (changed) onUpdated(await messagesApi.edit(props.conversation.id, message.id, body, subject))
    editingId.value = null
  })
const react = (message: ChatMessage, emoji: string) => void attempt(async () => onReactions({ conversationId: props.conversation.id, ...(await messagesApi.react(props.conversation.id, message.id, emoji)) }))
const togglePin = (message: ChatMessage) =>
  void attempt(async () => {
    onUpdated(await messagesApi.pin(props.conversation.id, message.id, !message.pinnedAt))
    toast.success(message.pinnedAt ? 'Unpinned' : 'Pinned to the top of the channel')
  })
const toggleSaved = (message: ChatMessage) =>
  void attempt(async () => {
    const result = await messagesApi.save(props.conversation.id, message.id, !savedIds.value.has(message.id))
    onSaved({ conversationId: props.conversation.id, ...result })
    toast.success(result.saved ? 'Saved. Find it under Saved in Messages.' : 'Removed from Saved')
  })
const markUnread = (message: ChatMessage) =>
  void attempt(async () => {
    store.upsert(await messagesApi.markUnread(props.conversation.id, message.id))
    toast.success('Marked as unread')
  })

async function copyLink(message: ChatMessage) {
  const url = `${window.location.origin}/messages/${props.conversation.id}?post=${message.parentId ?? message.id}`
  try {
    await navigator.clipboard.writeText(url)
    toast.success('Link copied')
  } catch {
    toast.error('Could not copy the link')
  }
}

async function copy(message: ChatMessage) {
  try {
    await navigator.clipboard.writeText(toPlainText(message.body, 4000))
    toast.success('Copied')
  } catch {
    toast.error('Could not copy. Select the text and copy it instead.')
  }
}

function createTask(message: ChatMessage) {
  const plain = toPlainText(message.body, 2000).trim()
  const firstLine = plain.split(/\n/).find((line) => line.trim())?.trim() ?? ''
  const title = (message.subject?.trim() || firstLine || 'New task').slice(0, 120)
  const postUrl = `${window.location.origin}/messages/${props.conversation.id}?post=${message.parentId ?? message.id}`
  const description = [
    plain,
    '',
    `From ${message.author?.name ?? 'someone'} in ${channelName.value}`,
    postUrl,
  ]
    .filter((line, index, list) => line !== '' || (index > 0 && list[index - 1] !== ''))
    .join('\n')
    .trim()
  ui.openCreateIssue({ title, description: description || null })
}

async function openReply(postId: string) {
  editingId.value = null
  replyingTo.value = postId
  await nextTick()
  replyBoxes.value[postId]?.focus()
}

function startEdit(message: ChatMessage) {
  replyingTo.value = null
  editingId.value = message.id
}

async function remove(message: ChatMessage) {
  const replies = message.parentId ? 0 : (repliesOf.value.get(message.id)?.length ?? 0)
  const ok = await confirm({
    title: message.parentId ? 'Delete this reply?' : 'Delete this post?',
    description: `It is removed for everyone in ${channelName.value}, with its files.${replies ? ' Its replies stay under “This message was deleted”.' : ''}`,
    confirmLabel: 'Delete',
    destructive: true,
  })
  if (ok) void attempt(async () => onUpdated(await messagesApi.remove(props.conversation.id, message.id)))
}

const dayLabel = (value: string) => {
  const date = parseISO(value)
  return isToday(date) ? 'Today' : isYesterday(date) ? 'Yesterday' : format(date, 'd MMMM yyyy')
}

const isPrivate = computed(() => props.conversation.channel?.privacy === 'private')
const channelName = computed(() => (props.conversation.kind === 'team' ? 'General' : props.conversation.title))
const notice = computed(() => {
  if (props.conversation.kind === 'department') return `Everyone in ${props.conversation.title}, its teams and its head can see this chat.`
  if (isPrivate.value) return 'Private channel: only the people added to it can see it.'
  return `Everyone in the ${props.conversation.team?.name ?? props.conversation.title} team can see this channel.`
})
const pinPreview = (message: ChatMessage) => message.subject || toPlainText(message.body, 90) || message.files?.[0]?.fileName || 'Post'
const votePoll = (message: ChatMessage, optionIndex: number) => {
  if (!message.poll) return
  void attempt(async () => onUpdated(await messagesApi.votePoll(props.conversation.id, message.poll!.id, optionIndex)))
}
const closePoll = (message: ChatMessage) => {
  if (!message.poll) return
  void attempt(async () => onUpdated(await messagesApi.closePoll(props.conversation.id, message.poll!.id)))
}
const respondApproval = (message: ChatMessage, decision: 'approved' | 'rejected') => {
  if (!message.approval) return
  void attempt(async () => onUpdated(await messagesApi.respondApproval(props.conversation.id, message.approval!.id, decision)))
}

const messageEvents = (message: ChatMessage) => ({
  react: (emoji: string) => react(message, emoji),
  copy: () => copy(message),
  copyLink: () => copyLink(message),
  pin: () => togglePin(message),
  toggleSaved: () => toggleSaved(message),
  markUnread: () => markUnread(message),
  createTask: () => createTask(message),
  forward: () => (forwardMessage.value = message),
  showHistory: () => (historyMessage.value = message),
  votePoll: (optionIndex: number) => votePoll(message, optionIndex),
  closePoll: () => closePoll(message),
  respondApproval: (decision: 'approved' | 'rejected') => respondApproval(message, decision),
  edit: () => startEdit(message),
  cancelEdit: () => (editingId.value = null),
  remove: () => remove(message),
})
</script>

<template>
  <div class="relative flex min-h-0 flex-col">
    <!-- Pinned posts -->
    <div v-if="pinned.length" class="shrink-0 border-b border-border bg-amber-50/60 dark:bg-amber-400/5">
      <button type="button" class="flex w-full items-center gap-2 px-4 py-2 text-left text-xs sm:px-[5%]" :aria-expanded="pinsOpen" @click="pinsOpen = !pinsOpen">
        <Pin class="size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
        <span class="font-semibold text-amber-800 dark:text-amber-300">{{ pinned.length }} pinned</span>
        <span class="min-w-0 flex-1 truncate text-muted-foreground">{{ pinPreview(pinned[0]!) }}</span>
        <ChevronDown class="size-3.5 shrink-0 text-muted-foreground transition-transform" :class="pinsOpen && 'rotate-180'" />
      </button>
      <ul v-if="pinsOpen" class="max-h-56 overflow-y-auto border-t border-amber-200/60 px-2 py-1 scrollbar-thin dark:border-amber-400/10 sm:px-[calc(5%-0.5rem)]">
        <li v-for="item in pinned" :key="item.id">
          <button type="button" class="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left hover:bg-amber-100/60 dark:hover:bg-amber-400/10" @click="focusPost(item.id)">
            <span class="min-w-0 flex-1">
              <span class="block truncate text-[13px] font-medium">{{ pinPreview(item) }}</span>
              <span class="block text-[11px] text-muted-foreground">{{ item.author?.name ?? 'Someone' }} · {{ format(parseISO(item.createdAt), 'd MMM') }}</span>
            </span>
          </button>
        </li>
      </ul>
    </div>

    <div ref="scroller" class="min-h-0 flex-1 overflow-y-auto bg-sidebar/60 px-4 pt-3 pb-4 scrollbar-thin sm:px-[5%]" @scroll.passive="onScroll">
      <div class="mx-auto flex max-w-3xl flex-col gap-3">
        <div v-if="!term" class="flex items-start gap-3 rounded-xl border border-border/70 bg-card/70 px-4 py-2.5 shadow-soft">
          <span class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Lock v-if="isPrivate" class="size-4" />
            <UsersRound v-else-if="conversation.kind === 'department'" class="size-4" />
            <Hash v-else class="size-4" />
          </span>
          <div class="min-w-0 flex-1">
            <p class="text-[13px] font-semibold">Welcome to {{ channelName }}</p>
            <p v-if="conversation.channel?.description" class="mt-0.5 text-[12.5px] text-foreground/80">{{ conversation.channel.description }}</p>
            <p class="mt-0.5 text-[11.5px] text-muted-foreground">{{ notice }}</p>
          </div>
        </div>
        <p v-else class="text-center text-xs text-muted-foreground">
          {{ threads.length ? `${threads.length} ${threads.length === 1 ? 'conversation matches' : 'conversations match'} “${search.trim()}”` : '' }}
        </p>

        <template v-if="messages === null">
          <Skeleton v-for="index in 3" :key="index" class="h-24 w-full rounded-xl" />
        </template>

        <template v-for="{ post: item, replies, hidden, hiddenAuthors, showDay, showUnread } in threads" v-else :key="item.id">
          <div v-if="showDay && !showUnread" class="flex items-center gap-3 py-1 text-[11px] font-medium text-muted-foreground">
            <span class="h-px flex-1 bg-border" /> {{ dayLabel(item.createdAt) }} <span class="h-px flex-1 bg-border" />
          </div>
          <div v-if="showUnread" class="flex items-center gap-3 py-1 text-[11px] font-semibold text-primary">
            <span class="h-px flex-1 bg-primary/40" /> New <span class="h-px flex-1 bg-primary/40" />
          </div>

          <article
            :data-post-id="item.id"
            class="overflow-hidden rounded-xl border bg-card shadow-soft transition-shadow"
            :class="[
              highlighted === item.id ? 'border-primary ring-2 ring-primary/30' : 'border-border',
              item.subject && !item.deletedAt && !item.important && 'border-t-[3px] border-t-primary/70',
            ]"
          >
            <ChannelMessage
              :message="item"
              :people="people"
              :editing="editingId === item.id"
              :saved="savedIds.has(item.id)"
              :save="(body, extras) => saveEdit(item, body, extras)"
              v-on="messageEvents(item)"
            />

            <div v-if="replies.length || hidden || replyingTo === item.id || typingLine(item.id)" class="border-t border-border/70 bg-muted/25">
              <button
                v-if="hidden"
                type="button"
                class="flex w-full items-center gap-2 px-4 pt-2 pb-1 pl-8 text-left text-xs font-medium text-primary hover:underline"
                @click="expanded = new Set([...expanded, item.id])"
              >
                <UserAvatarStack :users="hiddenAuthors" :max="3" />
                {{ hidden }} {{ hidden === 1 ? 'reply' : 'replies' }} from {{ firstNames(hiddenAuthors) }}
              </button>
              <ChannelMessage
                v-for="message in replies"
                :key="message.id"
                reply
                :message="message"
                :people="people"
                :editing="editingId === message.id"
                :saved="savedIds.has(message.id)"
                :save="(body, extras) => saveEdit(message, body, extras)"
                v-on="messageEvents(message)"
              />
              <p v-if="typingLine(item.id)" class="px-4 py-1.5 pl-8 text-xs text-muted-foreground italic">{{ typingLine(item.id) }}</p>
              <div v-if="replyingTo === item.id" class="px-4 pt-1 pb-3 pl-8">
                <ChannelComposer
                  :ref="(element) => (replyBoxes[item.id] = element as InstanceType<typeof ChannelComposer> | null)"
                  compact
                  placeholder="Reply"
                  :people="people"
                  allow-everyone
                  :conversation-id="canAttach ? conversation.id : null"
                  :send="(body, extras) => reply(item.id, body, extras)"
                  @typing="sendTyping(item.id)"
                  @cancel="replyingTo = null"
                />
              </div>
            </div>

            <button
              v-if="replyingTo !== item.id && !item.deletedAt"
              type="button"
              class="flex w-full items-center gap-1.5 border-t border-border/70 px-4 py-2 text-left text-xs font-medium text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
              @click="openReply(item.id)"
            >
              <MessageSquareReply class="size-3.5" /> Reply
            </button>
          </article>
        </template>

        <div v-if="messages && term && !threads.length" class="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
          <SearchX class="size-6" /> Nothing in {{ channelName }} matches “{{ search.trim() }}”
        </div>
        <p v-else-if="messages && !posts.length" class="py-6 text-center text-sm text-muted-foreground">No posts yet. Start the conversation below.</p>
      </div>
    </div>

    <button
      v-if="unseen"
      type="button"
      class="absolute bottom-28 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground shadow-elevated transition-transform hover:scale-105"
      @click="scrollToEnd(true)"
    >
      <ArrowDown class="size-3.5" /> {{ unseen }} new {{ unseen === 1 ? 'post' : 'posts' }}
    </button>

    <div class="shrink-0 border-t border-border bg-background px-4 pt-1.5 pb-3 sm:px-[5%]">
      <div class="mx-auto flex max-w-3xl items-center gap-1">
        <p class="h-4 min-w-0 flex-1 truncate text-[11.5px] text-muted-foreground italic" aria-live="polite">{{ typingLine(null) }}</p>
        <button type="button" class="inline-flex items-center gap-1 rounded px-2 py-1 text-[11.5px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground" @click="pollOpen = true">
          <BarChart3 class="size-3.5" /> Poll
        </button>
        <button type="button" class="inline-flex items-center gap-1 rounded px-2 py-1 text-[11.5px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground" @click="approvalOpen = true">
          <ClipboardCheck class="size-3.5" /> Approval
        </button>
      </div>
      <ChannelComposer
        class="mx-auto mt-0.5 max-w-3xl"
        allow-subject
        allow-important
        allow-everyone
        :people="people"
        :conversation-id="canAttach ? conversation.id : null"
        :placeholder="`Start a new post in ${channelName}`"
        :send="post"
        @typing="sendTyping(null)"
      />
    </div>

    <ForwardMessageDialog
      :open="Boolean(forwardMessage)"
      :conversation-id="conversation.id"
      :message="forwardMessage"
      @update:open="(open) => !open && (forwardMessage = null)"
    />
    <MessageHistoryDialog
      :open="Boolean(historyMessage)"
      :conversation-id="conversation.id"
      :message="historyMessage"
      @update:open="(open) => !open && (historyMessage = null)"
    />
    <CreatePollDialog :open="pollOpen" :conversation-id="conversation.id" @update:open="(open) => (pollOpen = open)" @created="onMessage" />
    <CreateApprovalDialog :open="approvalOpen" :conversation-id="conversation.id" @update:open="(open) => (approvalOpen = open)" @created="onMessage" />
  </div>
</template>

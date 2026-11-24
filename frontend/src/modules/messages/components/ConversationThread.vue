<script setup lang="ts">
import { useIntervalFn } from '@vueuse/core'
import { differenceInMinutes, format, isSameDay, isToday, isYesterday, parseISO } from 'date-fns'
import { Ban, Check, CheckCheck, Copy, Lock, Pencil, SendHorizontal, Trash2, X } from 'lucide-vue-next'
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue'
import { toast } from 'vue-sonner'
import EmojiStickerPicker from '@/components/common/EmojiStickerPicker.vue'
import JumboEmoji from '@/components/common/JumboEmoji.vue'
import StickerBubble from '@/components/common/StickerBubble.vue'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useConfirm } from '@/composables/useConfirm'
import { useDevice } from '@/composables/useDevice'
import { isJumboEmojiMessage, isStickerMessage } from '@/lib/emoji-stickers'
import { getErrorMessage } from '@/lib/http'
import { playSendEffect, sendEffectForBody } from '@/lib/send-effect'
import { getSocket } from '@/lib/realtime'
import { useSocketEvents } from '@/lib/socket-events'
import { useAuthStore } from '@/modules/auth/auth.store'
import { type ChatMessage, type ConversationSummary, type MessageReaction, REACTIONS, messagesApi } from '../messages.api'
import { useMessagesStore } from '../messages.store'

/** One conversation, WhatsApp style: your messages green on the right; direct chats show blue ticks once read. */
const props = defineProps<{ conversation: ConversationSummary }>()

const auth = useAuthStore()
const store = useMessagesStore()
const confirm = useConfirm()
const messages = ref<ChatMessage[] | null>(null)
const otherLastReadAt = ref<string | null>(props.conversation.otherLastReadAt ?? null)
const hasMore = ref(false)
const isLoadingOlder = ref(false)
const draft = ref('')
const isSending = ref(false)
/** Your message whose text the composer is changing, or null when writing a new one. */
const editing = ref<ChatMessage | null>(null)
const { isDesktop } = useDevice()
/** Touch screens have no hover: tapping a message shows its actions. */
const activeId = ref<string | null>(null)
const scroller = useTemplateRef<HTMLElement>('scroller')
const input = useTemplateRef<HTMLTextAreaElement>('input')

const isDirect = computed(() => props.conversation.kind === 'direct')
const isMine = (message: ChatMessage) => message.authorId === auth.user?.id
const isRead = (message: ChatMessage) => Boolean(otherLastReadAt.value) && parseISO(otherLastReadAt.value!).getTime() >= parseISO(message.createdAt).getTime()

async function scrollToEnd(smooth = false) {
  await nextTick()
  scroller.value?.scrollTo({ top: scroller.value.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })
}

function autosize() {
  const element = input.value
  if (!element) return
  element.style.height = 'auto'
  element.style.height = `${element.scrollHeight}px`
}

async function markRead() {
  store.markReadLocally(props.conversation.id)
  await messagesApi.markRead(props.conversation.id).catch(() => undefined)
}

async function load() {
  messages.value = null
  hasMore.value = false
  const conversationId = props.conversation.id
  try {
    const thread = await messagesApi.get(conversationId, { limit: 100 })
    // Another chat was opened meanwhile: its own load fills the thread.
    if (conversationId !== props.conversation.id) return
    messages.value = thread.messages
    hasMore.value = Boolean(thread.hasMore)
    otherLastReadAt.value = thread.conversation.otherLastReadAt ?? null
    await scrollToEnd()
    await markRead()
  } catch (error) {
    messages.value = []
    toast.error(getErrorMessage(error))
  }
}

async function loadOlder() {
  if (!messages.value?.length || isLoadingOlder.value || !hasMore.value) return
  const oldest = messages.value[0]
  isLoadingOlder.value = true
  const previousHeight = scroller.value?.scrollHeight ?? 0
  try {
    const thread = await messagesApi.get(props.conversation.id, { before: oldest.createdAt, limit: 50 })
    const existing = new Set(messages.value.map((item) => item.id))
    const older = thread.messages.filter((item) => !existing.has(item.id))
    messages.value = [...older, ...messages.value]
    hasMore.value = Boolean(thread.hasMore)
    await nextTick()
    if (scroller.value) scroller.value.scrollTop = scroller.value.scrollHeight - previousHeight
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    isLoadingOlder.value = false
  }
}

function onMessage(message: ChatMessage) {
  if (message.conversationId !== props.conversation.id || !messages.value) return
  if (messages.value.some((item) => item.id === message.id)) return
  messages.value = [...messages.value, message]
  void scrollToEnd(true)
  if (!isMine(message)) void markRead()
}
function onUpdated(message: ChatMessage) {
  if (message.conversationId !== props.conversation.id || !messages.value) return
  messages.value = messages.value.map((item) => (item.id === message.id ? message : item))
  if (message.deletedAt && editing.value?.id === message.id) cancelEdit()
}
function onRead(event: { conversationId: string; userId: string; readAt: string }) {
  if (event.conversationId === props.conversation.id && event.userId !== auth.user?.id) otherLastReadAt.value = event.readAt
}
function onCleared(event: { conversationId: string }) {
  if (event.conversationId !== props.conversation.id) return
  messages.value = []
  cancelEdit()
}
function onHidden(event: { conversationId: string; messageId: string }) {
  if (event.conversationId !== props.conversation.id || !messages.value) return
  messages.value = messages.value.filter((item) => item.id !== event.messageId)
  if (editing.value?.id === event.messageId) cancelEdit()
}
function onReactions(event: { conversationId: string; messageId: string; reactions: MessageReaction[] }) {
  if (event.conversationId !== props.conversation.id || !messages.value) return
  messages.value = messages.value.map((item) => (item.id === event.messageId ? { ...item, reactions: event.reactions } : item))
}

async function react(message: ChatMessage, emoji: string) {
  if (message.deletedAt) return
  try {
    onReactions({ conversationId: props.conversation.id, ...(await messagesApi.react(props.conversation.id, message.id, emoji)) })
  } catch (error) {
    toast.error(getErrorMessage(error))
  }
}

/** Who is typing (direct chats broadcast the same socket event as channels). */
const typers = ref(new Map<string, { name: string; until: number }>())
function onTyping(event: { conversationId: string; userId: string; name: string }) {
  if (event.conversationId !== props.conversation.id || event.userId === auth.user?.id) return
  typers.value = new Map(typers.value).set(event.userId, { name: event.name, until: Date.now() + 5000 })
}
useIntervalFn(() => {
  const now = Date.now()
  if ([...typers.value.values()].some((typer) => typer.until < now)) {
    typers.value = new Map([...typers.value].filter(([, typer]) => typer.until >= now))
  }
}, 1000)
const typingLine = computed(() => {
  const names = [...typers.value.values()].map((typer) => typer.name.split(' ')[0])
  if (!names.length) return ''
  return names.length === 1 ? `${names[0]} is typing…` : names.length === 2 ? `${names[0]} and ${names[1]} are typing…` : 'Several people are typing…'
})
let typingSentAt = 0
function sendTyping() {
  if (!draft.value.trim() || Date.now() - typingSentAt < 3000) return
  typingSentAt = Date.now()
  getSocket()?.emit('conversation:typing', { conversationId: props.conversation.id })
}

let connectedBefore = false
useSocketEvents(
  {
    'conversation:message': onMessage,
    'conversation:updated': onUpdated,
    'conversation:read': onRead,
    'conversation:cleared': onCleared,
    'conversation:hidden': onHidden,
    'conversation:reactions': onReactions,
    'conversation:typing': onTyping,
  },
  {
    // Messages sent while the connection was down are fetched again.
    onConnect: () => {
      if (connectedBefore) void load()
      connectedBefore = true
    },
  },
)
watch(
  () => props.conversation.id,
  () => {
    draft.value = ''
    editing.value = null
    void load()
    void nextTick(() => input.value?.focus())
  },
  { immediate: true },
)

async function submit() {
  const body = draft.value.trim()
  if (!body || isSending.value) return
  isSending.value = true
  try {
    if (editing.value) {
      onUpdated(await messagesApi.edit(props.conversation.id, editing.value.id, body))
      cancelEdit()
    } else {
      const message = await messagesApi.send(props.conversation.id, body)
      playSendEffect(sendEffectForBody(body))
      draft.value = ''
      await nextTick()
      autosize()
      onMessage(message)
    }
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    isSending.value = false
    input.value?.focus()
  }
}

async function insertAtCaret(value: string) {
  const element = input.value
  if (!element) {
    draft.value += value
    return
  }
  const start = element.selectionStart
  const before = `${draft.value.slice(0, start)}${value}`
  draft.value = before + draft.value.slice(element.selectionEnd)
  await nextTick()
  element.focus()
  element.setSelectionRange(before.length, before.length)
  autosize()
}

/** Stickers always send as their own card message (never mixed into typed text). */
async function onSticker(token: string) {
  if (isSending.value || editing.value) return
  isSending.value = true
  try {
    const message = await messagesApi.send(props.conversation.id, token)
    playSendEffect(sendEffectForBody(token))
    onMessage(message)
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    isSending.value = false
    input.value?.focus()
  }
}

async function startEdit(message: ChatMessage) {
  editing.value = message
  draft.value = message.body
  await nextTick()
  autosize()
  const element = input.value
  element?.focus()
  element?.setSelectionRange(element.value.length, element.value.length)
}

function cancelEdit() {
  if (!editing.value) return
  editing.value = null
  draft.value = ''
  void nextTick(autosize)
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault()
    void submit()
  } else if (event.key === 'Escape' && editing.value) {
    event.preventDefault()
    cancelEdit()
  } else if (event.key === 'ArrowUp' && !draft.value) {
    // Up arrow in an empty box edits your last message, as in most chat apps.
    const last = [...(messages.value ?? [])].reverse().find((message) => isMine(message) && !message.deletedAt)
    if (last) {
      event.preventDefault()
      void startEdit(last)
    }
  }
}

async function copy(message: ChatMessage) {
  try {
    await navigator.clipboard.writeText(message.body)
    toast.success('Message copied')
  } catch {
    toast.error('Could not copy. Select the text and copy it instead.')
  }
}

/** The message the delete choice (for me / for everyone) is open for. */
const deleting = ref<ChatMessage | null>(null)
const isDeleting = ref(false)
const canDeleteForEveryone = computed(() => Boolean(deleting.value && isMine(deleting.value) && !deleting.value.deletedAt))

async function deleteForEveryone() {
  const message = deleting.value
  if (!message) return
  isDeleting.value = true
  try {
    onUpdated(await messagesApi.remove(props.conversation.id, message.id))
    deleting.value = null
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    isDeleting.value = false
  }
}

async function deleteForMe() {
  const message = deleting.value
  if (!message) return
  isDeleting.value = true
  try {
    store.upsert(await messagesApi.hide(props.conversation.id, message.id))
    onHidden({ conversationId: props.conversation.id, messageId: message.id })
    deleting.value = null
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    isDeleting.value = false
  }
}

/** The buttons beside a message: copy it, edit it (yours), and delete it (for you, or for everyone when it is yours). */
function actionsFor(message: ChatMessage) {
  const run = (action: () => unknown) => () => {
    activeId.value = null
    void action()
  }
  const remove = { label: 'Delete', icon: Trash2, danger: true, run: run(() => (deleting.value = message)) }
  if (message.deletedAt) return [remove]
  return [
    { label: 'Copy', icon: Copy, danger: false, run: run(() => copy(message)) },
    ...(isMine(message) ? [{ label: 'Edit', icon: Pencil, danger: false, run: run(() => startEdit(message)) }] : []),
    remove,
  ]
}

/** Empties this chat for you; the other people in it keep every message. */
async function clearChat() {
  const ok = await confirm({
    title: 'Clear this chat?',
    description: isDirect.value
      ? `All messages disappear for you. ${props.conversation.title} still sees them. This cannot be undone.`
      : 'All messages disappear for you. Everyone else in the chat still sees them. This cannot be undone.',
    confirmLabel: 'Clear chat',
    destructive: true,
  })
  if (!ok) return
  try {
    store.upsert(await messagesApi.clear(props.conversation.id))
    onCleared({ conversationId: props.conversation.id })
    toast.success('Chat cleared')
  } catch (error) {
    toast.error(getErrorMessage(error))
  }
}
defineExpose({ clearChat, isEmpty: computed(() => !messages.value?.length) })

const dayLabel = (value: string) => {
  const date = parseISO(value)
  return isToday(date) ? 'Today' : isYesterday(date) ? 'Yesterday' : format(date, 'd MMMM yyyy')
}

const entries = computed(() =>
  (messages.value ?? []).map((message, index, list) => {
    const previous = list[index - 1]
    const showDay = !previous || !isSameDay(parseISO(previous.createdAt), parseISO(message.createdAt))
    const startsGroup = showDay || !previous || previous.authorId !== message.authorId || differenceInMinutes(parseISO(message.createdAt), parseISO(previous.createdAt)) > 5
    return { message, showDay, startsGroup }
  }),
)

const notice = computed(() =>
  isDirect.value
    ? `Only you and ${props.conversation.title} can see this conversation.`
    : props.conversation.kind === 'team'
      ? `Everyone in the ${props.conversation.title} team, its lead and the department head can see this chat.`
      : `Everyone in ${props.conversation.title}, its teams and its head can see this chat.`,
)
</script>

<template>
  <div class="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
    <div ref="scroller" class="chat-wallpaper min-h-0 flex-1 overflow-y-auto px-[6%] py-4 scrollbar-thin">
      <div class="mx-auto mb-3 flex max-w-sm items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-center text-[11.5px] leading-snug text-amber-900/80 ring-1 ring-amber-200/70 dark:ring-amber-400/15 dark:bg-amber-400/10 dark:text-amber-200">
        <Lock class="mt-0.5 size-3 shrink-0" />
        <span>{{ notice }}</span>
      </div>

      <template v-if="messages === null">
        <Skeleton v-for="index in 4" :key="index" class="mb-2 h-10 rounded-lg" :class="index % 2 ? 'mr-auto w-1/2' : 'ml-auto w-2/5'" />
      </template>

      <template v-else>
      <div v-if="hasMore" class="mb-3 flex justify-center">
        <Button type="button" variant="ghost" size="sm" :loading="isLoadingOlder" @click="loadOlder">Load older messages</Button>
      </div>

      <template v-for="{ message, showDay, startsGroup } in entries" :key="message.id">
        <div v-if="showDay" class="sticky top-0 z-10 flex justify-center py-2">
          <span class="rounded-full border border-border bg-card px-3 py-0.5 text-[11px] font-medium text-muted-foreground shadow-soft">
            {{ dayLabel(message.createdAt) }}
          </span>
        </div>

        <div class="group/row flex items-center gap-2" :class="[isMine(message) && 'flex-row-reverse', startsGroup ? 'mt-2' : 'mt-0.5']">
          <div
            class="relative max-w-[78%] rounded-lg px-2.5 pt-1.5 pb-1 text-[14px] leading-[19px] shadow-[0_1px_0.5px_rgb(11_20_26/0.13)]"
            :class="[
              isMine(message) ? 'bg-[#d9fdd3] text-[#111b21] dark:bg-[#005c4b] dark:text-[#e9edef]' : 'bg-card text-foreground',
              startsGroup && (isMine(message) ? 'rounded-tr-none' : 'rounded-tl-none'),
              editing?.id === message.id && 'ring-2 ring-[#00a884]',
              !isDesktop && 'cursor-pointer',
            ]"
            @click="!isDesktop && (activeId = activeId === message.id ? null : message.id)"
          >
            <span
              v-if="startsGroup"
              class="absolute top-0 size-2.5"
              :class="
                isMine(message)
                  ? '-right-2 bg-[#d9fdd3] [clip-path:polygon(0_0,100%_0,0_100%)] dark:bg-[#005c4b]'
                  : '-left-2 bg-card [clip-path:polygon(0_0,100%_0,100%_100%)]'
              "
            />

            <p v-if="startsGroup && !isMine(message) && !isDirect" class="mb-0.5 text-[12.5px] font-semibold" :style="{ color: message.author?.avatarColor ?? '#00a884' }">
              {{ message.author?.name ?? 'Someone' }}
            </p>
            <p v-if="message.deletedAt" class="flex items-center gap-1.5 pr-12 text-[13.5px] text-muted-foreground italic">
              <Ban class="size-3.5 shrink-0" /> {{ isMine(message) ? 'You deleted this message' : 'This message was deleted' }}
            </p>
            <div v-else-if="isStickerMessage(message.body)" class="relative py-1 pr-14">
              <StickerBubble :body="message.body" />
            </div>
            <div v-else-if="isJumboEmojiMessage(message.body)" class="relative py-1 pr-14">
              <JumboEmoji :body="message.body" />
            </div>
            <p v-else class="whitespace-pre-wrap break-words">
              {{ message.body }}<span class="inline-block" :class="isMine(message) ? (message.editedAt ? 'w-[7.25rem]' : 'w-[4.25rem]') : message.editedAt ? 'w-[5.75rem]' : 'w-12'" />
            </p>
            <span class="absolute right-2 bottom-1 flex items-center gap-0.5 text-[11px] leading-none text-muted-foreground">
              <span v-if="message.editedAt && !message.deletedAt" class="mr-1 italic" :title="`Edited ${format(parseISO(message.editedAt), 'd MMM, HH:mm')}`">edited</span>
              {{ format(parseISO(message.createdAt), 'HH:mm') }}
              <template v-if="isMine(message) && !message.deletedAt">
                <CheckCheck v-if="isDirect && isRead(message)" class="size-4 text-[#53bdeb]" aria-label="Read" />
                <Check v-else class="size-4" aria-label="Sent" />
              </template>
            </span>

            <div v-if="message.reactions?.length && !message.deletedAt" class="mt-1 mb-0.5 flex flex-wrap gap-1 pr-14">
              <button
                v-for="reaction in message.reactions"
                :key="reaction.emoji"
                type="button"
                class="inline-flex h-6 items-center gap-1 rounded-full border px-2 text-xs tabular-nums transition-colors"
                :class="
                  reaction.userIds.includes(auth.user?.id ?? '')
                    ? 'border-primary/50 bg-primary/10 font-semibold text-primary'
                    : 'border-border bg-background/80 text-muted-foreground hover:border-input hover:text-foreground'
                "
                :aria-label="`React with ${reaction.emoji}`"
                @click.stop="react(message, reaction.emoji)"
              >
                <span class="text-sm leading-none">{{ reaction.emoji }}</span> {{ reaction.userIds.length }}
              </button>
            </div>
          </div>

          <div
            class="flex shrink-0 items-stretch overflow-hidden rounded-lg bg-popover shadow-elevated ring-1 ring-border transition-opacity duration-150"
            :class="activeId === message.id ? 'opacity-100' : 'opacity-100 sm:pointer-events-none sm:opacity-0 sm:group-hover/row:pointer-events-auto sm:group-hover/row:opacity-100 sm:focus-within:pointer-events-auto sm:focus-within:opacity-100'"
            role="toolbar"
            aria-label="Message actions"
          >
            <template v-if="!message.deletedAt">
              <button
                v-for="emoji in REACTIONS"
                :key="emoji"
                type="button"
                class="flex size-8 shrink-0 items-center justify-center text-base transition-colors hover:bg-accent"
                :aria-label="`React with ${emoji}`"
                :title="`React with ${emoji}`"
                @click.stop="react(message, emoji)"
              >
                {{ emoji }}
              </button>
              <EmojiStickerPicker context="react" trigger-class="h-8" @emoji="react(message, $event)" @sticker="onSticker" />
              <span class="my-1.5 w-px shrink-0 self-stretch bg-border" />
            </template>
            <Tooltip v-for="action in actionsFor(message)" :key="action.label">
              <TooltipTrigger as-child>
                <button
                  type="button"
                  class="flex size-8 shrink-0 items-center justify-center text-muted-foreground transition-colors"
                  :class="action.danger ? 'hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/15 dark:hover:text-red-400' : 'hover:bg-accent hover:text-foreground'"
                  :aria-label="action.label"
                  @click.stop="action.run()"
                >
                  <component :is="action.icon" class="size-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">{{ action.label }}</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </template>

      <p v-if="!messages.length" class="mt-6 text-center text-xs text-muted-foreground">No messages yet. Say hello.</p>
      </template>
    </div>

    <p v-if="typingLine" class="shrink-0 px-4 py-1 text-[11.5px] text-muted-foreground italic" aria-live="polite">{{ typingLine }}</p>

    <div v-if="editing" class="flex shrink-0 items-center gap-3 border-t border-border bg-background px-4 pt-2.5">
      <div class="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg border-l-4 border-[#00a884] bg-card px-3 py-2">
        <Pencil class="size-4 shrink-0 text-[#00a884]" />
        <div class="min-w-0 flex-1">
          <p class="text-xs font-semibold text-[#00a884]">Editing message</p>
          <p class="truncate text-xs text-muted-foreground">{{ editing.body }}</p>
        </div>
      </div>
      <button
        type="button"
        class="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
        aria-label="Cancel editing"
        title="Cancel (Esc)"
        @click="cancelEdit"
      >
        <X class="size-4" />
      </button>
    </div>
    <form class="flex shrink-0 items-end gap-2 border-t border-border bg-background px-3 py-2.5" @submit.prevent="submit">
      <div class="flex min-h-10 flex-1 items-center gap-1 rounded-xl border border-border bg-card py-0.5 pr-2 pl-2 shadow-soft transition-colors focus-within:border-ring/60 focus-within:ring-[3px] focus-within:ring-ring/15">
        <EmojiStickerPicker class="shrink-0" @emoji="insertAtCaret" @sticker="onSticker" />
        <textarea
          ref="input"
          v-model="draft"
          rows="1"
          maxlength="4000"
          class="max-h-32 min-w-0 flex-1 resize-none bg-transparent py-2.5 text-[14px] leading-5 text-foreground outline-none placeholder:text-muted-foreground"
          placeholder="Type a message"
          aria-label="Message"
          title="Enter to send · Shift + Enter for a new line"
          @input="autosize(); sendTyping()"
          @keydown="onKeydown"
        />
      </div>
      <button
        type="submit"
        class="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#00a884] text-white shadow-sm transition-all hover:bg-[#008f6f] active:scale-95 disabled:opacity-50"
        :disabled="!draft.trim() || isSending"
        :aria-label="editing ? 'Save changes' : 'Send'"
      >
        <Check v-if="editing" class="size-5" :class="isSending && 'animate-pulse'" />
        <SendHorizontal v-else class="size-[18px]" :class="isSending && 'animate-pulse'" />
      </button>
    </form>

    <Dialog :open="Boolean(deleting)" @update:open="(open) => !open && !isDeleting && (deleting = null)">
      <DialogContent class="gap-4 sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Delete message?</DialogTitle>
          <DialogDescription>
            {{
              canDeleteForEveryone
                ? `“Delete for me” removes it only from your chat. “Delete for everyone” removes it for ${isDirect ? conversation.title : 'everyone in this chat'} too.`
                : 'It is removed only from your chat. Everyone else still sees it.'
            }}
          </DialogDescription>
        </DialogHeader>
        <p v-if="deleting && !deleting.deletedAt" class="line-clamp-3 rounded-lg bg-muted/60 px-3 py-2 text-sm break-words whitespace-pre-wrap">{{ deleting.body }}</p>
        <div class="flex flex-col gap-2">
          <Button v-if="canDeleteForEveryone" variant="destructive" :disabled="isDeleting" @click="deleteForEveryone"><Trash2 /> Delete for everyone</Button>
          <Button :variant="canDeleteForEveryone ? 'outline' : 'destructive'" :disabled="isDeleting" @click="deleteForMe"><Trash2 /> Delete for me</Button>
          <Button variant="ghost" :disabled="isDeleting" @click="deleting = null">Cancel</Button>
        </div>
      </DialogContent>
    </Dialog>
  </div>
</template>

<style scoped>
.chat-wallpaper {
  background-color: var(--sidebar);
  background-image:
    radial-gradient(rgb(0 0 0 / 0.045) 1px, transparent 1px),
    radial-gradient(rgb(0 0 0 / 0.03) 1px, transparent 1px);
  background-position:
    0 0,
    11px 11px;
  background-size: 22px 22px;
}
.dark .chat-wallpaper {
  background-color: var(--sidebar);
  background-image:
    radial-gradient(rgb(255 255 255 / 0.035) 1px, transparent 1px),
    radial-gradient(rgb(255 255 255 / 0.025) 1px, transparent 1px);
}
</style>

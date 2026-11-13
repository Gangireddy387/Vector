<script setup lang="ts">
import { useClipboard, useIntervalFn } from '@vueuse/core'
import { differenceInMinutes, format, isSameDay, isToday, isYesterday, parseISO } from 'date-fns'
import { Ban, Check, CheckCheck, Copy, Download, LoaderCircle, Lock, Pencil, Play, SendHorizontal, Timer, Trash2, Video, X } from 'lucide-vue-next'
import { computed, nextTick, onMounted, ref, useTemplateRef } from 'vue'
import { useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useConfirm } from '@/composables/useConfirm'
import { useDevice } from '@/composables/useDevice'
import { assetUrl, getErrorMessage } from '@/lib/http'
import { useSocketEvents } from '@/lib/socket-events'
import { playSound } from '@/lib/sounds'
import { revealDuration } from '@/modules/meetings/call/playback'
import { type DisappearHours, type SupportCall, type SupportChatApi, type SupportMessage, supportCallApi } from '../support.api'

/**
 * A WhatsApp-style conversation between the super admin ("portal") and one organization's admins.
 * This side's messages are green on the right with read ticks; new messages, edits and read receipts arrive live.
 * Own messages can be edited or deleted for everyone; any message can be deleted for yourself, and the whole chat
 * cleared for yourself (`clearChat`, exposed for the header's menu).
 */
const props = defineProps<{
  side: 'portal' | 'organization'
  organizationId: string
  api: SupportChatApi
  placeholder?: string
  /** Shown in the notice at the top of the conversation. */
  notice?: string
}>()
const emit = defineEmits<{ read: [] }>()

const confirm = useConfirm()
const { copy } = useClipboard({ legacy: true })
const messages = ref<SupportMessage[] | null>(null)
const disappearHours = ref<DisappearHours>(null)
const draft = ref('')
const isSending = ref(false)
/** The message being edited in the composer, if any. */
const editing = ref<SupportMessage | null>(null)
const { isDesktop } = useDevice()
/** Touch screens have no hover: tapping a message shows its actions. */
const activeId = ref<string | null>(null)
const scroller = useTemplateRef<HTMLElement>('scroller')
const input = useTemplateRef<HTMLTextAreaElement>('input')

const isMine = (message: SupportMessage) => message.fromPortal === (props.side === 'portal')

async function scrollToEnd(smooth = false) {
  await nextTick()
  scroller.value?.scrollTo({ top: scroller.value.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })
}

/** Grows with the text up to the max height, then scrolls; back to one line after sending. */
function autosize() {
  const element = input.value
  if (!element) return
  element.style.height = 'auto'
  element.style.height = `${element.scrollHeight}px`
}

async function markThreadRead() {
  await props.api.markRead().catch(() => undefined)
  emit('read')
}

// --- Video call with the other side ----------------------------------------------
const router = useRouter()
const call = ref<SupportCall | null>(null)
const isStartingCall = ref(false)

const openCall = (target: SupportCall) => void router.push(`${target.url}?join=1`)

async function startCall() {
  isStartingCall.value = true
  try {
    const started = await props.api.startCall()
    call.value = started
    openCall(started)
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    isStartingCall.value = false
  }
}

function onCall(event: { organizationId: string; call: SupportCall | null }) {
  if (event.organizationId === props.organizationId) call.value = event.call
}

// --- Call recordings saved in the chat ---------------------------------------------
const playing = ref<{ message: SupportMessage; url: string } | null>(null)
const loadingRecordingId = ref<string | null>(null)

/** Recording links expire after a few hours, so a fresh one is asked for each time. */
const recordingUrl = async (message: SupportMessage) => assetUrl(await supportCallApi.recordingLink(message.recording!))!

async function playRecording(message: SupportMessage) {
  loadingRecordingId.value = message.id
  try {
    playing.value = { message, url: await recordingUrl(message) }
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    loadingRecordingId.value = null
  }
}

async function downloadRecording(message: SupportMessage) {
  try {
    const link = document.createElement('a')
    link.href = `${await recordingUrl(message)}&download=1`
    link.click()
  } catch (error) {
    toast.error(getErrorMessage(error))
  }
}

const clock = (seconds: number | null) => {
  if (seconds === null || !Number.isFinite(seconds)) return ''
  const minutes = Math.floor(seconds / 60)
  return `${minutes}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
}
const fileSize = (bytes: number | null) => (bytes ? (bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(1)} GB` : `${Math.max(1, Math.round(bytes / 1024 ** 2))} MB`) : '')

async function loadThread() {
  try {
    const thread = await props.api.thread()
    messages.value = thread.messages
    disappearHours.value = thread.disappearHours
    call.value = thread.call
    await scrollToEnd()
    // Organization admins also have Inbox notifications for these messages, so opening the chat always clears them.
    if (thread.unread || props.side === 'organization') await markThreadRead()
  } catch (error) {
    messages.value = []
    toast.error(getErrorMessage(error))
  }
}

function onIncoming(message: SupportMessage) {
  if (message.organizationId !== props.organizationId || !messages.value) return
  if (messages.value.some((item) => item.id === message.id)) return
  messages.value = [...messages.value, message]
  void scrollToEnd(true)
  if (!isMine(message)) {
    playSound('message', { id: message.id, quiet: true })
    void markThreadRead()
  }
}

/** The other side opened the conversation: this side's messages show as read. */
function onRead(event: { organizationId: string; readerSide: 'portal' | 'organization'; readAt: string }) {
  if (event.organizationId !== props.organizationId || event.readerSide === props.side || !messages.value) return
  messages.value = messages.value.map((message) => (isMine(message) && !message.readAt ? { ...message, readAt: event.readAt } : message))
}

/** A message was edited or deleted for everyone. */
function onUpdated(message: SupportMessage) {
  if (message.organizationId !== props.organizationId || !messages.value) return
  messages.value = messages.value.map((item) => (item.id === message.id ? message : item))
  if (message.deletedAt && editing.value?.id === message.id) cancelEdit()
}

function onSettings(event: { organizationId: string; disappearHours: DisappearHours }) {
  if (event.organizationId === props.organizationId) disappearHours.value = event.disappearHours
}

/** Deleted for me, here or in another tab. */
function onHidden(event: { organizationId: string; messageId: string }) {
  if (event.organizationId !== props.organizationId || !messages.value) return
  messages.value = messages.value.filter((message) => message.id !== event.messageId)
  if (editing.value?.id === event.messageId) cancelEdit()
}

/** Cleared for me, here or in another tab. */
function onCleared(event: { organizationId: string; clearedAt: string }) {
  if (event.organizationId !== props.organizationId || !messages.value) return
  const clearedAt = parseISO(event.clearedAt).getTime()
  messages.value = messages.value.filter((message) => parseISO(message.createdAt).getTime() > clearedAt)
  cancelEdit()
}

/** Disappearing messages leave the open chat as soon as their time is up. */
useIntervalFn(() => {
  if (!messages.value?.some((message) => message.expiresAt)) return
  const now = Date.now()
  messages.value = messages.value.filter((message) => !message.expiresAt || parseISO(message.expiresAt).getTime() > now)
}, 30_000)

useSocketEvents({
  'support:message': onIncoming,
  'support:read': onRead,
  'support:updated': onUpdated,
  'support:settings': onSettings,
  'support:call': onCall,
  'support:hidden': onHidden,
  'support:cleared': onCleared,
})

onMounted(() => {
  void loadThread()
  input.value?.focus()
})

async function copyMessage(message: SupportMessage) {
  await copy(message.body)
  toast.success('Message copied')
}

async function startEdit(message: SupportMessage) {
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

/** The message the delete dialog is open for. */
const deleting = ref<SupportMessage | null>(null)
const isDeleting = ref(false)
const canDeleteForEveryone = computed(() => Boolean(deleting.value && isMine(deleting.value) && !deleting.value.deletedAt))

async function deleteForEveryone() {
  const message = deleting.value
  if (!message) return
  isDeleting.value = true
  try {
    onUpdated(await props.api.remove(message.id))
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
    await props.api.hide(message.id)
    onHidden({ organizationId: props.organizationId, messageId: message.id })
    deleting.value = null
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    isDeleting.value = false
  }
}

/** The buttons beside a message: copy it, edit it (yours), and delete it (for you, or for everyone when it is yours). */
function actionsFor(message: SupportMessage) {
  const run = (action: () => unknown) => () => {
    activeId.value = null
    void action()
  }
  const remove = { label: 'Delete', icon: Trash2, danger: true, run: run(() => (deleting.value = message)) }
  if (message.deletedAt) return [remove]
  if (message.kind === 'recording') return [{ label: 'Download', icon: Download, danger: false, run: run(() => downloadRecording(message)) }, remove]
  return [
    { label: 'Copy', icon: Copy, danger: false, run: run(() => copyMessage(message)) },
    ...(isMine(message) ? [{ label: 'Edit', icon: Pencil, danger: false, run: run(() => startEdit(message)) }] : []),
    remove,
  ]
}

/** Empties the chat for this person only; everyone else keeps the history. */
async function clearChat() {
  const ok = await confirm({
    title: 'Clear this chat?',
    description: 'All messages are removed from your chat only. Others in the conversation still see them, and new messages appear here as usual.',
    confirmLabel: 'Clear chat',
    destructive: true,
  })
  if (!ok) return
  try {
    const thread = await props.api.clear()
    messages.value = thread.messages
    disappearHours.value = thread.disappearHours
    cancelEdit()
    emit('read')
    toast.success('Chat cleared')
  } catch (error) {
    toast.error(getErrorMessage(error))
  }
}
defineExpose({ clearChat })

const DISAPPEAR_CHOICES: Array<{ hours: DisappearHours; label: string }> = [
  { hours: null, label: 'Off' },
  { hours: 24, label: '24 hours' },
  { hours: 168, label: '7 days' },
]
const disappearLabel = computed(() => DISAPPEAR_CHOICES.find((choice) => choice.hours === disappearHours.value)?.label ?? 'Off')

async function chooseDisappearing(hours: DisappearHours) {
  if (hours === disappearHours.value) return
  try {
    const thread = await props.api.setDisappearing(hours)
    disappearHours.value = thread.disappearHours
    messages.value = thread.messages
    await scrollToEnd(true)
  } catch (error) {
    toast.error(getErrorMessage(error))
  }
}

async function submit() {
  const body = draft.value.trim()
  if (!body || isSending.value) return
  const edited = editing.value
  if (edited && body === edited.body) return cancelEdit()
  isSending.value = true
  try {
    if (edited) {
      onUpdated(await props.api.edit(edited.id, body))
      editing.value = null
    } else {
      onIncoming(await props.api.send(body))
    }
    draft.value = ''
    await nextTick()
    autosize()
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    isSending.value = false
    input.value?.focus()
  }
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault()
    void submit()
  } else if (event.key === 'Escape' && editing.value) {
    event.preventDefault()
    cancelEdit()
  }
}

/** Room at the end of the text for the time, "Edited", the timer and the ticks, so they never overlap it. */
const metaSpace = (message: SupportMessage) => {
  let rem = isMine(message) ? 4.25 : 3
  if (message.editedAt) rem += 2.9
  if (message.expiresAt) rem += 1
  return { width: `${rem}rem` }
}

const dayLabel = (value: string) => {
  const date = parseISO(value)
  return isToday(date) ? 'Today' : isYesterday(date) ? 'Yesterday' : format(date, 'd MMMM yyyy')
}

/** Messages in a row from the same person within a few minutes form a group: one name and one tail. */
const entries = computed(() =>
  (messages.value ?? []).map((message, index, list) => {
    const previous = list[index - 1]
    const showDay = !previous || !isSameDay(parseISO(previous.createdAt), parseISO(message.createdAt))
    const startsGroup =
      showDay ||
      !previous ||
      previous.kind === 'system' ||
      previous.authorId !== message.authorId ||
      previous.fromPortal !== message.fromPortal ||
      differenceInMinutes(parseISO(message.createdAt), parseISO(previous.createdAt)) > 5
    return { message, showDay, startsGroup }
  }),
)

const senderName = (message: SupportMessage) => (message.fromPortal ? `${message.author?.name ?? 'Vector'} · Vector team` : (message.author?.name ?? 'Someone'))
</script>

<template>
  <div class="flex min-h-0 flex-col">
    <!-- A video call with the other side is going: one tap joins it -->
    <div v-if="call" class="flex shrink-0 items-center gap-3 bg-[#00a884] px-4 py-2 text-white" role="status">
      <span class="relative flex size-2.5">
        <span class="absolute inline-flex size-full animate-ping rounded-full bg-white/70" />
        <span class="relative inline-flex size-2.5 rounded-full bg-white" />
      </span>
      <span class="min-w-0 flex-1 truncate text-sm font-medium">
        Video call {{ call.status === 'live' ? 'in progress' : 'started' }} · {{ side === 'portal' ? 'with the organization’s admins' : 'with the Vector team' }}
      </span>
      <button type="button" class="flex shrink-0 items-center gap-1.5 rounded-full bg-white px-3 py-1 text-sm font-semibold text-[#008069] hover:bg-white/90" @click="openCall(call)">
        <Video class="size-4" /> Join
      </button>
    </div>

    <!-- Conversation, on a soft patterned wallpaper -->
    <div ref="scroller" class="chat-wallpaper min-h-0 flex-1 overflow-y-auto px-[6%] py-4 scrollbar-thin">
      <div class="mx-auto mb-3 flex max-w-sm items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-center text-[11.5px] leading-snug text-amber-900/80 ring-1 ring-amber-200/70 dark:ring-amber-400/15 dark:bg-amber-400/10 dark:text-amber-200">
        <Lock class="mt-0.5 size-3 shrink-0" />
        <span>{{ notice ?? 'Messages here are only between the Vector team and this organization’s admins.' }}</span>
      </div>
      <div v-if="disappearHours" class="mx-auto mb-3 flex w-fit items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-[11.5px] text-muted-foreground shadow-soft">
        <Timer class="size-3.5 text-[#00a884]" /> Disappearing messages are on · new messages disappear after {{ disappearLabel }}
      </div>

      <template v-if="messages === null">
        <Skeleton v-for="index in 4" :key="index" class="mb-2 h-10 rounded-lg" :class="index % 2 ? 'mr-auto w-1/2' : 'ml-auto w-2/5'" />
      </template>

      <template v-for="{ message, showDay, startsGroup } in entries" v-else :key="message.id">
        <div v-if="showDay" class="sticky top-0 z-10 flex justify-center py-2">
          <span class="rounded-full border border-border bg-card px-3 py-0.5 text-[11px] font-medium text-muted-foreground shadow-soft">
            {{ dayLabel(message.createdAt) }}
          </span>
        </div>

        <!-- System notice, e.g. disappearing messages turned on -->
        <div v-if="message.kind === 'system'" class="my-2 flex justify-center">
          <span class="flex max-w-md items-start gap-1.5 rounded-lg bg-amber-50 px-3 py-1.5 text-center text-[11.5px] leading-snug text-amber-900/80 ring-1 ring-amber-200/70 dark:ring-amber-400/15 dark:bg-amber-400/10 dark:text-amber-200">
            <component :is="/video call/i.test(message.body) ? Video : Timer" class="mt-px size-3.5 shrink-0" /> {{ message.body }}
          </span>
        </div>

        <div v-else class="group/row flex items-center gap-2" :class="[isMine(message) && 'flex-row-reverse', startsGroup ? 'mt-2' : 'mt-0.5']">
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
            <!-- Bubble tail on the first message of a group -->
            <span
              v-if="startsGroup"
              class="absolute top-0 size-2.5"
              :class="
                isMine(message)
                  ? '-right-2 bg-[#d9fdd3] [clip-path:polygon(0_0,100%_0,0_100%)] dark:bg-[#005c4b]'
                  : '-left-2 bg-card [clip-path:polygon(0_0,100%_0,100%_100%)]'
              "
            />
            <p
              v-if="startsGroup && !isMine(message)"
              class="mb-0.5 text-[12.5px] font-semibold"
              :style="{ color: message.author?.avatarColor ?? '#00a884' }"
            >
              {{ senderName(message) }}
            </p>
            <p v-if="message.deletedAt" class="flex items-center gap-1.5 pr-12 text-[13.5px] text-muted-foreground italic">
              <Ban class="size-3.5 shrink-0" /> {{ isMine(message) ? 'You deleted this message' : 'This message was deleted' }}
            </p>
            <!-- A saved recording of a support call: play it here, or download it from the actions -->
            <div v-else-if="message.kind === 'recording' && message.recording" class="w-64 max-w-full pb-4">
              <button
                type="button"
                class="group/video relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-md bg-[#0d1017] text-white"
                :aria-label="`Play call recording, ${clock(message.recording.durationSeconds)}`"
                @click.stop="playRecording(message)"
              >
                <Video class="absolute top-2 left-2 size-4 text-white/60" />
                <span class="flex size-12 items-center justify-center rounded-full bg-white/20 backdrop-blur transition-colors group-hover/video:bg-white/30">
                  <LoaderCircle v-if="loadingRecordingId === message.id" class="size-6 animate-spin" />
                  <Play v-else class="size-6 translate-x-0.5" fill="currentColor" />
                </span>
                <span v-if="message.recording.durationSeconds" class="absolute right-2 bottom-1.5 text-[11px] font-medium tabular-nums">{{ clock(message.recording.durationSeconds) }}</span>
              </button>
              <p class="mt-1.5 flex items-center gap-1.5 text-[13px] font-medium"><Video class="size-3.5" /> Call recording</p>
              <p class="text-[11.5px] text-muted-foreground">
                {{ format(parseISO(message.recording.startedAt), 'd MMM yyyy, HH:mm') }}<template v-if="message.recording.sizeBytes"> · {{ fileSize(message.recording.sizeBytes) }}</template>
              </p>
            </div>
            <p v-else class="whitespace-pre-wrap break-words">
              {{ message.body }}<span class="inline-block" :style="metaSpace(message)" />
            </p>
            <span class="absolute right-2 bottom-1 flex items-center gap-0.5 text-[11px] leading-none text-muted-foreground">
              <Timer v-if="message.expiresAt && !message.deletedAt" class="size-3" :aria-label="`Disappears ${format(parseISO(message.expiresAt), 'd MMM, HH:mm')}`" />
              <span v-if="message.editedAt && !message.deletedAt" class="mr-1 italic" :title="`Edited ${format(parseISO(message.editedAt), 'd MMM, HH:mm')}`">edited</span>
              {{ format(parseISO(message.createdAt), 'HH:mm') }}
              <template v-if="isMine(message) && !message.deletedAt">
                <CheckCheck v-if="message.readAt" class="size-4 text-[#53bdeb]" aria-label="Read" />
                <Check v-else class="size-4" aria-label="Sent" />
              </template>
            </span>
          </div>

          <!-- Actions beside the bubble on hover (or tap on touch screens): copy, edit, delete -->
          <div
            class="flex shrink-0 items-center gap-0.5 rounded-full bg-popover p-0.5 shadow-elevated ring-1 ring-border transition-opacity duration-150"
            :class="activeId === message.id ? 'opacity-100' : 'pointer-events-none opacity-0 group-hover/row:pointer-events-auto group-hover/row:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100'"
            role="toolbar"
            aria-label="Message actions"
          >
            <Tooltip v-for="action in actionsFor(message)" :key="action.label">
              <TooltipTrigger as-child>
                <button
                  type="button"
                  class="flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors"
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

      <p v-if="messages && !messages.length" class="mt-6 text-center text-xs text-muted-foreground">No messages yet. Say hello 👋</p>
    </div>

    <!-- Editing a message: what it said, and the way out -->
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

    <!-- Composer -->
    <form class="flex shrink-0 items-end gap-2 border-t border-border bg-background px-3 py-2.5" @submit.prevent="submit">
      <button
        type="button"
        class="flex size-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
        :title="call ? 'Join the video call' : side === 'portal' ? 'Video call the organization’s admins' : 'Video call the Vector team'"
        :aria-label="call ? 'Join the video call' : 'Start a video call'"
        :disabled="isStartingCall"
        @click="call ? openCall(call) : startCall()"
      >
        <Video class="size-5" />
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <button
            type="button"
            class="flex size-10 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-accent"
            :class="disappearHours ? 'text-[#00a884]' : 'text-muted-foreground'"
            :title="`Disappearing messages: ${disappearLabel}`"
            aria-label="Disappearing messages"
          >
            <Timer class="size-5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="top" class="w-60">
          <DropdownMenuLabel class="text-xs">Disappearing messages</DropdownMenuLabel>
          <p class="px-2 pb-1.5 text-[11px] leading-snug text-muted-foreground">New messages disappear for both sides after the chosen time. Earlier messages stay.</p>
          <DropdownMenuSeparator />
          <DropdownMenuItem v-for="choice in DISAPPEAR_CHOICES" :key="choice.label" @select="chooseDisappearing(choice.hours)">
            <span class="flex-1">{{ choice.label }}</span>
            <Check v-if="choice.hours === disappearHours" class="size-4 text-primary" />
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <div class="flex min-h-10 flex-1 items-center rounded-xl border border-border bg-card px-4 shadow-soft transition-colors focus-within:border-ring/60 focus-within:ring-[3px] focus-within:ring-ring/15">
        <textarea
          ref="input"
          v-model="draft"
          rows="1"
          maxlength="4000"
          class="max-h-32 flex-1 resize-none bg-transparent py-2.5 text-[14px] leading-5 text-foreground outline-none placeholder:text-muted-foreground"
          :placeholder="placeholder ?? 'Type a message'"
          aria-label="Message"
          title="Enter to send · Shift + Enter for a new line"
          @input="autosize"
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
                ? '“Delete for me” removes it only from your chat. “Delete for everyone” removes it for everyone in this conversation too.'
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

    <!-- Watching a call recording -->
    <Dialog :open="Boolean(playing)" @update:open="(open) => !open && (playing = null)">
      <DialogContent class="gap-3 sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Call recording</DialogTitle>
          <DialogDescription v-if="playing?.message.recording">
            {{ format(parseISO(playing.message.recording.startedAt), 'EEEE d MMMM yyyy, HH:mm') }} · recorded by {{ senderName(playing.message) }}
          </DialogDescription>
        </DialogHeader>
        <video
          v-if="playing"
          :src="playing.url"
          controls
          autoplay
          playsinline
          class="max-h-[62dvh] w-full rounded-md bg-black object-contain"
          @loadedmetadata="(event: Event) => revealDuration(event.target as HTMLVideoElement)"
        />
        <div class="flex flex-wrap items-center justify-between gap-2">
          <p class="text-xs text-muted-foreground">Downloads are WebM videos: they open in Chrome, Edge, Firefox or VLC.</p>
          <Button v-if="playing" variant="outline" @click="downloadRecording(playing.message)"><Download /> Download</Button>
        </div>
      </DialogContent>
    </Dialog>
  </div>
</template>

<style scoped>
/* A faint dotted pattern over WhatsApp's warm chat background. */
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

<script setup lang="ts">
import { useIntervalFn } from '@vueuse/core'
import { differenceInMinutes, format, isSameDay, isToday, isYesterday, parseISO } from 'date-fns'
import { Ban, Check, CheckCheck, ChevronDown, Lock, SendHorizontal, Timer, Trash2 } from 'lucide-vue-next'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useTemplateRef } from 'vue'
import { toast } from 'vue-sonner'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { useConfirm } from '@/composables/useConfirm'
import { getErrorMessage } from '@/lib/http'
import { getSocket } from '@/lib/realtime'
import type { DisappearHours, SupportMessage, SupportThread } from '../support.api'

/**
 * A WhatsApp-style conversation between the super admin ("portal") and one organization's admins.
 * This side's messages are green on the right with read ticks; new messages and read receipts arrive live.
 */
const props = defineProps<{
  side: 'portal' | 'organization'
  organizationId: string
  load: () => Promise<SupportThread>
  send: (body: string) => Promise<SupportMessage>
  markRead: () => Promise<unknown>
  /** Deletes one of this side's messages for everyone. */
  remove: (messageId: string) => Promise<SupportMessage>
  setDisappearing: (hours: DisappearHours) => Promise<SupportThread>
  placeholder?: string
  /** Shown in the notice at the top of the conversation. */
  notice?: string
}>()
const emit = defineEmits<{ read: [] }>()

const confirm = useConfirm()
const messages = ref<SupportMessage[] | null>(null)
const disappearHours = ref<DisappearHours>(null)
const draft = ref('')
const isSending = ref(false)
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

async function markRead() {
  await props.markRead().catch(() => undefined)
  emit('read')
}

async function load() {
  try {
    const thread = await props.load()
    messages.value = thread.messages
    disappearHours.value = thread.disappearHours
    await scrollToEnd()
    // Organization admins also have Inbox notifications for these messages, so opening the chat always clears them.
    if (thread.unread || props.side === 'organization') await markRead()
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
  if (!isMine(message)) void markRead()
}

/** The other side opened the conversation: this side's messages show as read. */
function onRead(event: { organizationId: string; readerSide: 'portal' | 'organization'; readAt: string }) {
  if (event.organizationId !== props.organizationId || event.readerSide === props.side || !messages.value) return
  messages.value = messages.value.map((message) => (isMine(message) && !message.readAt ? { ...message, readAt: event.readAt } : message))
}

/** A message was deleted for everyone. */
function onUpdated(message: SupportMessage) {
  if (message.organizationId !== props.organizationId || !messages.value) return
  messages.value = messages.value.map((item) => (item.id === message.id ? message : item))
}

function onSettings(event: { organizationId: string; disappearHours: DisappearHours }) {
  if (event.organizationId === props.organizationId) disappearHours.value = event.disappearHours
}

/** Disappearing messages leave the open chat as soon as their time is up. */
useIntervalFn(() => {
  if (!messages.value?.some((message) => message.expiresAt)) return
  const now = Date.now()
  messages.value = messages.value.filter((message) => !message.expiresAt || parseISO(message.expiresAt).getTime() > now)
}, 30_000)

const SOCKET_EVENTS = { 'support:message': onIncoming, 'support:read': onRead, 'support:updated': onUpdated, 'support:settings': onSettings } as const

onMounted(() => {
  void load()
  for (const [event, handler] of Object.entries(SOCKET_EVENTS)) getSocket()?.on(event, handler as (...args: any[]) => void)
  input.value?.focus()
})
onBeforeUnmount(() => {
  for (const [event, handler] of Object.entries(SOCKET_EVENTS)) getSocket()?.off(event, handler as (...args: any[]) => void)
})

async function deleteMessage(message: SupportMessage) {
  const ok = await confirm({ title: 'Delete this message for everyone?', description: 'Everyone in this conversation will see “This message was deleted”.', confirmLabel: 'Delete', destructive: true })
  if (!ok) return
  try {
    onUpdated(await props.remove(message.id))
  } catch (error) {
    toast.error(getErrorMessage(error))
  }
}

const DISAPPEAR_CHOICES: Array<{ hours: DisappearHours; label: string }> = [
  { hours: null, label: 'Off' },
  { hours: 24, label: '24 hours' },
  { hours: 168, label: '7 days' },
]
const disappearLabel = computed(() => DISAPPEAR_CHOICES.find((choice) => choice.hours === disappearHours.value)?.label ?? 'Off')

async function chooseDisappearing(hours: DisappearHours) {
  if (hours === disappearHours.value) return
  try {
    const thread = await props.setDisappearing(hours)
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
  isSending.value = true
  try {
    const message = await props.send(body)
    draft.value = ''
    await nextTick()
    autosize()
    onIncoming(message)
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
  }
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
    <!-- Conversation, on a soft patterned wallpaper -->
    <div ref="scroller" class="chat-wallpaper min-h-0 flex-1 overflow-y-auto px-[6%] py-4 scrollbar-thin">
      <div class="mx-auto mb-3 flex max-w-sm items-start gap-2 rounded-lg bg-[#ffeecd] px-3 py-2 text-center text-[11.5px] leading-snug text-[#54656f] shadow-sm dark:bg-[#182229] dark:text-[#ffd279]">
        <Lock class="mt-0.5 size-3 shrink-0" />
        <span>{{ notice ?? 'Messages here are only between the Vector team and this organization’s admins.' }}</span>
      </div>
      <div v-if="disappearHours" class="mx-auto mb-3 flex w-fit items-center gap-1.5 rounded-lg bg-white/95 px-3 py-1.5 text-[11.5px] text-[#54656f] shadow-sm dark:bg-[#182229] dark:text-[#8696a0]">
        <Timer class="size-3.5 text-[#00a884]" /> Disappearing messages are on · new messages disappear after {{ disappearLabel }}
      </div>

      <template v-if="messages === null">
        <Skeleton v-for="index in 4" :key="index" class="mb-2 h-10 rounded-lg" :class="index % 2 ? 'mr-auto w-1/2' : 'ml-auto w-2/5'" />
      </template>

      <template v-for="{ message, showDay, startsGroup } in entries" v-else :key="message.id">
        <div v-if="showDay" class="sticky top-0 z-10 flex justify-center py-2">
          <span class="rounded-lg bg-white/95 px-3 py-1 text-[11.5px] font-medium text-[#54656f] uppercase shadow-sm dark:bg-[#182229] dark:text-[#8696a0]">
            {{ dayLabel(message.createdAt) }}
          </span>
        </div>

        <!-- System notice, e.g. disappearing messages turned on -->
        <div v-if="message.kind === 'system'" class="my-2 flex justify-center">
          <span class="flex max-w-md items-start gap-1.5 rounded-lg bg-[#ffeecd] px-3 py-1.5 text-center text-[11.5px] leading-snug text-[#54656f] shadow-sm dark:bg-[#182229] dark:text-[#ffd279]">
            <Timer class="mt-px size-3.5 shrink-0" /> {{ message.body }}
          </span>
        </div>

        <div v-else class="flex" :class="[isMine(message) ? 'justify-end' : 'justify-start', startsGroup ? 'mt-2' : 'mt-0.5']">
          <div
            class="group/bubble relative max-w-[78%] rounded-lg px-2.5 pt-1.5 pb-1 text-[14px] leading-[19px] shadow-[0_1px_0.5px_rgb(11_20_26/0.13)]"
            :class="[
              isMine(message) ? 'bg-[#d9fdd3] text-[#111b21] dark:bg-[#005c4b] dark:text-[#e9edef]' : 'bg-white text-[#111b21] dark:bg-[#202c33] dark:text-[#e9edef]',
              startsGroup && (isMine(message) ? 'rounded-tr-none' : 'rounded-tl-none'),
            ]"
          >
            <!-- Bubble tail on the first message of a group -->
            <span
              v-if="startsGroup"
              class="absolute top-0 size-2.5"
              :class="
                isMine(message)
                  ? '-right-2 bg-[#d9fdd3] [clip-path:polygon(0_0,100%_0,0_100%)] dark:bg-[#005c4b]'
                  : '-left-2 bg-white [clip-path:polygon(0_0,100%_0,100%_100%)] dark:bg-[#202c33]'
              "
            />
            <p
              v-if="startsGroup && !isMine(message)"
              class="mb-0.5 text-[12.5px] font-semibold"
              :style="{ color: message.author?.avatarColor ?? '#00a884' }"
            >
              {{ senderName(message) }}
            </p>
            <!-- Own messages: menu with "Delete for everyone" (WhatsApp's chevron on hover) -->
            <DropdownMenu v-if="isMine(message) && !message.deletedAt">
              <DropdownMenuTrigger as-child>
                <button
                  type="button"
                  class="absolute top-0.5 right-0.5 flex size-6 items-center justify-center rounded-full bg-gradient-to-l from-[#d9fdd3] via-[#d9fdd3] to-transparent text-[#667781] opacity-0 transition-opacity group-hover/bubble:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100 dark:from-[#005c4b] dark:via-[#005c4b] dark:text-[#e9edef]"
                  aria-label="Message options"
                >
                  <ChevronDown class="size-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" class="w-48">
                <DropdownMenuItem variant="destructive" @select="deleteMessage(message)"><Trash2 /> Delete for everyone</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <p v-if="message.deletedAt" class="flex items-center gap-1.5 pr-12 text-[13.5px] text-[#667781] italic dark:text-[#8696a0]">
              <Ban class="size-3.5 shrink-0" /> {{ isMine(message) ? 'You deleted this message' : 'This message was deleted' }}
            </p>
            <p v-else class="whitespace-pre-wrap break-words">
              {{ message.body
              }}<span class="inline-block" :class="[isMine(message) ? 'w-[4.25rem]' : 'w-12', message.expiresAt && 'ml-4']" />
            </p>
            <span class="absolute right-2 bottom-1 flex items-center gap-0.5 text-[11px] leading-none text-[#667781] dark:text-[#8696a0]">
              <Timer v-if="message.expiresAt && !message.deletedAt" class="size-3" :aria-label="`Disappears ${format(parseISO(message.expiresAt), 'd MMM, HH:mm')}`" />
              {{ format(parseISO(message.createdAt), 'HH:mm') }}
              <template v-if="isMine(message) && !message.deletedAt">
                <CheckCheck v-if="message.readAt" class="size-4 text-[#53bdeb]" aria-label="Read" />
                <Check v-else class="size-4" aria-label="Sent" />
              </template>
            </span>
          </div>
        </div>
      </template>

      <p v-if="messages && !messages.length" class="mt-6 text-center text-xs text-[#667781] dark:text-[#8696a0]">No messages yet. Say hello 👋</p>
    </div>

    <!-- Composer -->
    <form class="flex shrink-0 items-end gap-2 bg-[#f0f2f5] px-3 py-2.5 dark:bg-[#202c33]" @submit.prevent="submit">
      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <button
            type="button"
            class="flex size-10 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-black/5 dark:hover:bg-white/10"
            :class="disappearHours ? 'text-[#00a884]' : 'text-[#54656f] dark:text-[#8696a0]'"
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
      <div class="flex min-h-10 flex-1 items-center rounded-3xl bg-white px-4 dark:bg-[#2a3942]">
        <textarea
          ref="input"
          v-model="draft"
          rows="1"
          maxlength="4000"
          class="max-h-32 flex-1 resize-none bg-transparent py-2.5 text-[14px] leading-5 text-[#111b21] outline-none placeholder:text-[#667781] dark:text-[#e9edef] dark:placeholder:text-[#8696a0]"
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
        aria-label="Send"
      >
        <SendHorizontal class="size-[18px]" :class="isSending && 'animate-pulse'" />
      </button>
    </form>
  </div>
</template>

<style scoped>
/* A faint dotted pattern over WhatsApp's warm chat background. */
.chat-wallpaper {
  background-color: #efeae2;
  background-image:
    radial-gradient(rgb(0 0 0 / 0.045) 1px, transparent 1px),
    radial-gradient(rgb(0 0 0 / 0.03) 1px, transparent 1px);
  background-position:
    0 0,
    11px 11px;
  background-size: 22px 22px;
}
:global(.dark) .chat-wallpaper {
  background-color: #0b141a;
  background-image:
    radial-gradient(rgb(255 255 255 / 0.035) 1px, transparent 1px),
    radial-gradient(rgb(255 255 255 / 0.025) 1px, transparent 1px);
}
</style>

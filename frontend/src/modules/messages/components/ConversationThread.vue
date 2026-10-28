<script setup lang="ts">
import { differenceInMinutes, format, isSameDay, isToday, isYesterday, parseISO } from 'date-fns'
import { Ban, Check, CheckCheck, ChevronDown, Lock, SendHorizontal, Trash2 } from 'lucide-vue-next'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue'
import { toast } from 'vue-sonner'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { useConfirm } from '@/composables/useConfirm'
import { getErrorMessage } from '@/lib/http'
import { getSocket } from '@/lib/realtime'
import { useAuthStore } from '@/modules/auth/auth.store'
import { type ChatMessage, type ConversationSummary, messagesApi } from '../messages.api'
import { useMessagesStore } from '../messages.store'

/** One conversation, WhatsApp style: your messages green on the right; direct chats show blue ticks once read. */
const props = defineProps<{ conversation: ConversationSummary }>()

const auth = useAuthStore()
const store = useMessagesStore()
const confirm = useConfirm()
const messages = ref<ChatMessage[] | null>(null)
const otherLastReadAt = ref<string | null>(props.conversation.otherLastReadAt ?? null)
const draft = ref('')
const isSending = ref(false)
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
  try {
    const thread = await messagesApi.get(props.conversation.id)
    messages.value = thread.messages
    otherLastReadAt.value = thread.conversation.otherLastReadAt ?? null
    await scrollToEnd()
    await markRead()
  } catch (error) {
    messages.value = []
    toast.error(getErrorMessage(error))
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
}
function onRead(event: { conversationId: string; userId: string; readAt: string }) {
  if (event.conversationId === props.conversation.id && event.userId !== auth.user?.id) otherLastReadAt.value = event.readAt
}

const EVENTS = { 'conversation:message': onMessage, 'conversation:updated': onUpdated, 'conversation:read': onRead } as const
onMounted(() => {
  for (const [event, handler] of Object.entries(EVENTS)) getSocket()?.on(event, handler as (...args: any[]) => void)
})
onBeforeUnmount(() => {
  for (const [event, handler] of Object.entries(EVENTS)) getSocket()?.off(event, handler as (...args: any[]) => void)
})
watch(
  () => props.conversation.id,
  () => {
    draft.value = ''
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
    const message = await messagesApi.send(props.conversation.id, body)
    draft.value = ''
    await nextTick()
    autosize()
    onMessage(message)
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

async function remove(message: ChatMessage) {
  const ok = await confirm({ title: 'Delete this message for everyone?', description: 'Everyone in this chat will see “This message was deleted”.', confirmLabel: 'Delete', destructive: true })
  if (!ok) return
  try {
    onUpdated(await messagesApi.remove(props.conversation.id, message.id))
  } catch (error) {
    toast.error(getErrorMessage(error))
  }
}

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
  <div class="flex min-h-0 flex-col">
    <div ref="scroller" class="chat-wallpaper min-h-0 flex-1 overflow-y-auto px-[6%] py-4 scrollbar-thin">
      <div class="mx-auto mb-3 flex max-w-sm items-start gap-2 rounded-lg bg-[#ffeecd] px-3 py-2 text-center text-[11.5px] leading-snug text-[#54656f] shadow-sm dark:bg-[#182229] dark:text-[#ffd279]">
        <Lock class="mt-0.5 size-3 shrink-0" />
        <span>{{ notice }}</span>
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

        <div class="flex" :class="[isMine(message) ? 'justify-end' : 'justify-start', startsGroup ? 'mt-2' : 'mt-0.5']">
          <div
            class="group/bubble relative max-w-[78%] rounded-lg px-2.5 pt-1.5 pb-1 text-[14px] leading-[19px] shadow-[0_1px_0.5px_rgb(11_20_26/0.13)]"
            :class="[
              isMine(message) ? 'bg-[#d9fdd3] text-[#111b21] dark:bg-[#005c4b] dark:text-[#e9edef]' : 'bg-white text-[#111b21] dark:bg-[#202c33] dark:text-[#e9edef]',
              startsGroup && (isMine(message) ? 'rounded-tr-none' : 'rounded-tl-none'),
            ]"
          >
            <span
              v-if="startsGroup"
              class="absolute top-0 size-2.5"
              :class="
                isMine(message)
                  ? '-right-2 bg-[#d9fdd3] [clip-path:polygon(0_0,100%_0,0_100%)] dark:bg-[#005c4b]'
                  : '-left-2 bg-white [clip-path:polygon(0_0,100%_0,100%_100%)] dark:bg-[#202c33]'
              "
            />

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
                <DropdownMenuItem variant="destructive" @select="remove(message)"><Trash2 /> Delete for everyone</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <p v-if="startsGroup && !isMine(message) && !isDirect" class="mb-0.5 text-[12.5px] font-semibold" :style="{ color: message.author?.avatarColor ?? '#00a884' }">
              {{ message.author?.name ?? 'Someone' }}
            </p>
            <p v-if="message.deletedAt" class="flex items-center gap-1.5 pr-12 text-[13.5px] text-[#667781] italic dark:text-[#8696a0]">
              <Ban class="size-3.5 shrink-0" /> {{ isMine(message) ? 'You deleted this message' : 'This message was deleted' }}
            </p>
            <p v-else class="whitespace-pre-wrap break-words">
              {{ message.body }}<span class="inline-block" :class="isMine(message) ? 'w-[4.25rem]' : 'w-12'" />
            </p>
            <span class="absolute right-2 bottom-1 flex items-center gap-0.5 text-[11px] leading-none text-[#667781] dark:text-[#8696a0]">
              {{ format(parseISO(message.createdAt), 'HH:mm') }}
              <template v-if="isMine(message) && !message.deletedAt">
                <CheckCheck v-if="isDirect && isRead(message)" class="size-4 text-[#53bdeb]" aria-label="Read" />
                <Check v-else class="size-4" aria-label="Sent" />
              </template>
            </span>
          </div>
        </div>
      </template>

      <p v-if="messages && !messages.length" class="mt-6 text-center text-xs text-[#667781] dark:text-[#8696a0]">No messages yet. Say hello 👋</p>
    </div>

    <form class="flex shrink-0 items-end gap-2 bg-[#f0f2f5] px-3 py-2.5 dark:bg-[#202c33]" @submit.prevent="submit">
      <div class="flex min-h-10 flex-1 items-center rounded-3xl bg-white px-4 dark:bg-[#2a3942]">
        <textarea
          ref="input"
          v-model="draft"
          rows="1"
          maxlength="4000"
          class="max-h-32 flex-1 resize-none bg-transparent py-2.5 text-[14px] leading-5 text-[#111b21] outline-none placeholder:text-[#667781] dark:text-[#e9edef] dark:placeholder:text-[#8696a0]"
          placeholder="Type a message"
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

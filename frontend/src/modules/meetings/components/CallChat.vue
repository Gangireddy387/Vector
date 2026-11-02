<script setup lang="ts">
import { format, parseISO } from 'date-fns'
import { FileText, Megaphone, MessageCircle, Paperclip, Send, X } from 'lucide-vue-next'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue'
import { toast } from 'vue-sonner'
import UserAvatar from '@/components/common/UserAvatar.vue'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { getErrorMessage } from '@/lib/http'
import { formatBytes } from '@/lib/utils'
import { useMeetingCall } from '../useMeetingCall'
import ChatAttachment from './ChatAttachment.vue'

/**
 * Chat with the people in the call (in a breakout room: with that room). It is kept with the meeting. People from
 * the organization can share files (pasted, dropped or attached); images show inline.
 */
const props = withDefaults(defineProps<{ fileMaxMb?: number }>(), { fileMaxMb: 20 })
const call = useMeetingCall()
const chatOff = computed(() => !call.permissions.value.chat && !call.canManage.value)
const canAttach = computed(() => !call.isGuest.value)
const draft = ref('')
const toAllRooms = ref(false)
const isSending = ref(false)
const pending = ref<File | null>(null)
const progress = ref<number | null>(null)
const dragging = ref(false)
const list = useTemplateRef<HTMLOListElement>('list')
const picker = useTemplateRef<HTMLInputElement>('picker')

const scrollDown = () => nextTick(() => list.value?.scrollTo({ top: list.value.scrollHeight }))
onMounted(() => {
  call.chatVisible.value = true
  call.unreadChat.value = 0
  void scrollDown()
})
onBeforeUnmount(() => (call.chatVisible.value = false))
watch(
  () => call.chat.value.length,
  () => {
    call.unreadChat.value = 0
    void scrollDown()
  },
)

function attach(file: File | null | undefined) {
  if (!file || !canAttach.value) return
  if (file.size > props.fileMaxMb * 1024 * 1024) return void toast.error(`Files can be at most ${props.fileMaxMb} MB`)
  pending.value = file
}
const onPick = (event: Event) => {
  const input = event.target as HTMLInputElement
  attach(input.files?.[0])
  input.value = ''
}
const onPaste = (event: ClipboardEvent) => {
  const file = [...(event.clipboardData?.files ?? [])][0]
  if (!file) return
  event.preventDefault()
  attach(file)
}
const onDrop = (event: DragEvent) => {
  dragging.value = false
  attach(event.dataTransfer?.files?.[0])
}

const canSend = computed(() => Boolean(draft.value.trim() || pending.value))

async function send() {
  const body = draft.value.trim()
  if (!canSend.value || isSending.value) return
  isSending.value = true
  try {
    if (pending.value) {
      progress.value = 0
      await call.shareFile(pending.value, body, (percent) => (progress.value = percent))
      pending.value = null
    } else if (toAllRooms.value && call.breakouts.value) await call.broadcastToRooms(body)
    else await call.sendChat(body)
    draft.value = ''
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    isSending.value = false
    progress.value = null
  }
}
</script>

<template>
  <div class="relative flex min-h-0 flex-1 flex-col" @dragover.prevent="dragging = canAttach && !chatOff" @dragleave.self="dragging = false" @drop.prevent="onDrop">
    <div v-if="dragging" class="pointer-events-none absolute inset-2 z-10 flex items-center justify-center rounded-lg border-2 border-dashed border-primary bg-primary/10 text-sm font-medium text-primary">
      Drop to share the file
    </div>
    <ol ref="list" class="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
      <li v-for="message in call.chat.value" :key="message.id" class="flex gap-2.5">
        <UserAvatar :user="message.author" size="md" class="mt-0.5" />
        <div class="min-w-0 flex-1">
          <div class="flex items-baseline gap-2">
            <span class="truncate text-sm font-semibold">{{ message.author.id === call.selfUser.value?.id ? 'You' : message.author.name }}</span>
            <span class="shrink-0 text-[11px] text-muted-foreground">{{ format(parseISO(message.at), 'HH:mm') }}</span>
          </div>
          <p
            v-if="message.body || message.broadcast"
            class="mt-0.5 text-sm break-words whitespace-pre-wrap"
            :class="message.broadcast && 'rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1.5'"
          >
            <span v-if="message.broadcast" class="mb-0.5 flex items-center gap-1 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
              <Megaphone class="size-3" /> To all rooms
            </span>
            {{ message.body }}
          </p>
          <ChatAttachment v-if="message.attachment" :file="message.attachment" :resolve="call.fileUrl" />
        </div>
      </li>
      <li v-if="!call.chat.value.length" class="flex flex-col items-center gap-2 px-4 py-10 text-center text-sm text-muted-foreground">
        <MessageCircle class="size-8 text-muted-foreground/60" />
        {{
          call.room.value
            ? `Messages here go to the people in ${call.roomName.value ?? 'this room'}.`
            : 'Messages go to everyone in the call. They are kept with the meeting, so people can read them afterwards.'
        }}
      </li>
    </ol>
    <p v-if="chatOff" class="shrink-0 border-t border-border/70 p-3 text-center text-xs text-muted-foreground">The host turned chat off for now.</p>
    <form v-else class="shrink-0 space-y-2 border-t border-border/70 p-3" @submit.prevent="send">
      <div v-if="pending" class="flex items-center gap-2 rounded-md border border-border/70 bg-muted/40 px-2.5 py-1.5">
        <FileText class="size-4 shrink-0 text-primary" />
        <span class="min-w-0 flex-1 truncate text-sm">{{ pending.name }}</span>
        <span class="shrink-0 text-[11px] text-muted-foreground tabular-nums">{{ progress !== null ? `${progress}%` : formatBytes(pending.size) }}</span>
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove the file" :disabled="isSending" @click="pending = null"><X /></Button>
      </div>
      <Textarea
        v-model="draft"
        rows="2"
        maxlength="1000"
        :placeholder="pending ? 'Add a message (optional)…' : 'Send a message…'"
        class="resize-none text-sm"
        @keydown.enter.exact.prevent="send"
        @paste="onPaste"
      />
      <div class="flex items-center gap-2">
        <template v-if="canAttach">
          <input ref="picker" type="file" class="hidden" @change="onPick" />
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Attach a file" title="Attach a file" :disabled="isSending" @click="picker?.click()"><Paperclip /></Button>
        </template>
        <label v-if="call.canManage.value && call.breakouts.value && !pending" class="flex items-center gap-2 text-xs text-muted-foreground">
          <Switch v-model="toAllRooms" /> To all rooms
        </label>
        <Button type="submit" size="sm" variant="brand" class="ml-auto" :loading="isSending" :disabled="!canSend"><Send /> Send</Button>
      </div>
    </form>
  </div>
</template>

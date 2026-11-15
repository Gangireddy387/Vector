<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getErrorMessage } from '@/lib/http'
import { type ChatMessage, type ConversationSummary, messagesApi } from '../messages.api'
import { useMessagesStore } from '../messages.store'

const props = defineProps<{ open: boolean; conversationId: string; message: ChatMessage | null }>()
const emit = defineEmits<{ 'update:open': [value: boolean] }>()

const router = useRouter()
const store = useMessagesStore()
const search = ref('')
const note = ref('')
const sendingTo = ref<string | null>(null)

watch(
  () => props.open,
  (open) => {
    if (!open) return
    search.value = ''
    note.value = ''
    sendingTo.value = null
    if (!store.conversations) void store.load()
  },
)

const targets = computed(() => {
  const term = search.value.trim().toLowerCase()
  return (store.conversations ?? [])
    .filter((conversation) => conversation.id !== props.conversationId)
    .filter((conversation) => {
      if (!term) return true
      const hay = `${conversation.title} ${conversation.subtitle} ${conversation.team?.name ?? ''} ${conversation.person?.name ?? ''}`.toLowerCase()
      return hay.includes(term)
    })
    .slice(0, 40)
})

const labelOf = (conversation: ConversationSummary) => {
  if (conversation.kind === 'team') return `${conversation.team?.name ?? 'Team'} · General`
  if (conversation.kind === 'channel') return `${conversation.team?.name ?? 'Team'} · #${conversation.title}`
  if (conversation.kind === 'department') return conversation.title
  return conversation.title
}

async function forwardTo(conversation: ConversationSummary) {
  if (!props.message) return
  sendingTo.value = conversation.id
  try {
    await messagesApi.forward(props.conversationId, props.message.id, conversation.id, note.value)
    store.upsert(conversation)
    emit('update:open', false)
    toast.success(`Forwarded to ${labelOf(conversation)}`, {
      action: { label: 'Open', onClick: () => void router.push({ name: 'messages', params: { conversationId: conversation.id } }) },
    })
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    sendingTo.value = null
  }
}
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="gap-3 sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Forward message</DialogTitle>
        <DialogDescription>Send a quoted copy to another chat. The original stays where it is.</DialogDescription>
      </DialogHeader>
      <Input v-model="search" placeholder="Search chats and channels" aria-label="Search chats" autofocus />
      <Input v-model="note" placeholder="Add a note (optional)" aria-label="Optional note" />
      <div class="max-h-72 overflow-y-auto scrollbar-thin">
        <p v-if="!targets.length" class="py-8 text-center text-sm text-muted-foreground">No other chats match</p>
        <button
          v-for="conversation in targets"
          :key="conversation.id"
          type="button"
          class="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-accent disabled:opacity-50"
          :disabled="Boolean(sendingTo)"
          @click="forwardTo(conversation)"
        >
          <span class="min-w-0 flex-1 truncate font-medium">{{ labelOf(conversation) }}</span>
          <span class="shrink-0 text-[11px] text-muted-foreground capitalize">{{ conversation.kind }}</span>
          <Button v-if="sendingTo === conversation.id" size="sm" variant="secondary" disabled>Sending…</Button>
        </button>
      </div>
    </DialogContent>
  </Dialog>
</template>

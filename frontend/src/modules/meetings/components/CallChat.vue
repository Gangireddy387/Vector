<script setup lang="ts">
import { format, parseISO } from 'date-fns'
import { Megaphone, MessageCircle, Send } from 'lucide-vue-next'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue'
import { toast } from 'vue-sonner'
import UserAvatar from '@/components/common/UserAvatar.vue'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { useMeetingCall } from '../useMeetingCall'

/** Chat with the people in the call (in a breakout room: with that room). It is kept with the meeting. */
const call = useMeetingCall()
const chatOff = computed(() => !call.permissions.value.chat && !call.canManage.value)
const draft = ref('')
const toAllRooms = ref(false)
const isSending = ref(false)
const list = useTemplateRef<HTMLOListElement>('list')

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

async function send() {
  const body = draft.value.trim()
  if (!body) return
  isSending.value = true
  try {
    if (toAllRooms.value && call.breakouts.value) await call.broadcastToRooms(body)
    else await call.sendChat(body)
    draft.value = ''
  } catch (error) {
    toast.error(error instanceof Error ? error.message : 'Could not send')
  } finally {
    isSending.value = false
  }
}
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <ol ref="list" class="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
      <li v-for="message in call.chat.value" :key="message.id" class="flex gap-2.5">
        <UserAvatar :user="message.author" size="md" class="mt-0.5" />
        <div class="min-w-0 flex-1">
          <div class="flex items-baseline gap-2">
            <span class="truncate text-sm font-semibold">{{ message.author.id === call.selfUser.value?.id ? 'You' : message.author.name }}</span>
            <span class="shrink-0 text-[11px] text-muted-foreground">{{ format(parseISO(message.at), 'HH:mm') }}</span>
          </div>
          <p
            class="mt-0.5 text-sm break-words whitespace-pre-wrap"
            :class="message.broadcast && 'rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1.5'"
          >
            <span v-if="message.broadcast" class="mb-0.5 flex items-center gap-1 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
              <Megaphone class="size-3" /> To all rooms
            </span>
            {{ message.body }}
          </p>
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
      <Textarea v-model="draft" rows="2" maxlength="1000" placeholder="Send a message…" class="resize-none text-sm" @keydown.enter.exact.prevent="send" />
      <div class="flex items-center gap-2">
        <label v-if="call.canManage.value && call.breakouts.value" class="flex items-center gap-2 text-xs text-muted-foreground">
          <Switch v-model="toAllRooms" /> To all rooms
        </label>
        <Button type="submit" size="sm" variant="brand" class="ml-auto" :loading="isSending" :disabled="!draft.trim()"><Send /> Send</Button>
      </div>
    </form>
  </div>
</template>

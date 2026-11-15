<script setup lang="ts">
import { ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { getErrorMessage } from '@/lib/http'
import { type ChatMessage, messagesApi } from '../messages.api'

const props = defineProps<{ open: boolean; conversationId: string }>()
const emit = defineEmits<{ 'update:open': [value: boolean]; created: [message: ChatMessage] }>()

const title = ref('')
const body = ref('')
const sending = ref(false)

watch(
  () => props.open,
  (open) => {
    if (!open) return
    title.value = ''
    body.value = ''
    sending.value = false
  },
)

async function submit() {
  sending.value = true
  try {
    const message = await messagesApi.createApproval(props.conversationId, {
      title: title.value.trim(),
      ...(body.value.trim() ? { body: body.value.trim() } : {}),
    })
    emit('created', message)
    emit('update:open', false)
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    sending.value = false
  }
}
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="gap-3 sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Request approval</DialogTitle>
        <DialogDescription>People in this channel can approve or reject. One rejection finishes it as rejected.</DialogDescription>
      </DialogHeader>
      <Input v-model="title" placeholder="What needs approval?" aria-label="Approval title" autofocus />
      <textarea
        v-model="body"
        rows="3"
        class="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        placeholder="Details (optional)"
        aria-label="Approval details"
      />
      <Button class="w-full" :disabled="sending || !title.trim()" :loading="sending" @click="submit">Post request</Button>
    </DialogContent>
  </Dialog>
</template>

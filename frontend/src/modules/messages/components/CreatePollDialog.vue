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

const question = ref('')
const options = ref(['', ''])
const sending = ref(false)

watch(
  () => props.open,
  (open) => {
    if (!open) return
    question.value = ''
    options.value = ['', '']
    sending.value = false
  },
)

const addOption = () => {
  if (options.value.length < 6) options.value = [...options.value, '']
}
const removeOption = (index: number) => {
  if (options.value.length <= 2) return
  options.value = options.value.filter((_, i) => i !== index)
}

async function submit() {
  const cleaned = options.value.map((item) => item.trim()).filter(Boolean)
  sending.value = true
  try {
    const message = await messagesApi.createPoll(props.conversationId, { question: question.value.trim(), options: cleaned })
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
        <DialogTitle>Create a poll</DialogTitle>
        <DialogDescription>Posted in this channel. Votes are visible to everyone here.</DialogDescription>
      </DialogHeader>
      <Input v-model="question" placeholder="Ask a question" aria-label="Poll question" autofocus />
      <div class="space-y-2">
        <Input
          v-for="(_, index) in options"
          :key="index"
          v-model="options[index]"
          :placeholder="`Option ${index + 1}`"
          :aria-label="`Option ${index + 1}`"
        />
        <div class="flex gap-2">
          <Button v-if="options.length < 6" type="button" size="sm" variant="secondary" @click="addOption">Add option</Button>
          <Button v-if="options.length > 2" type="button" size="sm" variant="ghost" @click="removeOption(options.length - 1)">Remove last</Button>
        </div>
      </div>
      <Button class="w-full" :disabled="sending || !question.trim()" :loading="sending" @click="submit">Post poll</Button>
    </DialogContent>
  </Dialog>
</template>

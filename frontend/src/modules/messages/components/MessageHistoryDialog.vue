<script setup lang="ts">
import { format, parseISO } from 'date-fns'
import { ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import MarkdownContent from '@/components/common/MarkdownContent.vue'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { getErrorMessage } from '@/lib/http'
import { type ChatMessage, type MessageRevision, messagesApi } from '../messages.api'

const props = defineProps<{ open: boolean; conversationId: string; message: ChatMessage | null }>()
const emit = defineEmits<{ 'update:open': [value: boolean] }>()

const revisions = ref<MessageRevision[] | null>(null)

watch(
  () => [props.open, props.message?.id] as const,
  async ([open]) => {
    if (!open || !props.message) {
      revisions.value = null
      return
    }
    revisions.value = null
    try {
      revisions.value = await messagesApi.history(props.conversationId, props.message.id)
    } catch (error) {
      revisions.value = []
      toast.error(getErrorMessage(error))
    }
  },
)
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="gap-3 sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>Edit history</DialogTitle>
        <DialogDescription>Earlier versions of this message, newest first.</DialogDescription>
      </DialogHeader>
      <div class="max-h-96 space-y-3 overflow-y-auto scrollbar-thin">
        <template v-if="revisions === null">
          <Skeleton v-for="index in 2" :key="index" class="h-20 w-full rounded-lg" />
        </template>
        <p v-else-if="!revisions.length" class="py-8 text-center text-sm text-muted-foreground">No earlier versions yet.</p>
        <article v-for="revision in revisions" :key="revision.id" class="rounded-lg border border-border bg-card px-3 py-2.5">
          <p class="mb-1.5 text-[11px] text-muted-foreground">
            {{ revision.editor?.name ?? 'Someone' }} · {{ format(parseISO(revision.createdAt), 'd MMM yyyy, HH:mm') }}
          </p>
          <p v-if="revision.subject" class="mb-1 text-[13px] font-semibold">{{ revision.subject }}</p>
          <MarkdownContent :source="revision.body" class="text-[13px]" />
        </article>
      </div>
    </DialogContent>
  </Dialog>
</template>

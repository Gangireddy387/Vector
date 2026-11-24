<script setup lang="ts">
import { format, parseISO } from 'date-fns'
import { Bookmark, BookmarkX, Hash, MessageCircle } from 'lucide-vue-next'
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import UserAvatar from '@/components/common/UserAvatar.vue'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { getErrorMessage } from '@/lib/http'
import { toPlainText } from '@/lib/markdown'
import { type SavedItem, messagesApi } from '../messages.api'

/** Messages this person saved ("Save this message"), across every chat and channel, newest saves first. */
const open = defineModel<boolean>('open', { default: false })

const router = useRouter()
const items = ref<SavedItem[] | null>(null)

watch(open, async (value) => {
  if (!value) return
  items.value = null
  try {
    items.value = await messagesApi.saved()
  } catch (error) {
    items.value = []
    toast.error(getErrorMessage(error))
  }
})

const where = (item: SavedItem) => (item.conversation.team && item.conversation.kind !== 'direct' ? `${item.conversation.team.name} · ${item.conversation.title}` : item.conversation.title)
const preview = (item: SavedItem) => item.message.subject || toPlainText(item.message.body, 180) || item.message.files?.map((file) => file.fileName).join(', ') || 'Message'

async function go(item: SavedItem) {
  open.value = false
  const postId = item.message.parentId ?? item.message.id
  await router.push({ name: 'messages', params: { conversationId: item.conversation.id }, query: item.conversation.kind === 'direct' ? {} : { post: postId } })
}

async function unsave(item: SavedItem) {
  try {
    await messagesApi.save(item.conversation.id, item.message.id, false)
    items.value = (items.value ?? []).filter((entry) => entry.message.id !== item.message.id)
  } catch (error) {
    toast.error(getErrorMessage(error))
  }
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="gap-3 sm:max-w-lg">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2"><Bookmark class="size-4" /> Saved</DialogTitle>
        <DialogDescription>Messages you saved to come back to. Only you see this list.</DialogDescription>
      </DialogHeader>
      <div class="max-h-[60vh] overflow-y-auto scrollbar-thin">
        <div v-if="items === null" class="space-y-2">
          <Skeleton v-for="index in 3" :key="index" class="h-16 w-full" />
        </div>
        <p v-else-if="!items.length" class="py-10 text-center text-sm text-muted-foreground">Nothing saved yet. Use “Save this message” in a message’s … menu.</p>
        <div v-for="item in items ?? []" v-else :key="item.message.id" class="group flex items-start gap-3 rounded-lg px-2 py-2.5 hover:bg-accent/60">
          <button type="button" class="flex min-w-0 flex-1 items-start gap-3 text-left" @click="go(item)">
            <UserAvatar :user="item.message.author" size="md" class="size-8 shrink-0" />
            <span class="min-w-0 flex-1">
              <span class="flex items-baseline gap-2 text-[13px]">
                <span class="truncate font-semibold">{{ item.message.author?.name ?? 'Someone' }}</span>
                <span class="shrink-0 text-[11px] text-muted-foreground">{{ format(parseISO(item.message.createdAt), 'd MMM, HH:mm') }}</span>
              </span>
              <span class="line-clamp-2 text-[13px] text-foreground/90">{{ preview(item) }}</span>
              <span class="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                <MessageCircle v-if="item.conversation.kind === 'direct'" class="size-3" />
                <Hash v-else class="size-3" />
                {{ where(item) }}
              </span>
            </span>
          </button>
          <Button variant="ghost" size="icon-sm" class="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100" aria-label="Remove from Saved" title="Remove from Saved" @click="unsave(item)">
            <BookmarkX />
          </Button>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>

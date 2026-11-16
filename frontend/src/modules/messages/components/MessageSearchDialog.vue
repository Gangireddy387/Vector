<script setup lang="ts">
import { useDebounceFn } from '@vueuse/core'
import { format, parseISO } from 'date-fns'
import { Hash, MessageCircle, Search, SearchX } from 'lucide-vue-next'
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import UserAvatar from '@/components/common/UserAvatar.vue'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { getErrorMessage } from '@/lib/http'
import { toPlainText } from '@/lib/markdown'
import { type MessageSearchHit, messagesApi } from '../messages.api'

/** Workspace-wide message search: every chat and channel this person can open. */
const open = defineModel<boolean>('open', { default: false })

const router = useRouter()
const query = ref('')
const results = ref<MessageSearchHit[] | null>(null)
const isLoading = ref(false)
const searched = ref('')

watch(open, (value) => {
  if (!value) return
  query.value = ''
  results.value = null
  searched.value = ''
  isLoading.value = false
})

async function runSearch(term: string) {
  const q = term.trim()
  searched.value = q
  if (!q) {
    results.value = null
    isLoading.value = false
    return
  }
  isLoading.value = true
  try {
    results.value = await messagesApi.searchAll(q)
  } catch (error) {
    results.value = []
    toast.error(getErrorMessage(error))
  } finally {
    isLoading.value = false
  }
}

const debouncedSearch = useDebounceFn(runSearch, 280)
watch(query, (value) => {
  if (!open.value) return
  if (!value.trim()) {
    results.value = null
    searched.value = ''
    isLoading.value = false
    return
  }
  isLoading.value = true
  void debouncedSearch(value)
})

const where = (hit: MessageSearchHit) =>
  hit.conversation.team && hit.conversation.kind !== 'direct' ? `${hit.conversation.team.name} · ${hit.conversation.title}` : hit.conversation.title
const preview = (hit: MessageSearchHit) =>
  hit.message.subject || toPlainText(hit.message.body, 180) || hit.message.files?.map((file) => file.fileName).join(', ') || 'Message'

async function go(hit: MessageSearchHit) {
  open.value = false
  const postId = hit.message.parentId ?? hit.message.id
  await router.push({
    name: 'messages',
    params: { conversationId: hit.conversation.id },
    query: hit.conversation.kind === 'direct' ? {} : { post: postId },
  })
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="gap-3 sm:max-w-lg">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2"><Search class="size-4" /> Search messages</DialogTitle>
        <DialogDescription>Find text across every chat and channel you can open.</DialogDescription>
      </DialogHeader>
      <div class="relative">
        <Search class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input v-model="query" class="pl-9" placeholder="Search messages" aria-label="Search messages" autofocus @keydown.enter.prevent="runSearch(query)" />
      </div>
      <div class="max-h-[60vh] overflow-y-auto scrollbar-thin">
        <div v-if="isLoading" class="space-y-2">
          <Skeleton v-for="index in 4" :key="index" class="h-16 w-full" />
        </div>
        <p v-else-if="!searched" class="py-10 text-center text-sm text-muted-foreground">Type to search across all your conversations.</p>
        <div v-else-if="!results?.length" class="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
          <SearchX class="size-6" />
          Nothing matches “{{ searched }}”
        </div>
        <button
          v-for="hit in results ?? []"
          v-else
          :key="hit.message.id"
          type="button"
          class="flex w-full items-start gap-3 rounded-lg px-2 py-2.5 text-left hover:bg-accent/60"
          @click="go(hit)"
        >
          <UserAvatar :user="hit.message.author" size="md" class="size-8 shrink-0" />
          <span class="min-w-0 flex-1">
            <span class="flex items-baseline gap-2 text-[13px]">
              <span class="truncate font-semibold">{{ hit.message.author?.name ?? 'Someone' }}</span>
              <span class="shrink-0 text-[11px] text-muted-foreground">{{ format(parseISO(hit.message.createdAt), 'd MMM, HH:mm') }}</span>
            </span>
            <span class="line-clamp-2 text-[13px] text-foreground/90">{{ preview(hit) }}</span>
            <span class="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
              <MessageCircle v-if="hit.conversation.kind === 'direct'" class="size-3" />
              <Hash v-else class="size-3" />
              {{ where(hit) }}
            </span>
          </span>
        </button>
      </div>
    </DialogContent>
  </Dialog>
</template>

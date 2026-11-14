<script setup lang="ts">
import { format, parseISO } from 'date-fns'
import { Download, FileArchive, FileImage, FileSpreadsheet, FileText, FolderOpen, MessageSquareText, Search } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import UserAvatar from '@/components/common/UserAvatar.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { assetUrl, getErrorMessage } from '@/lib/http'
import { useSocketEvents } from '@/lib/socket-events'
import { formatBytes } from '@/lib/utils'
import { type ChatMessage, type SharedFile, messagesApi } from '../messages.api'

/** The channel's Files tab, like Teams: everything shared in its posts and replies, newest first. */
const props = defineProps<{ conversationId: string }>()
const emit = defineEmits<{ openPost: [postId: string] }>()

const files = ref<SharedFile[] | null>(null)
const search = ref('')

async function load() {
  try {
    files.value = await messagesApi.files(props.conversationId)
  } catch (error) {
    files.value = []
    toast.error(getErrorMessage(error))
  }
}
watch(() => props.conversationId, load, { immediate: true })
// New files arrive with messages; deleted messages take theirs away.
useSocketEvents({
  'conversation:message': (message: ChatMessage) => message.conversationId === props.conversationId && message.files?.length && void load(),
  'conversation:updated': (message: ChatMessage) => message.conversationId === props.conversationId && message.deletedAt && void load(),
})

const shown = computed(() => {
  const term = search.value.trim().toLowerCase()
  return (files.value ?? []).filter((file) => !term || `${file.fileName} ${file.uploader?.name ?? ''}`.toLowerCase().includes(term))
})

function iconOf(file: SharedFile) {
  if (file.mimeType.startsWith('image/')) return FileImage
  if (/sheet|excel|csv/i.test(file.mimeType) || /\.(xlsx?|csv)$/i.test(file.fileName)) return FileSpreadsheet
  if (/zip|compressed|tar|rar|7z/i.test(file.mimeType)) return FileArchive
  return FileText
}

async function open(file: SharedFile) {
  const tab = window.open('', '_blank')
  if (tab) tab.opener = null
  try {
    const url = assetUrl(await messagesApi.fileLink(props.conversationId, file.id))!
    if (tab) tab.location.href = url
    else window.location.assign(url)
  } catch (error) {
    tab?.close()
    toast.error(getErrorMessage(error))
  }
}
</script>

<template>
  <div class="flex min-h-0 flex-col">
    <div class="flex shrink-0 items-center gap-3 border-b border-border px-4 py-2.5 sm:px-[5%]">
      <div class="relative max-w-xs flex-1">
        <Search class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input v-model="search" class="h-8 pl-9" placeholder="Search files" aria-label="Search files" />
      </div>
      <span v-if="files" class="text-xs text-muted-foreground">{{ files.length }} {{ files.length === 1 ? 'file' : 'files' }}</span>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
      <div v-if="files === null" class="space-y-2 p-4">
        <Skeleton v-for="index in 4" :key="index" class="h-12 w-full" />
      </div>
      <div v-else-if="!shown.length" class="flex flex-col items-center gap-2 px-6 py-16 text-center">
        <span class="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary"><FolderOpen class="size-6" /></span>
        <p class="text-sm font-medium">{{ search ? `No files match “${search}”` : 'No files yet' }}</p>
        <p class="max-w-sm text-xs text-muted-foreground">Files shared in posts and replies show up here. Attach one with the paperclip, or paste or drop it into the box.</p>
      </div>
      <table v-else class="w-full text-sm">
        <thead class="sticky top-0 bg-background text-left text-xs text-muted-foreground">
          <tr class="border-b border-border">
            <th class="px-4 py-2 font-medium sm:pl-[5%]">Name</th>
            <th class="hidden px-3 py-2 font-medium md:table-cell">Shared by</th>
            <th class="hidden px-3 py-2 font-medium sm:table-cell">Date</th>
            <th class="hidden px-3 py-2 text-right font-medium sm:table-cell">Size</th>
            <th class="w-24 px-4 py-2 sm:pr-[5%]"><span class="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="file in shown" :key="file.id" class="group border-b border-border/60 hover:bg-accent/40">
            <td class="px-4 py-2 sm:pl-[5%]">
              <button type="button" class="flex min-w-0 items-center gap-2.5 text-left" :title="`Open ${file.fileName}`" @click="open(file)">
                <component :is="iconOf(file)" class="size-5 shrink-0 text-primary" />
                <span class="truncate font-medium group-hover:underline">{{ file.fileName }}</span>
              </button>
            </td>
            <td class="hidden px-3 py-2 md:table-cell">
              <span class="flex items-center gap-2"><UserAvatar :user="file.uploader" size="xs" /> <span class="truncate">{{ file.uploader?.name ?? 'Someone' }}</span></span>
            </td>
            <td class="hidden px-3 py-2 whitespace-nowrap text-muted-foreground sm:table-cell">{{ format(parseISO(file.createdAt), 'd MMM yyyy') }}</td>
            <td class="hidden px-3 py-2 text-right whitespace-nowrap text-muted-foreground tabular-nums sm:table-cell">{{ formatBytes(file.size) }}</td>
            <td class="px-4 py-2 sm:pr-[5%]">
              <span class="flex justify-end gap-0.5">
                <Button variant="ghost" size="icon-sm" :aria-label="`Show the post with ${file.fileName}`" title="Show in the conversation" @click="emit('openPost', file.postId)"><MessageSquareText /></Button>
                <Button variant="ghost" size="icon-sm" :aria-label="`Open ${file.fileName}`" title="Open" @click="open(file)"><Download /></Button>
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

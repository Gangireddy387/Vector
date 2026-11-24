<script setup lang="ts">
import { format, parseISO } from 'date-fns'
import { Copy, Download, Eye, FileArchive, FileImage, FileSpreadsheet, FileText, FolderOpen, MessageSquareText, Search } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import FilePreviewLightbox from '@/components/common/FilePreviewLightbox.vue'
import ResponsiveTable from '@/components/common/ResponsiveTable.vue'
import Toolbar from '@/components/common/Toolbar.vue'
import UserAvatar from '@/components/common/UserAvatar.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { isPreviewable } from '@/lib/file-preview'
import { assetUrl, getErrorMessage } from '@/lib/http'
import { useSocketEvents } from '@/lib/socket-events'
import { formatBytes } from '@/lib/utils'
import { type ChatMessage, type SharedFile, messagesApi } from '../messages.api'

/** The channel's Files tab, like Teams: everything shared in its posts and replies, newest first. */
const props = defineProps<{ conversationId: string }>()
const emit = defineEmits<{ openPost: [postId: string] }>()

const files = ref<SharedFile[] | null>(null)
const search = ref('')
const previewOpen = ref(false)
const previewLoading = ref(false)
const previewUrl = ref<string | null>(null)
const previewFile = ref<SharedFile | null>(null)

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

async function resolveUrl(file: SharedFile) {
  return assetUrl(await messagesApi.fileLink(props.conversationId, file.id))!
}

async function open(file: SharedFile) {
  if (isPreviewable(file.mimeType)) {
    previewFile.value = file
    previewOpen.value = true
    previewLoading.value = true
    previewUrl.value = null
    try {
      previewUrl.value = await resolveUrl(file)
    } catch (error) {
      previewOpen.value = false
      toast.error(getErrorMessage(error))
    } finally {
      previewLoading.value = false
    }
    return
  }
  const tab = window.open('', '_blank')
  if (tab) tab.opener = null
  try {
    const url = await resolveUrl(file)
    if (tab) tab.location.href = url
    else window.location.assign(url)
  } catch (error) {
    tab?.close()
    toast.error(getErrorMessage(error))
  }
}

async function downloadCurrent() {
  if (!previewFile.value) return
  try {
    const url = previewUrl.value ?? (await resolveUrl(previewFile.value))
    const tab = window.open(url, '_blank', 'noopener')
    if (!tab) window.location.assign(url)
  } catch (error) {
    toast.error(getErrorMessage(error))
  }
}

function onPreviewOpen(value: boolean) {
  previewOpen.value = value
  if (!value) {
    previewUrl.value = null
    previewFile.value = null
  }
}

async function copyLink(file: SharedFile) {
  try {
    const url = await resolveUrl(file)
    await navigator.clipboard.writeText(url.startsWith('http') ? url : `${window.location.origin}${url}`)
    toast.success('Link copied')
  } catch (error) {
    toast.error(getErrorMessage(error))
  }
}
</script>

<template>
  <div class="flex min-h-0 flex-col">
    <Toolbar variant="wrap" dense class="shrink-0 border-b border-border px-4 py-2.5">
      <div class="relative max-w-xs min-w-0 flex-1">
        <Search class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input v-model="search" class="h-8 pl-9" placeholder="Search files" aria-label="Search files" />
      </div>
      <span v-if="files" class="text-xs text-muted-foreground">{{ files.length }} {{ files.length === 1 ? 'file' : 'files' }}</span>
    </Toolbar>

    <div class="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
      <div v-if="files === null" class="space-y-2 p-4">
        <Skeleton v-for="index in 4" :key="index" class="h-12 w-full" />
      </div>
      <div v-else-if="!shown.length" class="flex flex-col items-center gap-2 px-6 py-16 text-center">
        <span class="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary"><FolderOpen class="size-6" /></span>
        <p class="text-sm font-medium">{{ search ? `No files match “${search}”` : 'No files yet' }}</p>
        <p class="max-w-sm text-xs text-muted-foreground">Files shared in posts and replies show up here. Attach one with the paperclip, or paste or drop it into the box.</p>
      </div>
      <ResponsiveTable v-else breakpoint="lg">
        <template #list>
          <ul class="divide-y divide-border/60">
            <li v-for="file in shown" :key="file.id" class="group flex items-start gap-3 px-4 py-3">
              <button type="button" class="flex min-w-0 flex-1 items-start gap-2.5 text-left" :title="isPreviewable(file.mimeType) ? `Preview ${file.fileName}` : `Open ${file.fileName}`" @click="open(file)">
                <component :is="iconOf(file)" class="mt-0.5 size-5 shrink-0 text-primary" />
                <span class="min-w-0">
                  <span class="block truncate font-medium">{{ file.fileName }}</span>
                  <span class="mt-0.5 block truncate text-xs text-muted-foreground">
                    {{ file.uploader?.name ?? 'Someone' }} · {{ format(parseISO(file.createdAt), 'd MMM yyyy') }} · {{ formatBytes(file.size) }}
                  </span>
                </span>
              </button>
              <span class="flex shrink-0 gap-0.5 opacity-100 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100 sm:focus-within:opacity-100">
                <Button variant="ghost" size="icon-sm" :aria-label="`Show the post with ${file.fileName}`" title="Show in the conversation" @click="emit('openPost', file.postId)"><MessageSquareText /></Button>
                <Button variant="ghost" size="icon-sm" :aria-label="`Copy link to ${file.fileName}`" title="Copy link" @click="copyLink(file)"><Copy /></Button>
                <Button v-if="isPreviewable(file.mimeType)" variant="ghost" size="icon-sm" :aria-label="`Preview ${file.fileName}`" title="Preview" @click="open(file)"><Eye /></Button>
                <Button variant="ghost" size="icon-sm" :aria-label="`Open ${file.fileName}`" title="Open" @click="open(file)"><Download /></Button>
              </span>
            </li>
          </ul>
        </template>
        <template #table>
          <table class="w-full text-sm">
            <thead class="sticky top-0 bg-background text-left text-xs text-muted-foreground">
              <tr class="border-b border-border">
                <th class="px-4 py-2 font-medium sm:pl-[5%]">Name</th>
                <th class="px-3 py-2 font-medium">Shared by</th>
                <th class="px-3 py-2 font-medium">Date</th>
                <th class="px-3 py-2 text-right font-medium">Size</th>
                <th class="w-24 px-4 py-2 sm:pr-[5%]"><span class="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="file in shown" :key="file.id" class="group border-b border-border/60 hover:bg-accent/40">
                <td class="px-4 py-2 sm:pl-[5%]">
                  <button type="button" class="flex min-w-0 items-center gap-2.5 text-left" :title="isPreviewable(file.mimeType) ? `Preview ${file.fileName}` : `Open ${file.fileName}`" @click="open(file)">
                    <component :is="iconOf(file)" class="size-5 shrink-0 text-primary" />
                    <span class="truncate font-medium group-hover:underline">{{ file.fileName }}</span>
                  </button>
                </td>
                <td class="px-3 py-2">
                  <span class="flex items-center gap-2"><UserAvatar :user="file.uploader" size="xs" /> <span class="truncate">{{ file.uploader?.name ?? 'Someone' }}</span></span>
                </td>
                <td class="px-3 py-2 whitespace-nowrap text-muted-foreground">{{ format(parseISO(file.createdAt), 'd MMM yyyy') }}</td>
                <td class="px-3 py-2 text-right whitespace-nowrap text-muted-foreground tabular-nums">{{ formatBytes(file.size) }}</td>
                <td class="px-4 py-2 sm:pr-[5%]">
                  <span class="flex justify-end gap-0.5 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100">
                    <Button variant="ghost" size="icon-sm" :aria-label="`Show the post with ${file.fileName}`" title="Show in the conversation" @click="emit('openPost', file.postId)"><MessageSquareText /></Button>
                    <Button variant="ghost" size="icon-sm" :aria-label="`Copy link to ${file.fileName}`" title="Copy link" @click="copyLink(file)"><Copy /></Button>
                    <Button
                      v-if="isPreviewable(file.mimeType)"
                      variant="ghost"
                      size="icon-sm"
                      :aria-label="`Preview ${file.fileName}`"
                      title="Preview"
                      @click="open(file)"
                    >
                      <Eye />
                    </Button>
                    <Button variant="ghost" size="icon-sm" :aria-label="`Open ${file.fileName}`" title="Open" @click="open(file)"><Download /></Button>
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </template>
      </ResponsiveTable>
    </div>

    <FilePreviewLightbox
      :open="previewOpen"
      :file-name="previewFile?.fileName ?? ''"
      :mime-type="previewFile?.mimeType ?? ''"
      :url="previewUrl"
      :loading="previewLoading"
      @update:open="onPreviewOpen"
      @download="downloadCurrent"
    />
  </div>
</template>

<script setup lang="ts">
import { Download, FileText, ImageOff, LoaderCircle } from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'
import { toast } from 'vue-sonner'
import { assetUrl, getErrorMessage } from '@/lib/http'
import { formatBytes } from '@/lib/utils'
import type { MeetingFile } from '../meetings.api'

/**
 * A file shared in a call's chat: images show inline, other files as a chip that downloads them. Links to files are
 * short-lived, so they are asked for (`resolve`) when needed.
 */
const props = defineProps<{ file: MeetingFile; resolve: (fileId: string) => Promise<string> }>()

const isImage = computed(() => /^image\/(png|jpeg|gif|webp)$/i.test(props.file.mimeType))
const preview = ref<string | null>(null)
const failed = ref(false)
const isOpening = ref(false)

async function link() {
  return assetUrl(await props.resolve(props.file.id))!
}

onMounted(async () => {
  if (!isImage.value) return
  try {
    preview.value = await link()
  } catch {
    failed.value = true
  }
})

/** The tab opens on the click itself (browsers block tabs opened later), then goes to the file once its link is known. */
async function open() {
  if (preview.value) return void window.open(preview.value, '_blank', 'noopener')
  const tab = window.open('', '_blank')
  if (tab) tab.opener = null
  isOpening.value = true
  try {
    const url = await link()
    if (tab) tab.location.href = url
    else window.location.assign(url)
  } catch (error) {
    tab?.close()
    toast.error(getErrorMessage(error))
  } finally {
    isOpening.value = false
  }
}
</script>

<template>
  <button v-if="isImage && !failed" type="button" class="mt-1 block max-w-full overflow-hidden rounded-md border border-border/70 bg-muted/40" :title="`Open ${file.fileName}`" @click="open">
    <img v-if="preview" :src="preview" :alt="file.fileName" class="max-h-48 max-w-full object-contain" loading="lazy" @error="failed = true" />
    <span v-else class="flex h-24 w-40 items-center justify-center"><LoaderCircle class="size-5 animate-spin text-muted-foreground" /></span>
  </button>
  <button
    v-else
    type="button"
    class="mt-1 flex w-full max-w-xs items-center gap-2.5 rounded-md border border-border/70 bg-muted/40 px-2.5 py-2 text-left transition-colors hover:bg-muted"
    :title="`Download ${file.fileName}`"
    @click="open"
  >
    <ImageOff v-if="isImage" class="size-5 shrink-0 text-muted-foreground" />
    <FileText v-else class="size-5 shrink-0 text-primary" />
    <span class="min-w-0 flex-1">
      <span class="block truncate text-sm font-medium">{{ file.fileName }}</span>
      <span class="block text-[11px] text-muted-foreground">{{ formatBytes(file.size) }}</span>
    </span>
    <LoaderCircle v-if="isOpening" class="size-4 shrink-0 animate-spin text-muted-foreground" />
    <Download v-else class="size-4 shrink-0 text-muted-foreground" />
  </button>
</template>

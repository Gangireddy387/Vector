<script setup lang="ts">
import { Download, Eye, FileText, Film, ImageOff, LoaderCircle, Music } from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'
import { toast } from 'vue-sonner'
import FilePreviewLightbox from '@/components/common/FilePreviewLightbox.vue'
import { isInlineImage, isPreviewable, previewKind } from '@/lib/file-preview'
import { assetUrl, getErrorMessage } from '@/lib/http'
import { formatBytes } from '@/lib/utils'
import type { MeetingFile } from '../meetings.api'

/**
 * A file shared in chat: images show as thumbs; image / PDF / video / audio open in a lightbox.
 * Other types download. Links are short-lived, so `resolve` is called when needed.
 */
const props = defineProps<{ file: MeetingFile; resolve: (fileId: string) => Promise<string> }>()

const showImage = computed(() => isInlineImage(props.file.mimeType))
const canPreview = computed(() => isPreviewable(props.file.mimeType))
const kind = computed(() => previewKind(props.file.mimeType))

const preview = ref<string | null>(null)
const failed = ref(false)
const isOpening = ref(false)
const lightboxOpen = ref(false)
const lightboxLoading = ref(false)
const lightboxUrl = ref<string | null>(null)

async function link() {
  return assetUrl(await props.resolve(props.file.id))!
}

onMounted(async () => {
  if (!showImage.value) return
  try {
    preview.value = await link()
  } catch {
    failed.value = true
  }
})

async function ensureUrl() {
  if (lightboxUrl.value) return lightboxUrl.value
  if (preview.value) {
    lightboxUrl.value = preview.value
    return preview.value
  }
  lightboxLoading.value = true
  try {
    const url = await link()
    lightboxUrl.value = url
    return url
  } finally {
    lightboxLoading.value = false
  }
}

async function open() {
  if (!canPreview.value) {
    isOpening.value = true
    try {
      const url = preview.value ?? (await link())
      const tab = window.open(url, '_blank', 'noopener')
      if (!tab) window.location.assign(url)
    } catch (error) {
      toast.error(getErrorMessage(error))
    } finally {
      isOpening.value = false
    }
    return
  }
  lightboxOpen.value = true
  try {
    await ensureUrl()
  } catch (error) {
    lightboxOpen.value = false
    toast.error(getErrorMessage(error))
  }
}

async function download() {
  isOpening.value = true
  try {
    const url = lightboxUrl.value ?? preview.value ?? (await link())
    const tab = window.open(url, '_blank', 'noopener')
    if (!tab) window.location.assign(url)
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    isOpening.value = false
  }
}

const chipIcon = computed(() => {
  if (kind.value === 'video') return Film
  if (kind.value === 'audio') return Music
  if (kind.value === 'pdf') return FileText
  return FileText
})
</script>

<template>
  <button
    v-if="showImage && !failed"
    type="button"
    class="mt-1 block max-w-full overflow-hidden rounded-md border border-border/70 bg-muted/40"
    :title="`Preview ${file.fileName}`"
    @click="open"
  >
    <img v-if="preview" :src="preview" :alt="file.fileName" class="max-h-48 max-w-full object-contain" loading="lazy" @error="failed = true" />
    <span v-else class="flex h-24 w-40 items-center justify-center"><LoaderCircle class="size-5 animate-spin text-muted-foreground" /></span>
  </button>
  <button
    v-else
    type="button"
    class="mt-1 flex w-full max-w-xs items-center gap-2.5 rounded-md border border-border/70 bg-muted/40 px-2.5 py-2 text-left transition-colors hover:bg-muted"
    :title="canPreview ? `Preview ${file.fileName}` : `Download ${file.fileName}`"
    @click="open"
  >
    <ImageOff v-if="showImage" class="size-5 shrink-0 text-muted-foreground" />
    <component :is="chipIcon" v-else class="size-5 shrink-0 text-primary" />
    <span class="min-w-0 flex-1">
      <span class="block truncate text-sm font-medium">{{ file.fileName }}</span>
      <span class="block text-[11px] text-muted-foreground">{{ formatBytes(file.size) }}</span>
    </span>
    <LoaderCircle v-if="isOpening || lightboxLoading" class="size-4 shrink-0 animate-spin text-muted-foreground" />
    <Eye v-else-if="canPreview" class="size-4 shrink-0 text-muted-foreground" />
    <Download v-else class="size-4 shrink-0 text-muted-foreground" />
  </button>

  <FilePreviewLightbox
    v-model:open="lightboxOpen"
    :file-name="file.fileName"
    :mime-type="file.mimeType"
    :url="lightboxUrl"
    :loading="lightboxLoading"
    @download="download"
  />
</template>

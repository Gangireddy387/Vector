<script setup lang="ts">
import { Download, LoaderCircle } from 'lucide-vue-next'
import { computed } from 'vue'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { type PreviewKind, previewKind } from '@/lib/file-preview'

const open = defineModel<boolean>('open', { default: false })

const props = defineProps<{
  fileName: string
  mimeType: string
  /** Object URL or signed CDN/API URL once resolved. */
  url: string | null
  /** Microsoft Office Online embed URL when available (public HTTPS deploy). */
  officeEmbedUrl?: string | null
  loading?: boolean
}>()

const emit = defineEmits<{ download: [] }>()

const kind = computed<PreviewKind | null>(() =>
  previewKind(props.mimeType, { office: Boolean(props.officeEmbedUrl) }),
)
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="flex max-h-[calc(100dvh-2rem)] w-[calc(100%-1rem)] flex-col gap-3 overflow-hidden p-4 sm:max-w-4xl sm:p-5">
      <DialogHeader class="shrink-0 space-y-1 pr-8">
        <DialogTitle class="truncate text-base">{{ fileName }}</DialogTitle>
        <DialogDescription class="sr-only">Preview of {{ fileName }}</DialogDescription>
      </DialogHeader>

      <div class="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-muted/40">
        <div v-if="loading || (!url && kind !== 'office')" class="flex h-48 items-center justify-center">
          <LoaderCircle class="size-6 animate-spin text-muted-foreground" />
        </div>
        <img
          v-else-if="kind === 'image' && url"
          :src="url"
          :alt="fileName"
          class="max-h-[min(70dvh,720px)] max-w-full object-contain"
        />
        <iframe
          v-else-if="kind === 'pdf' && url"
          :src="url"
          :title="fileName"
          class="h-[min(70dvh,720px)] w-full border-0 bg-background"
        />
        <iframe
          v-else-if="kind === 'office' && officeEmbedUrl"
          :src="officeEmbedUrl"
          :title="fileName"
          class="h-[min(70dvh,720px)] w-full border-0 bg-background"
        />
        <video
          v-else-if="kind === 'video' && url"
          :src="url"
          controls
          class="max-h-[min(70dvh,720px)] max-w-full"
        />
        <audio v-else-if="kind === 'audio' && url" :src="url" controls class="w-full max-w-md" />
        <p v-else class="px-6 py-12 text-center text-sm text-muted-foreground">
          <template v-if="kind === null && /officedocument|msword|ms-excel|ms-powerpoint/i.test(mimeType)">
            Office preview needs a public HTTPS API URL (set PUBLIC_API_URL). Download the file instead.
          </template>
          <template v-else>This file type can’t be previewed in the browser.</template>
        </p>
      </div>

      <div class="flex shrink-0 justify-end">
        <Button size="sm" @click="emit('download')"><Download /> Download</Button>
      </div>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { ImagePlus, Loader2, Trash2, Upload } from 'lucide-vue-next'
import { computed, ref, useTemplateRef } from 'vue'
import { toast } from 'vue-sonner'
import ImageCropDialog from '@/components/common/ImageCropDialog.vue'
import { Button } from '@/components/ui/button'
import { assetUrl, getErrorMessage } from '@/lib/http'
import { ACCEPTED_IMAGE_TYPES, assertImageFile } from '@/lib/image'
import { useWorkspaceStore } from '@/stores/workspace.store'

const workspace = useWorkspaceStore()
const fileInput = useTemplateRef<HTMLInputElement>('fileInput')
const isUploading = ref(false)
const isRemoving = ref(false)
const isDragging = ref(false)
const pendingFile = ref<File | null>(null)
const isCropOpen = ref(false)

const logo = computed(() => assetUrl(workspace.settings.logoUrl))

/** A chosen or dropped image first opens the adjust dialog; nothing is uploaded until "Save logo". */
function pick(file: File | undefined) {
  if (fileInput.value) fileInput.value.value = ''
  if (!file) return
  try {
    assertImageFile(file)
  } catch (error) {
    toast.error(getErrorMessage(error))
    return
  }
  pendingFile.value = file
  isCropOpen.value = true
}

async function upload(blob: Blob, fileName: string) {
  isUploading.value = true
  try {
    await workspace.uploadLogo(blob, fileName)
    isCropOpen.value = false
    toast.success('Organization logo updated')
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    isUploading.value = false
  }
}

async function remove() {
  isRemoving.value = true
  try {
    await workspace.removeLogo()
    toast.success('Organization logo removed')
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    isRemoving.value = false
  }
}

function onDrop(event: DragEvent) {
  isDragging.value = false
  pick(event.dataTransfer?.files[0])
}
</script>

<template>
  <div class="flex flex-col gap-4 sm:flex-row sm:items-center">
    <button
      type="button"
      class="group relative flex size-20 shrink-0 items-center justify-center overflow-hidden border border-dashed border-border bg-muted/40 outline-none focus-visible:ring-4 focus-visible:ring-ring/30"
      :class="[isDragging && 'ring-4 ring-primary/40', logo && 'border-solid bg-white']"
      :aria-label="logo ? 'Change organization logo' : 'Upload organization logo'"
      :disabled="isUploading"
      @click="fileInput?.click()"
      @dragover.prevent="isDragging = true"
      @dragleave="isDragging = false"
      @drop.prevent="onDrop"
    >
      <img v-if="logo" :src="logo" :alt="`${workspace.settings.name} logo`" class="size-full object-contain p-1.5" />
      <ImagePlus v-else class="size-7 text-muted-foreground" />
      <span
        class="absolute inset-0 flex items-center justify-center bg-black/45 text-white transition-opacity"
        :class="isUploading || isDragging ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100'"
      >
        <Loader2 v-if="isUploading" class="size-6 animate-spin" />
        <Upload v-else class="size-6" />
      </span>
    </button>

    <div class="min-w-0 space-y-2.5">
      <div class="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="outline" :loading="isUploading" @click="fileInput?.click()">
          <Upload /> {{ logo ? 'Change logo' : 'Upload logo' }}
        </Button>
        <Button v-if="logo" type="button" size="sm" variant="ghost" class="text-destructive hover:text-destructive" :loading="isRemoving" @click="remove">
          <Trash2 /> Remove
        </Button>
      </div>
      <p class="text-xs text-muted-foreground">PNG, JPEG, WebP or GIF. You can position, zoom and rotate it before saving — or drop an image on the box.</p>
    </div>

    <input
      ref="fileInput"
      type="file"
      class="hidden"
      :accept="ACCEPTED_IMAGE_TYPES.join(',')"
      @change="pick(($event.target as HTMLInputElement).files?.[0])"
    />

    <ImageCropDialog v-model:open="isCropOpen" variant="logo" :file="pendingFile" :saving="isUploading" @save="upload" />
  </div>
</template>

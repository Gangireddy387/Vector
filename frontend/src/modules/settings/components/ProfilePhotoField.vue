<script setup lang="ts">
import { Camera, Loader2, Trash2, Upload } from 'lucide-vue-next'
import { computed, ref, useTemplateRef } from 'vue'
import { toast } from 'vue-sonner'
import ColorSwatchPicker from '@/components/common/ColorSwatchPicker.vue'
import ImageCropDialog from '@/components/common/ImageCropDialog.vue'
import UserAvatar from '@/components/common/UserAvatar.vue'
import { Button } from '@/components/ui/button'
import { getErrorMessage } from '@/lib/http'
import { ACCEPTED_IMAGE_TYPES, assertImageFile } from '@/lib/image'
import { useAuthStore } from '@/modules/auth/auth.store'

/** Live preview name while the profile form is being edited. */
const props = defineProps<{ previewName?: string }>()
/** Background colour behind the initials when there is no photo. */
const color = defineModel<string>('color', { required: true })

const auth = useAuthStore()
const fileInput = useTemplateRef<HTMLInputElement>('fileInput')
const isUploading = ref(false)
const isRemoving = ref(false)
const isDragging = ref(false)
const pendingFile = ref<File | null>(null)
const isCropOpen = ref(false)

const hasPhoto = computed(() => Boolean(auth.user?.avatarUrl))
const previewUser = computed(() =>
  auth.user ? { ...auth.user, name: props.previewName || auth.user.name, avatarColor: color.value } : null,
)

/** A chosen or dropped image first opens the adjust dialog; nothing is uploaded until "Save photo". */
function pick(file: File | undefined) {
  if (fileInput.value) fileInput.value.value = ''
  if (!file) return
  try {
    assertImageFile(file)
  } catch (error) {
    toast.error(error instanceof Error ? error.message : 'That file cannot be used.')
    return
  }
  pendingFile.value = file
  isCropOpen.value = true
}

async function upload(blob: Blob, fileName: string) {
  isUploading.value = true
  try {
    await auth.uploadAvatar(blob, fileName)
    isCropOpen.value = false
    toast.success('Profile photo updated')
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    isUploading.value = false
  }
}

async function remove() {
  isRemoving.value = true
  try {
    await auth.removeAvatar()
    toast.success('Profile photo removed')
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
      class="group relative shrink-0 rounded-full outline-none focus-visible:ring-4 focus-visible:ring-ring/30"
      :class="isDragging && 'ring-4 ring-primary/40'"
      :aria-label="hasPhoto ? 'Change profile photo' : 'Upload profile photo'"
      :disabled="isUploading"
      @click="fileInput?.click()"
      @dragover.prevent="isDragging = true"
      @dragleave="isDragging = false"
      @drop.prevent="onDrop"
    >
      <UserAvatar :user="previewUser" size="xl" />
      <span
        class="absolute inset-0 flex items-center justify-center rounded-full bg-black/45 text-white transition-opacity"
        :class="isUploading || isDragging ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100'"
      >
        <Loader2 v-if="isUploading" class="size-6 animate-spin" />
        <Camera v-else class="size-6" />
      </span>
    </button>

    <div class="min-w-0 space-y-2.5">
      <div class="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="outline" :loading="isUploading" @click="fileInput?.click()">
          <Upload /> {{ hasPhoto ? 'Change photo' : 'Upload photo' }}
        </Button>
        <Button v-if="hasPhoto" type="button" size="sm" variant="ghost" class="text-destructive hover:text-destructive" :loading="isRemoving" @click="remove">
          <Trash2 /> Remove
        </Button>
      </div>
      <p class="text-xs text-muted-foreground">PNG, JPEG, WebP or GIF. You can position, zoom and rotate it before saving — or drop an image on the picture.</p>
      <div class="space-y-1.5">
        <p class="text-xs font-medium text-muted-foreground">{{ hasPhoto ? 'Colour (used if the photo is removed)' : 'Background colour' }}</p>
        <ColorSwatchPicker v-model="color" />
      </div>
    </div>

    <input
      ref="fileInput"
      type="file"
      class="hidden"
      :accept="ACCEPTED_IMAGE_TYPES.join(',')"
      @change="pick(($event.target as HTMLInputElement).files?.[0])"
    />

    <ImageCropDialog v-model:open="isCropOpen" :file="pendingFile" :saving="isUploading" @save="upload" />
  </div>
</template>

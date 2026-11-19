<script setup lang="ts">
import { ImagePlus, Trash2 } from 'lucide-vue-next'
import { onMounted, ref, useTemplateRef } from 'vue'
import { toast } from 'vue-sonner'
import EmptyState from '@/components/common/EmptyState.vue'
import ImageCropDialog from '@/components/common/ImageCropDialog.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { reloadShowcaseTeam, type ShowcasePortrait } from '@/composables/useShowcaseTeam'
import { assetUrl, getErrorMessage, http } from '@/lib/http'
import { ACCEPTED_IMAGE_TYPES, assertImageFile } from '@/lib/image'
import { useSocketEvents } from '@/lib/socket-events'

/** Super admin uploads portraits used on About / sign-in rich UI. */
const portraits = ref<ShowcasePortrait[] | null>(null)
const name = ref('')
const isUploading = ref(false)
const removingId = ref<string | null>(null)
const fileInput = useTemplateRef<HTMLInputElement>('fileInput')
const pendingFile = ref<File | null>(null)
const isCropOpen = ref(false)

async function load() {
  try {
    const { data } = await http.get<{ portraits: ShowcasePortrait[] }>('/super-admin/showcase')
    portraits.value = data.portraits
  } catch (error) {
    toast.error(getErrorMessage(error))
    portraits.value = []
  }
}

onMounted(load)
useSocketEvents({
  'showcase:updated': (payload: { portraits?: ShowcasePortrait[] }) => {
    portraits.value = payload?.portraits ?? []
  },
})

/** Opens the adjust dialog; nothing uploads until Save photo. */
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
    const body = new FormData()
    body.append('image', blob, fileName)
    if (name.value.trim()) body.append('name', name.value.trim())
    await http.post('/super-admin/showcase', body)
    name.value = ''
    isCropOpen.value = false
    pendingFile.value = null
    toast.success('Portrait added to the gallery')
    await load()
    await reloadShowcaseTeam()
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    isUploading.value = false
  }
}

async function remove(id: string) {
  removingId.value = id
  try {
    await http.delete(`/super-admin/showcase/${id}`)
    toast.success('Portrait removed')
    await load()
    await reloadShowcaseTeam()
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    removingId.value = null
  }
}
</script>

<template>
  <div class="space-y-4">
    <div class="rounded-xl border border-border bg-card p-4 shadow-soft sm:p-5">
      <h2 class="text-sm font-semibold">Showcase gallery</h2>
      <p class="mt-1 text-sm text-muted-foreground">
        Photos here appear in the floating people on About and sign-in. Upload up to 20 images — you can crop, zoom and rotate before saving.
      </p>
      <div class="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end">
        <div class="min-w-0 flex-1 space-y-1">
          <label class="text-xs font-medium text-muted-foreground" for="showcase-name">Display name (optional)</label>
          <Input id="showcase-name" v-model="name" placeholder="e.g. Priya" maxlength="60" />
        </div>
        <input
          ref="fileInput"
          type="file"
          class="hidden"
          :accept="ACCEPTED_IMAGE_TYPES.join(',')"
          @change="pick(($event.target as HTMLInputElement).files?.[0])"
        />
        <Button type="button" :loading="isUploading" @click="fileInput?.click()">
          <ImagePlus />
          Upload photo
        </Button>
      </div>
      <p class="mt-2 text-xs text-muted-foreground">PNG, JPEG, WebP or GIF. Position, zoom and rotate in the adjust dialog before saving.</p>
    </div>

    <div v-if="!portraits" class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Skeleton v-for="index in 4" :key="index" class="h-28" />
    </div>
    <EmptyState
      v-else-if="!portraits.length"
      title="No portraits yet"
      description="Upload a few faces — the rich About and login UI will use them instead of the built-in illustrations."
    />
    <ul v-else class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <li
        v-for="portrait in portraits"
        :key="portrait.id"
        class="flex items-center gap-3 rounded-xl border border-border bg-card p-3 shadow-soft"
      >
        <img
          :src="assetUrl(portrait.imageUrl)"
          :alt="portrait.name"
          class="size-14 rounded-full object-cover ring-2 ring-border"
          :class="`bg-linear-to-br ${portrait.tone}`"
        />
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-medium">{{ portrait.name }}</p>
          <p class="truncate text-[11px] text-muted-foreground">Used on marketing &amp; sign-in</p>
        </div>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          class="shrink-0 text-destructive"
          :loading="removingId === portrait.id"
          aria-label="Remove"
          @click="remove(portrait.id)"
        >
          <Trash2 />
        </Button>
      </li>
    </ul>

    <ImageCropDialog v-model:open="isCropOpen" :file="pendingFile" :saving="isUploading" @save="upload" />
  </div>
</template>

<script setup lang="ts">
import { Download, FileText, Image, Trash2, Upload } from 'lucide-vue-next'
import { ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { useConfirm } from '@/composables/useConfirm'
import { formatDate, formatDateTime } from '@/lib/format'
import { getErrorMessage } from '@/lib/http'
import { formatBytes } from '@/lib/utils'
import type { Attachment } from '@/types/models'
import { attachmentsApi } from '../../api/collaboration.api'

const props = withDefaults(defineProps<{ issueId: string; editable?: boolean; refreshKey?: number }>(), { editable: true, refreshKey: 0 })
const emit = defineEmits<{ changed: [] }>()

const confirm = useConfirm()
const attachments = ref<Attachment[]>([])
const uploadProgress = ref<number | null>(null)
const isDragging = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

const load = async () => (attachments.value = await attachmentsApi.list(props.issueId))
watch(() => [props.issueId, props.refreshKey], load, { immediate: true })

async function upload(files: File[]) {
  if (!files.length) return
  uploadProgress.value = 0
  try {
    await attachmentsApi.upload(props.issueId, files, (percent) => (uploadProgress.value = percent))
    await load()
    emit('changed')
    toast.success(`${files.length} file(s) attached`)
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    uploadProgress.value = null
  }
}

function onDrop(event: DragEvent) {
  isDragging.value = false
  if (props.editable) void upload([...(event.dataTransfer?.files ?? [])])
}

function onSelect(event: Event) {
  const input = event.target as HTMLInputElement
  void upload([...(input.files ?? [])])
  input.value = ''
}

async function remove(attachment: Attachment) {
  const confirmed = await confirm({ title: `Delete ${attachment.fileName}?`, confirmLabel: 'Delete', destructive: true })
  if (!confirmed) return
  await attachmentsApi.remove(attachment.id)
  await load()
  emit('changed')
}

const openPicker = () => fileInput.value?.click()
defineExpose({ openPicker })
</script>

<template>
  <section class="space-y-3" @dragover.prevent="isDragging = editable" @dragleave="isDragging = false" @drop.prevent="onDrop">
    <div class="flex items-center justify-between">
      <h2 class="text-sm font-semibold">
        Attachments <span v-if="attachments.length" class="font-normal text-muted-foreground">{{ attachments.length }}</span>
      </h2>
      <Button v-if="editable" variant="ghost" size="xs" @click="openPicker"><Upload /> Upload</Button>
      <input ref="fileInput" type="file" multiple class="hidden" @change="onSelect" />
    </div>

    <Progress v-if="uploadProgress !== null" :model-value="uploadProgress" class="h-1.5" />

    <div
      v-if="isDragging"
      class="flex h-24 items-center justify-center border-2 border-dashed border-primary bg-primary/5 text-sm text-primary"
    >
      Drop files to attach
    </div>

    <ul v-if="attachments.length" class="grid gap-2 sm:grid-cols-2">
      <li v-for="attachment in attachments" :key="attachment.id" class="group flex items-center gap-3 border bg-card p-2.5">
        <span class="flex size-9 shrink-0 items-center justify-center bg-muted text-muted-foreground">
          <Image v-if="attachment.mimeType.startsWith('image/')" class="size-4" />
          <FileText v-else class="size-4" />
        </span>
        <span class="min-w-0 flex-1">
          <span class="block truncate text-sm font-medium" :title="attachment.fileName">{{ attachment.fileName }}</span>
          <span class="block truncate text-xs text-muted-foreground" :title="`Attached ${formatDateTime(attachment.createdAt)}${attachment.uploader ? ` by ${attachment.uploader.name}` : ''}`">
            {{ formatBytes(attachment.size) }} · {{ formatDate(attachment.createdAt, 'd MMM, HH:mm') }}<template v-if="attachment.uploader"> · {{ attachment.uploader.name }}</template>
          </span>
        </span>
        <Button variant="ghost" size="icon-sm" :aria-label="`Download ${attachment.fileName}`" @click="attachmentsApi.download(attachment)">
          <Download />
        </Button>
        <Button v-if="editable" variant="ghost" size="icon-sm" class="text-muted-foreground hover:text-destructive" :aria-label="`Delete ${attachment.fileName}`" @click="remove(attachment)">
          <Trash2 />
        </Button>
      </li>
    </ul>
    <button
      v-else-if="editable && !isDragging"
      type="button"
      class="flex w-full items-center justify-center gap-2 border border-dashed py-4 text-sm text-muted-foreground hover:bg-muted/40"
      @click="openPicker"
    >
      <Upload class="size-4" /> Drop files here or browse
    </button>
  </section>
</template>

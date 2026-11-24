<script setup lang="ts">
import { Bold, CheckSquare, Heading2, ImagePlus, Link2, List, ListOrdered, LoaderCircle, Paperclip } from 'lucide-vue-next'
import { ref } from 'vue'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import { getErrorMessage } from '@/lib/http'
import { isInlineImage } from '@/lib/file-preview'
import { wikiApi } from '../wiki.api'

const props = defineProps<{ textarea: HTMLTextAreaElement | null; pageId?: string | null }>()
const emit = defineEmits<{ change: [] }>()

const uploading = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

function wrapOrInsert(before: string, after = '', placeholder = '') {
  const el = props.textarea
  if (!el) return
  const start = el.selectionStart
  const end = el.selectionEnd
  const value = el.value
  const selected = value.slice(start, end) || placeholder
  const next = `${value.slice(0, start)}${before}${selected}${after}${value.slice(end)}`
  el.value = next
  el.dispatchEvent(new Event('input', { bubbles: true }))
  emit('change')
  const cursor = start + before.length + selected.length
  requestAnimationFrame(() => {
    el.focus()
    el.setSelectionRange(start + before.length, cursor)
  })
}

function insertLine(prefix: string) {
  const el = props.textarea
  if (!el) return
  const start = el.selectionStart
  const value = el.value
  const lineStart = value.lastIndexOf('\n', start - 1) + 1
  const next = `${value.slice(0, lineStart)}${prefix}${value.slice(lineStart)}`
  el.value = next
  el.dispatchEvent(new Event('input', { bubbles: true }))
  emit('change')
  requestAnimationFrame(() => {
    el.focus()
    const pos = start + prefix.length
    el.setSelectionRange(pos, pos)
  })
}

function insertAtCursor(snippet: string) {
  const el = props.textarea
  if (!el) return
  const start = el.selectionStart
  const end = el.selectionEnd
  const next = `${el.value.slice(0, start)}${snippet}${el.value.slice(end)}`
  el.value = next
  el.dispatchEvent(new Event('input', { bubbles: true }))
  emit('change')
  requestAnimationFrame(() => {
    el.focus()
    const pos = start + snippet.length
    el.setSelectionRange(pos, pos)
  })
}

async function onPick(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || !props.pageId) return
  uploading.value = true
  try {
    const uploaded = await wikiApi.uploadFile(props.pageId, file)
    const label = uploaded.fileName.replace(/[[\]]/g, '')
    const ref = `wiki-file:${uploaded.id}`
    if (isInlineImage(uploaded.mimeType)) insertAtCursor(`\n![${label}](${ref})\n`)
    else insertAtCursor(`\n[${label}](${ref})\n`)
    toast.success('File attached')
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    uploading.value = false
  }
}
</script>

<template>
  <div class="flex flex-wrap items-center gap-0.5" role="toolbar" aria-label="Formatting">
    <Button type="button" size="icon-sm" variant="ghost" title="Heading" @click="insertLine('## ')">
      <Heading2 class="size-3.5" />
    </Button>
    <Button type="button" size="icon-sm" variant="ghost" title="Bold" @click="wrapOrInsert('**', '**', 'bold')">
      <Bold class="size-3.5" />
    </Button>
    <Button type="button" size="icon-sm" variant="ghost" title="Bullet list" @click="insertLine('- ')">
      <List class="size-3.5" />
    </Button>
    <Button type="button" size="icon-sm" variant="ghost" title="Numbered list" @click="insertLine('1. ')">
      <ListOrdered class="size-3.5" />
    </Button>
    <Button type="button" size="icon-sm" variant="ghost" title="Checklist" @click="insertLine('- [ ] ')">
      <CheckSquare class="size-3.5" />
    </Button>
    <Button type="button" size="icon-sm" variant="ghost" title="Link" @click="wrapOrInsert('[', '](url)', 'label')">
      <Link2 class="size-3.5" />
    </Button>
    <Button type="button" size="icon-sm" variant="ghost" title="Wiki page link [[Title]]" @click="wrapOrInsert('[[', ']]', 'Page title')">
      <span class="text-[10px] font-semibold tracking-tight">[[ ]]</span>
    </Button>
    <template v-if="pageId">
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        title="Attach image or file"
        :disabled="uploading"
        @click="fileInput?.click()"
      >
        <LoaderCircle v-if="uploading" class="size-4 animate-spin text-muted-foreground" />
        <ImagePlus v-else class="size-3.5" />
      </Button>
      <input ref="fileInput" type="file" class="hidden" @change="onPick" />
    </template>
    <span class="ml-1 hidden text-[11px] text-muted-foreground sm:inline">
      <template v-if="pageId"><Paperclip class="mr-0.5 inline size-3" />Attach files · </template>
      Select text, then format — link pages with [[Title]]
    </span>
  </div>
</template>

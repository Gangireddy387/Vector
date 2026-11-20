<script setup lang="ts">
import { Bold, CheckSquare, Heading2, Link2, List, ListOrdered } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'

const props = defineProps<{ textarea: HTMLTextAreaElement | null }>()
const emit = defineEmits<{ change: [] }>()

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
    <span class="ml-1 hidden text-[11px] text-muted-foreground sm:inline">Select text, then format — link pages with [[Title]]</span>
  </div>
</template>

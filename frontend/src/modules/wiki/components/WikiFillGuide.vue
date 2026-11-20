<script setup lang="ts">
import { Circle, CircleCheck, ListChecks } from 'lucide-vue-next'
import { computed } from 'vue'
import { Button } from '@/components/ui/button'

const props = defineProps<{ body: string; textarea: HTMLTextAreaElement | null }>()

interface Section {
  title: string
  start: number
  filled: boolean
}

const PLACEHOLDER = /_(?:[^_\n]{2,80})_|> \*\*Tip:\*\*/
const EMPTYISH = /^[\s|\-\[\]xX.#*]*$/

function sectionFilled(chunk: string) {
  const lines = chunk
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('##') && !line.startsWith('> **Tip:**'))
  if (!lines.length) return false
  const substantive = lines.filter((line) => !EMPTYISH.test(line.replace(/\|/g, '')))
  if (!substantive.length) return false
  const stillPrompt = substantive.filter((line) => PLACEHOLDER.test(line) || /_Name_|_Date_|_URL_|\.\.\.$/.test(line))
  return stillPrompt.length < substantive.length
}

const sections = computed<Section[]>(() => {
  const text = props.body || ''
  const matches = [...text.matchAll(/^##\s+(.+)$/gm)]
  if (!matches.length) return []
  return matches.map((match, index) => {
    const start = match.index ?? 0
    const end = index + 1 < matches.length ? (matches[index + 1]!.index ?? text.length) : text.length
    const title = match[1]!.trim()
    const chunk = text.slice(start, end)
    return { title, start, filled: sectionFilled(chunk) }
  })
})

const filledCount = computed(() => sections.value.filter((section) => section.filled).length)
const progress = computed(() => (sections.value.length ? Math.round((filledCount.value / sections.value.length) * 100) : 0))

function jumpTo(section: Section) {
  const el = props.textarea
  if (!el) return
  el.focus()
  el.setSelectionRange(section.start, section.start)
  // Place caret near the heading; scroll textarea to that line.
  const before = el.value.slice(0, section.start)
  const line = before.split('\n').length
  const lineHeight = 24
  el.scrollTop = Math.max(0, (line - 2) * lineHeight)
}
</script>

<template>
  <div v-if="sections.length" class="space-y-2 border border-border/70 bg-card/80 p-3">
    <div class="flex items-center gap-2">
      <ListChecks class="size-3.5 text-primary" />
      <p class="min-w-0 flex-1 text-[12px] font-semibold">Fill progress</p>
      <span class="text-[11px] text-muted-foreground">{{ filledCount }}/{{ sections.length }}</span>
    </div>
    <div class="h-1.5 overflow-hidden rounded-full bg-muted">
      <div class="h-full rounded-full bg-primary transition-all duration-300" :style="{ width: `${progress}%` }" />
    </div>
    <p class="text-[11px] leading-snug text-muted-foreground">
      Italic text like <em>_this_</em> is a prompt — replace it. Click a section to jump there.
    </p>
    <ul class="space-y-0.5">
      <li v-for="section in sections" :key="section.start + section.title">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          class="h-7 w-full justify-start gap-2 px-1.5 text-[12px] font-normal"
          @click="jumpTo(section)"
        >
          <CircleCheck v-if="section.filled" class="size-3.5 text-primary" />
          <Circle v-else class="size-3.5 text-muted-foreground" />
          <span class="truncate" :class="section.filled ? 'text-muted-foreground' : 'text-foreground'">{{ section.title }}</span>
        </Button>
      </li>
    </ul>
  </div>
</template>

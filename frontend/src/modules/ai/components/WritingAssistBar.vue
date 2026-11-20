<script setup lang="ts">
import { Check, Sparkles, X } from 'lucide-vue-next'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { getErrorMessage } from '@/lib/http'
import { useAuthStore } from '@/modules/auth/auth.store'
import { aiApi, aiSourceHint, type WritingMode, type WritingSurface } from '@/modules/issues/api/ai.api'

const props = withDefaults(
  defineProps<{
    modelValue: string
    selection?: string
    surface?: WritingSurface
    /** Scopes project AI instructions + issue retrieval. */
    projectId?: string | null
    /** Fetch ghost next-phrase suggestions after the user pauses typing. */
    autoSuggest?: boolean
    compact?: boolean
  }>(),
  // Auto-suggest while typing is off by default — it interrupted people. Use Continue when you want ideas.
  { selection: '', surface: 'general', projectId: null, autoSuggest: false, compact: false },
)

const route = useRoute()
const resolvedProjectId = computed(
  () => props.projectId || (typeof route.params.projectId === 'string' ? route.params.projectId : null),
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
  applied: [mode: WritingMode]
}>()

const auth = useAuthStore()
const locked = computed(() => !auth.hasFeature('aiAssistant'))
const busy = ref(false)
const activeMode = ref<WritingMode | null>(null)
const ghost = ref<string | null>(null)
const alternatives = ref<string[]>([])
const sourceHint = ref<string | undefined>()
let suggestTimer: ReturnType<typeof setTimeout> | null = null
let suggestSeq = 0

const ACTIONS: Array<{ mode: WritingMode; label: string; hint: string }> = [
  { mode: 'complete', label: 'Continue', hint: 'Suggest the next words' },
  { mode: 'grammar', label: 'Fix grammar', hint: 'Spelling & grammar only' },
  { mode: 'polish', label: 'Polish', hint: 'Clearer, more professional' },
  { mode: 'clearer', label: 'Make clearer', hint: 'Cut filler, keep meaning' },
  { mode: 'shorten', label: 'Shorten', hint: 'Fewer words' },
  { mode: 'expand', label: 'Expand', hint: 'Add helpful structure' },
]

function clearGhost() {
  ghost.value = null
  alternatives.value = []
  sourceHint.value = undefined
}

function acceptGhost(piece = ghost.value) {
  if (!piece) return
  emit('update:modelValue', `${props.modelValue}${piece}`)
  emit('applied', 'complete')
  clearGhost()
}

async function run(mode: WritingMode) {
  if (locked.value || busy.value) return
  const text = props.modelValue
  if (!text.trim() && mode !== 'expand' && mode !== 'complete') {
    toast.message('Write a little first')
    return
  }
  busy.value = true
  activeMode.value = mode
  clearGhost()
  try {
    const result = await aiApi.writingAssist({
      text,
      selection: props.selection?.trim() || undefined,
      mode,
      surface: props.surface,
      projectId: resolvedProjectId.value,
    })
    sourceHint.value = aiSourceHint(result.source)
    if (mode === 'complete' && result.continuation) {
      ghost.value = result.continuation
      void loadAlternatives()
    } else {
      emit('update:modelValue', result.text)
      emit('applied', mode)
      if (sourceHint.value) toast.message(ACTIONS.find((row) => row.mode === mode)?.label ?? 'Updated', { description: sourceHint.value })
      else toast.success(mode === 'grammar' ? 'Grammar fixed' : mode === 'polish' ? 'Polished' : 'Updated')
    }
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    busy.value = false
    activeMode.value = null
  }
}

async function loadAlternatives() {
  if (locked.value || !props.modelValue.trim()) return
  try {
    const result = await aiApi.writingSuggest({
      text: props.modelValue,
      count: 3,
      surface: props.surface,
      projectId: resolvedProjectId.value,
    })
    alternatives.value = result.suggestions.filter((item) => item !== ghost.value).slice(0, 3)
    if (!sourceHint.value) sourceHint.value = aiSourceHint(result.source)
  } catch {
    // Ghost suggestion alone is enough.
  }
}

function scheduleAutoSuggest() {
  if (!props.autoSuggest || locked.value) return
  if (suggestTimer) clearTimeout(suggestTimer)
  suggestTimer = setTimeout(() => {
    void autoSuggest()
  }, 1400)
}

async function autoSuggest() {
  if (locked.value || busy.value) return
  const text = props.modelValue
  if (text.trim().length < 24) {
    clearGhost()
    return
  }
  // Avoid suggesting mid-word when the caret likely continues typing.
  if (!/[\s.!?:,;\n)]$/.test(text)) return
  const seq = ++suggestSeq
  try {
    const result = await aiApi.writingSuggest({
      text,
      count: 3,
      surface: props.surface,
      projectId: resolvedProjectId.value,
    })
    if (seq !== suggestSeq) return
    if (!result.suggestions.length) return
    ghost.value = result.suggestions[0] ?? null
    alternatives.value = result.suggestions.slice(1)
    sourceHint.value = aiSourceHint(result.source)
  } catch {
    // Silent — typing assist is best-effort.
  }
}

watch(
  () => props.modelValue,
  () => {
    if (ghost.value) clearGhost()
    scheduleAutoSuggest()
  },
)

onBeforeUnmount(() => {
  if (suggestTimer) clearTimeout(suggestTimer)
})

defineExpose({
  run,
  acceptGhost,
  onKeydown(event: KeyboardEvent) {
    if (locked.value) return false
    if (event.key === 'Tab' && ghost.value && !event.shiftKey) {
      event.preventDefault()
      acceptGhost()
      return true
    }
    if ((event.ctrlKey || event.metaKey) && event.key === ' ') {
      event.preventDefault()
      void run('complete')
      return true
    }
    if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'g') {
      event.preventDefault()
      void run('grammar')
      return true
    }
    return false
  },
})
</script>

<template>
  <div v-if="!locked" class="space-y-1.5">
    <div class="flex flex-wrap items-center gap-1">
      <Button
        type="button"
        size="xs"
        variant="secondary"
        class="gap-1"
        :disabled="busy"
        :loading="busy && activeMode === 'complete'"
        title="Suggest next words when you want them (Ctrl+Space)"
        @click="run('complete')"
      >
        <Sparkles class="size-3.5 text-primary" /> Continue
      </Button>
      <Button
        type="button"
        size="xs"
        variant="ghost"
        :disabled="busy"
        :loading="busy && activeMode === 'grammar'"
        title="Fix grammar (Ctrl+Shift+G)"
        @click="run('grammar')"
      >
        Fix grammar
      </Button>
      <Button type="button" size="xs" variant="ghost" :disabled="busy" :loading="busy && activeMode === 'polish'" @click="run('polish')">
        Polish
      </Button>
      <DropdownMenu v-if="!compact">
        <DropdownMenuTrigger as-child>
          <Button type="button" size="xs" variant="ghost" :disabled="busy">More</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" class="w-52">
          <DropdownMenuLabel>Writing assist</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem v-for="action in ACTIONS.filter((row) => !['complete', 'grammar', 'polish'].includes(row.mode))" :key="action.mode" @select="run(action.mode)">
            <span class="flex flex-col gap-0.5">
              <span>{{ action.label }}</span>
              <span class="text-[11px] text-muted-foreground">{{ action.hint }}</span>
            </span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <span v-if="sourceHint && !ghost" class="ml-auto hidden text-[11px] text-muted-foreground sm:inline">{{ sourceHint }}</span>
    </div>

    <div
      v-if="ghost"
      class="flex flex-col gap-2 border border-primary/20 bg-primary/5 px-2.5 py-2 text-sm sm:flex-row sm:items-start"
      role="status"
    >
      <div class="min-w-0 flex-1">
        <p class="text-[11px] font-medium tracking-wide text-primary uppercase">Continue suggestion · Tab to accept</p>
        <p class="mt-0.5 text-[13px] leading-5 text-foreground/90">
          <span class="text-muted-foreground">…</span>{{ ghost }}
        </p>
        <div v-if="alternatives.length" class="mt-1.5 flex flex-wrap gap-1">
          <button
            v-for="(item, index) in alternatives"
            :key="index"
            type="button"
            class="max-w-full truncate rounded-md border border-border/70 bg-background px-2 py-0.5 text-[11px] text-muted-foreground hover:border-primary/40 hover:text-foreground"
            :title="item"
            @click="acceptGhost(item)"
          >
            Alt {{ index + 1 }}: {{ item.trim() }}
          </button>
        </div>
      </div>
      <div class="flex shrink-0 items-center gap-1">
        <Button type="button" size="xs" @click="acceptGhost()"><Check class="size-3.5" /> Accept</Button>
        <Button type="button" size="icon-sm" variant="ghost" aria-label="Dismiss suggestion" @click="clearGhost"><X /></Button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useDebounceFn } from '@vueuse/core'
import { Bot, Hash, SendHorizontal, Slash } from 'lucide-vue-next'
import { computed, nextTick, ref } from 'vue'
import IssueTypeIcon from '@/components/common/IssueTypeIcon.vue'
import UserAvatar from '@/components/common/UserAvatar.vue'
import { Button } from '@/components/ui/button'
import { issuesApi } from '@/modules/issues/api/issues.api'
import type { Issue, UserSummary } from '@/types/models'
import type { AssistantCommand } from '../chat.api'

const props = defineProps<{ projectId: string; members: UserSummary[]; commands: AssistantCommand[]; disabled?: boolean }>()
const emit = defineEmits<{ submit: [body: string] }>()

const ASSISTANT_HANDLE = 'Vector'

type Suggestion =
  | { kind: 'assistant'; id: string; label: string }
  | { kind: 'member'; id: string; label: string; member: UserSummary }
  | { kind: 'issue'; id: string; label: string; issue: Issue }
  | { kind: 'command'; id: string; label: string; command: AssistantCommand }

const text = ref('')
const mentions = ref<UserSummary[]>([])
const trigger = ref<{ char: '@' | '#' | '/'; term: string; start: number } | null>(null)
const issueResults = ref<Issue[]>([])
const highlighted = ref(0)
const textarea = ref<HTMLTextAreaElement | null>(null)

const searchIssues = useDebounceFn(async (term: string) => {
  try {
    const { issues } = await issuesApi.list({ projectId: props.projectId, q: term || undefined, sort: 'updatedAt', order: 'desc', limit: 6 })
    if (trigger.value?.char === '#' && trigger.value.term === term) issueResults.value = issues
  } catch {
    issueResults.value = []
  }
}, 180)

const suggestions = computed<Suggestion[]>(() => {
  const active = trigger.value
  if (!active) return []
  const term = active.term.toLowerCase()
  if (active.char === '/') {
    return props.commands.filter((command) => command.name.startsWith(term)).map((command) => ({ kind: 'command', id: command.name, label: command.usage, command }))
  }
  if (active.char === '#') return issueResults.value.map((issue) => ({ kind: 'issue', id: issue.id, label: issue.key, issue }))
  const people: Suggestion[] = props.members
    .filter((member) => member.name.toLowerCase().includes(term) || member.email.toLowerCase().startsWith(term))
    .slice(0, 6)
    .map((member) => ({ kind: 'member', id: member.id, label: member.name, member }))
  const assistant: Suggestion[] = 'vector assistant bot'.includes(term) || ASSISTANT_HANDLE.toLowerCase().startsWith(term) ? [{ kind: 'assistant', id: 'assistant', label: 'Vector Assistant' }] : []
  return [...assistant, ...people]
})

function detectTrigger() {
  const el = textarea.value
  if (!el) return
  const before = el.value.slice(0, el.selectionStart)
  const command = /^\/([a-z-]*)$/i.exec(before)
  const match = command ? null : /(?:^|\s)([@#])([\w.-]*)$/.exec(before)
  if (command) trigger.value = { char: '/', term: command[1]!, start: 0 }
  else if (match) trigger.value = { char: match[1] as '@' | '#', term: match[2]!, start: before.length - match[2]!.length - 1 }
  else trigger.value = null
  highlighted.value = 0
  if (trigger.value?.char === '#') void searchIssues(trigger.value.term)
}

function autosize() {
  const el = textarea.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${Math.min(el.scrollHeight, 180)}px`
}

async function replaceTrigger(insert: string) {
  const el = textarea.value
  const active = trigger.value
  if (!el || !active) return
  const caret = el.selectionStart
  const before = text.value.slice(0, active.start) + insert
  text.value = before + text.value.slice(caret)
  trigger.value = null
  await nextTick()
  el.focus()
  el.setSelectionRange(before.length, before.length)
  autosize()
}

function choose(suggestion: Suggestion) {
  if (suggestion.kind === 'assistant') return replaceTrigger(`@${ASSISTANT_HANDLE} `)
  if (suggestion.kind === 'issue') return replaceTrigger(`${suggestion.issue.key} `)
  if (suggestion.kind === 'command') return replaceTrigger(suggestion.command.name === 'status' ? '/status ' : `/${suggestion.command.name}`)
  if (!mentions.value.some((member) => member.id === suggestion.member.id)) mentions.value.push(suggestion.member)
  return replaceTrigger(`@${suggestion.member.name} `)
}

function onKeydown(event: KeyboardEvent) {
  if (suggestions.value.length) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const step = event.key === 'ArrowDown' ? 1 : -1
      highlighted.value = (highlighted.value + step + suggestions.value.length) % suggestions.value.length
      return
    }
    if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault()
      const picked = suggestions.value[highlighted.value]!
      const isComplete = picked.kind === 'command' && picked.command.name !== 'status' && picked.command.name === trigger.value?.term.toLowerCase()
      if (event.key === 'Enter' && isComplete) submit()
      else void choose(picked)
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      trigger.value = null
      return
    }
  }
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault()
    submit()
  }
}

function serialize() {
  return [...mentions.value]
    .sort((a, b) => b.name.length - a.name.length)
    .reduce((body, member) => body.split(`@${member.name}`).join(`@[${member.name}](${member.id})`), text.value.trim())
}

function submit() {
  if (!text.value.trim() || props.disabled) return
  emit('submit', serialize())
  text.value = ''
  mentions.value = []
  trigger.value = null
  void nextTick(autosize)
}

async function setText(value: string) {
  text.value = value
  await nextTick()
  textarea.value?.focus()
  textarea.value?.setSelectionRange(value.length, value.length)
  autosize()
  detectTrigger()
}

defineExpose({ setText, focus: () => textarea.value?.focus() })
</script>

<template>
  <div class="relative">
    <ul
      v-if="suggestions.length"
      class="absolute bottom-full left-0 z-20 mb-2 w-full max-w-md overflow-hidden border bg-popover p-1 shadow-elevated"
      role="listbox"
      :aria-label="trigger?.char === '/' ? 'Assistant commands' : trigger?.char === '#' ? 'Tasks' : 'People'"
    >
      <li v-for="(suggestion, index) in suggestions" :key="`${suggestion.kind}-${suggestion.id}`">
        <button
          type="button"
          role="option"
          class="flex w-full items-center gap-2.5 px-2.5 py-2 text-left text-sm"
          :class="index === highlighted && 'bg-accent text-accent-foreground'"
          :aria-selected="index === highlighted"
          @mouseenter="highlighted = index"
          @mousedown.prevent="choose(suggestion)"
        >
          <template v-if="suggestion.kind === 'assistant'">
            <span class="flex size-5 items-center justify-center bg-brand text-white"><Bot class="size-3.5" /></span>
            <span class="font-medium">Vector Assistant</span>
            <span class="ml-auto text-xs text-muted-foreground">Ask a question</span>
          </template>
          <template v-else-if="suggestion.kind === 'member'">
            <UserAvatar :user="suggestion.member" size="xs" />
            <span class="truncate">{{ suggestion.member.name }}</span>
            <span class="ml-auto truncate text-xs text-muted-foreground">{{ suggestion.member.title }}</span>
          </template>
          <template v-else-if="suggestion.kind === 'issue'">
            <IssueTypeIcon :type="suggestion.issue.type" />
            <span class="shrink-0 font-mono text-xs text-muted-foreground">{{ suggestion.issue.key }}</span>
            <span class="truncate">{{ suggestion.issue.title }}</span>
          </template>
          <template v-else>
            <span class="font-mono text-xs font-semibold text-primary">{{ suggestion.command.usage }}</span>
            <span class="truncate text-xs text-muted-foreground">{{ suggestion.command.description }}</span>
          </template>
        </button>
      </li>
    </ul>
    <p v-else-if="trigger?.char === '#'" class="absolute bottom-full left-0 mb-2 border bg-popover px-3 py-2 text-xs text-muted-foreground shadow-elevated">
      {{ trigger.term ? 'No matching tasks' : 'Searching tasks…' }}
    </p>

    <div class="flex items-end gap-2 border bg-card p-2 shadow-soft focus-within:border-primary/50 focus-within:ring-4 focus-within:ring-ring/15">
      <textarea
        ref="textarea"
        v-model="text"
        rows="1"
        class="max-h-44 min-h-9 flex-1 resize-none bg-transparent px-1.5 py-2 text-sm outline-none placeholder:text-muted-foreground"
        placeholder="Message the team… mention a task like VEC-12, @someone, or type / for the assistant"
        aria-label="Message"
        :disabled="disabled"
        @input="
          detectTrigger();
          autosize()
        "
        @click="detectTrigger"
        @keydown="onKeydown"
      />
      <Button size="icon" :disabled="!text.trim() || disabled" aria-label="Send message" @click="submit"><SendHorizontal /></Button>
    </div>
    <p class="mt-1.5 hidden flex-wrap items-center gap-x-3 gap-y-1 px-1 text-[11px] text-muted-foreground sm:flex">
      <span><kbd class="font-sans font-semibold">Enter</kbd> to send · <kbd class="font-sans font-semibold">Shift + Enter</kbd> for a new line</span>
      <span class="inline-flex items-center gap-1"><span class="font-semibold">@</span> mention</span>
      <span class="inline-flex items-center gap-1"><Hash class="size-3" /> link a task</span>
      <span class="inline-flex items-center gap-1"><Slash class="size-3" /> assistant commands</span>
    </p>
  </div>
</template>

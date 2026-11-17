<script setup lang="ts">
import { useDebounceFn } from '@vueuse/core'
import { Bot, FileText, Hash, LoaderCircle, Paperclip, SendHorizontal, Slash, X } from 'lucide-vue-next'
import { computed, nextTick, ref } from 'vue'
import { toast } from 'vue-sonner'
import IssueTypeIcon from '@/components/common/IssueTypeIcon.vue'
import UserAvatar from '@/components/common/UserAvatar.vue'
import { Button } from '@/components/ui/button'
import { getErrorMessage } from '@/lib/http'
import { toPlainText } from '@/lib/markdown'
import { formatBytes } from '@/lib/utils'
import { issuesApi } from '@/modules/issues/api/issues.api'
import type { Issue, UserSummary } from '@/types/models'
import { type AssistantCommand, type ChatFile, chatApi } from '../chat.api'

export type ChatComposerReplyTo = { id: string; authorName: string; snippet: string }

const props = defineProps<{
  projectId: string
  members: UserSummary[]
  commands: AssistantCommand[]
  disabled?: boolean
  replyTo?: ChatComposerReplyTo | null
}>()
const emit = defineEmits<{
  submit: [payload: { body: string; fileIds: string[] }]
  cancelReply: []
}>()

const ASSISTANT_HANDLE = 'Vector'
const MAX_FILES = 10

type Suggestion =
  | { kind: 'assistant'; id: string; label: string }
  | { kind: 'member'; id: string; label: string; member: UserSummary }
  | { kind: 'issue'; id: string; label: string; issue: Issue }
  | { kind: 'command'; id: string; label: string; command: AssistantCommand }

interface PendingFile {
  key: string
  name: string
  size: number
  progress: number
  uploaded: ChatFile | null
}

const text = ref('')
const mentions = ref<UserSummary[]>([])
const trigger = ref<{ char: '@' | '#' | '/'; term: string; start: number } | null>(null)
const issueResults = ref<Issue[]>([])
const highlighted = ref(0)
const textarea = ref<HTMLTextAreaElement | null>(null)
const filePicker = ref<HTMLInputElement | null>(null)
const pending = ref<PendingFile[]>([])
const isDragging = ref(false)

const isUploading = computed(() => pending.value.some((item) => !item.uploaded))
const canSend = computed(() => (Boolean(text.value.trim()) || pending.value.some((item) => item.uploaded)) && !isUploading.value && !props.disabled)

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
  if (event.key === 'Escape' && props.replyTo) {
    event.preventDefault()
    emit('cancelReply')
    return
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
  if (!canSend.value) return
  emit('submit', {
    body: serialize(),
    fileIds: pending.value.flatMap((item) => (item.uploaded ? [item.uploaded.id] : [])),
  })
  text.value = ''
  mentions.value = []
  trigger.value = null
  pending.value = []
  void nextTick(autosize)
}

async function addFiles(list: FileList | File[] | null | undefined) {
  if (!list) return
  const files = [...list].slice(0, MAX_FILES - pending.value.length)
  if (list.length > files.length) toast.info(`Up to ${MAX_FILES} files at a time`)
  for (const file of files) {
    const item: PendingFile = { key: crypto.randomUUID(), name: file.name, size: file.size, progress: 0, uploaded: null }
    pending.value = [...pending.value, item]
    chatApi
      .upload(props.projectId, file, (percent) => (pending.value = pending.value.map((entry) => (entry.key === item.key ? { ...entry, progress: percent } : entry))))
      .then((uploaded) => (pending.value = pending.value.map((entry) => (entry.key === item.key ? { ...entry, uploaded, progress: 100 } : entry))))
      .catch((error) => {
        pending.value = pending.value.filter((entry) => entry.key !== item.key)
        toast.error(`${file.name}: ${getErrorMessage(error)}`)
      })
  }
}

const removeFile = (key: string) => (pending.value = pending.value.filter((entry) => entry.key !== key))

function onPaste(event: ClipboardEvent) {
  const files = event.clipboardData?.files
  if (!files?.length) return
  event.preventDefault()
  void addFiles(files)
}

function onDrop(event: DragEvent) {
  isDragging.value = false
  void addFiles(event.dataTransfer?.files)
}

async function setText(value: string) {
  // Show readable @Name in the box, never raw @[Name](id) tokens.
  text.value = toPlainText(value, 2000)
  await nextTick()
  textarea.value?.focus()
  const caret = text.value.length
  textarea.value?.setSelectionRange(caret, caret)
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

    <div
      v-if="replyTo"
      class="mb-2 flex items-start gap-2 rounded-lg border border-primary/25 bg-primary/5 px-3 py-2 text-xs"
      role="status"
    >
      <div class="min-w-0 flex-1">
        <p class="font-medium text-primary">Replying to {{ replyTo.authorName }}</p>
        <p class="mt-0.5 line-clamp-2 text-muted-foreground">{{ replyTo.snippet }}</p>
      </div>
      <button type="button" class="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Cancel reply" @click="emit('cancelReply')">
        <X class="size-3.5" />
      </button>
    </div>

    <div
      class="border bg-card shadow-soft focus-within:border-primary/50 focus-within:ring-4 focus-within:ring-ring/15"
      :class="isDragging && 'border-primary ring-4 ring-primary/20'"
      @dragover.prevent="isDragging = true"
      @dragleave.self="isDragging = false"
      @drop.prevent="onDrop"
    >
      <div class="flex items-end gap-2 p-2">
        <button
          type="button"
          class="mb-1 flex size-8 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
          aria-label="Attach files"
          title="Attach files (or paste / drop them)"
          :disabled="disabled || pending.length >= MAX_FILES"
          @click="filePicker?.click()"
        >
          <Paperclip class="size-4" />
        </button>
        <input
          ref="filePicker"
          type="file"
          multiple
          class="hidden"
          @change="
            addFiles(($event.target as HTMLInputElement).files);
            ($event.target as HTMLInputElement).value = ''
          "
        />
        <textarea
          ref="textarea"
          v-model="text"
          rows="1"
          class="max-h-44 min-h-9 flex-1 resize-none bg-transparent px-1.5 py-2 text-sm outline-none placeholder:text-muted-foreground"
          :placeholder="isDragging ? 'Drop files to share them' : replyTo ? 'Write a reply…' : 'Message the team… mention a task like VEC-12, @someone, or type / for the assistant'"
          aria-label="Message"
          :disabled="disabled"
          @input="
            detectTrigger();
            autosize()
          "
          @click="detectTrigger"
          @keydown="onKeydown"
          @paste="onPaste"
        />
        <Button size="icon" :disabled="!canSend" aria-label="Send message" @click="submit"><SendHorizontal /></Button>
      </div>
      <div v-if="pending.length" class="flex flex-wrap gap-1.5 px-2 pb-2">
        <span v-for="item in pending" :key="item.key" class="relative flex max-w-56 items-center gap-2 overflow-hidden border border-border bg-muted/40 py-1.5 pr-1.5 pl-2 text-xs">
          <LoaderCircle v-if="!item.uploaded" class="size-4 shrink-0 animate-spin text-muted-foreground" />
          <FileText v-else class="size-4 shrink-0 text-primary" />
          <span class="min-w-0 flex-1">
            <span class="block truncate font-medium">{{ item.name }}</span>
            <span class="block text-[10.5px] text-muted-foreground">{{ item.uploaded ? formatBytes(item.size) : `${item.progress}%` }}</span>
          </span>
          <button type="button" class="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground" :aria-label="`Remove ${item.name}`" @click="removeFile(item.key)">
            <X class="size-3.5" />
          </button>
          <span v-if="!item.uploaded" class="absolute bottom-0 left-0 h-0.5 bg-primary transition-all" :style="{ width: `${item.progress}%` }" />
        </span>
      </div>
    </div>
    <p class="mt-1.5 hidden flex-wrap items-center gap-x-3 gap-y-1 px-1 text-[11px] text-muted-foreground sm:flex">
      <span><kbd class="font-sans font-semibold">Enter</kbd> to send · <kbd class="font-sans font-semibold">Shift + Enter</kbd> for a new line</span>
      <span class="inline-flex items-center gap-1"><span class="font-semibold">@</span> mention</span>
      <span class="inline-flex items-center gap-1"><Hash class="size-3" /> link a task</span>
      <span class="inline-flex items-center gap-1"><Slash class="size-3" /> assistant commands</span>
      <span class="inline-flex items-center gap-1"><Paperclip class="size-3" /> attach</span>
    </p>
  </div>
</template>

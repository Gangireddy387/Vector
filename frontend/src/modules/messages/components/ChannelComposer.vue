<script setup lang="ts">
import { AtSign, Bold, CircleAlert, Code, FileText, Heading, Italic, List, LoaderCircle, Paperclip, SendHorizontal, UsersRound, X } from 'lucide-vue-next'
import { computed, nextTick, ref, useTemplateRef } from 'vue'
import { toast } from 'vue-sonner'
import EmojiStickerPicker from '@/components/common/EmojiStickerPicker.vue'
import UserAvatar from '@/components/common/UserAvatar.vue'
import { getErrorMessage } from '@/lib/http'
import { formatBytes } from '@/lib/utils'
import type { UserSummary } from '@/types/models'
import { type ComposerExtras, type ConversationFile, EVERYONE_ID, messagesApi } from '../messages.api'

const MENTION_TOKEN = /@\[([^\]]+)\]\(([0-9a-f-]{36})\)/gi
const MAX_FILES = 10

/**
 * The box for a new post, a reply or an edit in a channel, like Teams: markdown formatting, emoji, @mentions of the
 * people in the conversation (or @everyone), files (button, paste or drop) and, for new posts, a subject and an
 * "Important" mark. `send` resolves to true once posted, which clears the box. `typing` fires every few seconds
 * while someone writes.
 */
const props = withDefaults(
  defineProps<{
    placeholder: string
    send: (body: string, extras: ComposerExtras) => Promise<boolean>
    people?: UserSummary[]
    initial?: string
    initialSubject?: string | null
    /** Posts: a subject. */
    allowSubject?: boolean
    /** New posts: the "Important" mark. */
    allowImportant?: boolean
    /** Uploads go to this conversation; without it the box shares no files. */
    conversationId?: string | null
    allowEveryone?: boolean
    compact?: boolean
  }>(),
  { people: () => [], initial: '', initialSubject: null, allowSubject: false, allowImportant: false, conversationId: null, allowEveryone: false, compact: false },
)
const emit = defineEmits<{ cancel: []; typing: [] }>()

/** People already mentioned in the text being edited, so their `@Name` turns back into a mention. */
const mentions = ref<Array<{ id: string; name: string }>>([])
const draft = ref(
  props.initial.replace(MENTION_TOKEN, (_match, name: string, id: string) => {
    if (!mentions.value.some((person) => person.id === id)) mentions.value.push({ id, name })
    return `@${name}`
  }),
)
const subject = ref(props.initialSubject ?? '')
const showSubject = ref(Boolean(props.initialSubject))
const important = ref(false)
const isSending = ref(false)
const isDragging = ref(false)
const input = useTemplateRef<HTMLTextAreaElement>('input')
const subjectInput = useTemplateRef<HTMLInputElement>('subjectInput')
const filePicker = useTemplateRef<HTMLInputElement>('filePicker')

// --- Typing ------------------------------------------------------------------
let typingSentAt = 0
function signalTyping() {
  if (!draft.value.trim() || Date.now() - typingSentAt < 3000) return
  typingSentAt = Date.now()
  emit('typing')
}

// --- @mentions ---------------------------------------------------------------
type Suggestion = { id: string; name: string; person: UserSummary | null }
const trigger = ref<{ term: string; start: number } | null>(null)
const highlighted = ref(0)
const suggestions = computed<Suggestion[]>(() => {
  if (!trigger.value) return []
  const term = trigger.value.term.toLowerCase()
  const everyone: Suggestion[] = props.allowEveryone && ('everyone'.startsWith(term) || 'channel'.startsWith(term) || 'team'.startsWith(term)) ? [{ id: EVERYONE_ID, name: 'everyone', person: null }] : []
  const people = props.people
    .filter((person) => person.name.toLowerCase().includes(term) || person.email.toLowerCase().startsWith(term))
    .slice(0, 6)
    .map((person) => ({ id: person.id, name: person.name, person }))
  return [...everyone, ...people]
})

function detectTrigger() {
  const element = input.value
  if (!element) return
  const match = /(?:^|\s)@([\w.-]*)$/.exec(element.value.slice(0, element.selectionStart))
  trigger.value = match ? { term: match[1]!, start: element.selectionStart - match[1]!.length - 1 } : null
  highlighted.value = 0
}

async function insertAtCaret(text: string, { replaceFrom }: { replaceFrom?: number } = {}) {
  const element = input.value
  if (!element) return
  const start = replaceFrom ?? element.selectionStart
  const before = `${draft.value.slice(0, start)}${text}`
  draft.value = before + draft.value.slice(element.selectionEnd)
  await nextTick()
  element.focus()
  element.setSelectionRange(before.length, before.length)
  autosize()
}

/** Stickers always send as their own card message (never mixed into typed text). */
async function onSticker(token: string) {
  if (isSending.value || isUploading.value) return
  isSending.value = true
  try {
    await props.send(token, { subject: null, important: false, fileIds: [] })
  } finally {
    isSending.value = false
    input.value?.focus()
  }
}

async function choose(suggestion: Suggestion) {
  const active = trigger.value
  if (!active) return
  if (!mentions.value.some((item) => item.id === suggestion.id)) mentions.value.push({ id: suggestion.id, name: suggestion.name })
  trigger.value = null
  await insertAtCaret(`@${suggestion.name} `, { replaceFrom: active.start })
}

async function startMention() {
  const element = input.value
  if (!element) return
  const needsSpace = element.selectionStart > 0 && !/\s/.test(draft.value[element.selectionStart - 1] ?? '')
  await insertAtCaret(`${needsSpace ? ' ' : ''}@`)
  detectTrigger()
}

/** `@Name` back to `@[Name](id)` for everyone picked from the list (longest names first, so "Ann Lee" wins over "Ann"). */
const serialize = (text: string) =>
  [...mentions.value].sort((a, b) => b.name.length - a.name.length).reduce((body, person) => body.split(`@${person.name}`).join(`@[${person.name}](${person.id})`), text)

// --- Formatting --------------------------------------------------------------
async function wrap(before: string, after = before) {
  const element = input.value
  if (!element) return
  const { selectionStart: start, selectionEnd: end } = element
  const selected = draft.value.slice(start, end) || 'text'
  draft.value = `${draft.value.slice(0, start)}${before}${selected}${after}${draft.value.slice(end)}`
  await nextTick()
  element.focus()
  element.setSelectionRange(start + before.length, start + before.length + selected.length)
  autosize()
}
async function prefixLines(prefix: string) {
  const element = input.value
  if (!element) return
  const start = draft.value.lastIndexOf('\n', element.selectionStart - 1) + 1
  const end = element.selectionEnd
  const changed = draft.value
    .slice(start, end)
    .split('\n')
    .map((line) => (line.startsWith(prefix) ? line : `${prefix}${line}`))
    .join('\n')
  draft.value = `${draft.value.slice(0, start)}${changed}${draft.value.slice(end)}`
  await nextTick()
  element.focus()
  element.setSelectionRange(start + changed.length, start + changed.length)
  autosize()
}
const FORMATS = [
  { label: 'Bold (Ctrl+B)', icon: Bold, run: () => wrap('**') },
  { label: 'Italic (Ctrl+I)', icon: Italic, run: () => wrap('_') },
  { label: 'Heading', icon: Heading, run: () => prefixLines('### ') },
  { label: 'Bulleted list', icon: List, run: () => prefixLines('- ') },
  { label: 'Code', icon: Code, run: () => wrap('`') },
]

// --- Files -------------------------------------------------------------------
interface PendingFile {
  key: string
  name: string
  size: number
  progress: number
  uploaded: ConversationFile | null
}
const pending = ref<PendingFile[]>([])
const isUploading = computed(() => pending.value.some((item) => !item.uploaded))
const canAttach = computed(() => Boolean(props.conversationId))

async function addFiles(list: FileList | File[] | null | undefined) {
  if (!list || !props.conversationId) return
  const files = [...list].slice(0, MAX_FILES - pending.value.length)
  if (list.length > files.length) toast.info(`Up to ${MAX_FILES} files at a time`)
  for (const file of files) {
    const item: PendingFile = { key: crypto.randomUUID(), name: file.name, size: file.size, progress: 0, uploaded: null }
    pending.value = [...pending.value, item]
    messagesApi
      .upload(props.conversationId, file, (percent) => (pending.value = pending.value.map((entry) => (entry.key === item.key ? { ...entry, progress: percent } : entry))))
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
  if (!canAttach.value || !files?.length) return
  event.preventDefault()
  void addFiles(files)
}
function onDrop(event: DragEvent) {
  isDragging.value = false
  if (!canAttach.value) return
  void addFiles(event.dataTransfer?.files)
}

// --- Sending -----------------------------------------------------------------
function autosize() {
  const element = input.value
  if (!element) return
  element.style.height = 'auto'
  element.style.height = `${element.scrollHeight}px`
}

const canSend = computed(() => (draft.value.trim().length > 0 || pending.value.length > 0) && !isUploading.value && !isSending.value)

async function submit() {
  if (!canSend.value) return
  isSending.value = true
  try {
    const extras: ComposerExtras = {
      subject: props.allowSubject && showSubject.value ? subject.value.trim() || null : null,
      important: props.allowImportant && important.value,
      fileIds: pending.value.flatMap((item) => (item.uploaded ? [item.uploaded.id] : [])),
    }
    if (await props.send(serialize(draft.value.trim()), extras)) {
      draft.value = ''
      subject.value = ''
      showSubject.value = false
      important.value = false
      pending.value = []
      mentions.value = []
      typingSentAt = 0
      await nextTick()
      autosize()
    }
  } finally {
    isSending.value = false
    input.value?.focus()
  }
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
      void choose(suggestions.value[highlighted.value]!)
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
    void submit()
  } else if (event.key === 'Escape') {
    event.preventDefault()
    emit('cancel')
  } else if ((event.ctrlKey || event.metaKey) && (event.key === 'b' || event.key === 'i')) {
    event.preventDefault()
    void wrap(event.key === 'b' ? '**' : '_')
  }
}

async function toggleSubject() {
  showSubject.value = !showSubject.value
  await nextTick()
  if (showSubject.value) subjectInput.value?.focus()
  else input.value?.focus()
}

const toolButton = 'flex size-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground'

defineExpose({
  focus: () => {
    input.value?.focus()
    autosize()
  },
})
</script>

<template>
  <form class="relative" @submit.prevent="submit">
    <ul
      v-if="suggestions.length"
      class="absolute bottom-full left-0 z-20 mb-2 w-full max-w-sm overflow-hidden rounded-lg border bg-popover p-1 shadow-elevated"
      role="listbox"
      aria-label="People"
    >
      <li v-for="(suggestion, index) in suggestions" :key="suggestion.id">
        <button
          type="button"
          role="option"
          class="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm"
          :class="index === highlighted && 'bg-accent text-accent-foreground'"
          :aria-selected="index === highlighted"
          @mouseenter="highlighted = index"
          @mousedown.prevent="choose(suggestion)"
        >
          <template v-if="suggestion.person">
            <UserAvatar :user="suggestion.person" size="xs" />
            <span class="truncate">{{ suggestion.name }}</span>
            <span class="ml-auto truncate text-xs text-muted-foreground">{{ suggestion.person.title }}</span>
          </template>
          <template v-else>
            <span class="flex size-5 items-center justify-center rounded-full bg-primary/15 text-primary"><UsersRound class="size-3" /></span>
            <span class="font-medium">everyone</span>
            <span class="ml-auto text-xs text-muted-foreground">Notify everyone here</span>
          </template>
        </button>
      </li>
    </ul>

    <div
      class="flex flex-col rounded-lg border bg-card shadow-soft transition-colors focus-within:border-ring/60 focus-within:ring-[3px] focus-within:ring-ring/15"
      :class="[isDragging ? 'border-primary ring-[3px] ring-primary/20' : 'border-border', important && 'border-l-[3px] border-l-red-500']"
      @dragover.prevent="canAttach && (isDragging = true)"
      @dragleave.self="isDragging = false"
      @drop.prevent="onDrop"
    >
      <p v-if="important" class="flex items-center gap-1 px-3 pt-2 text-[11px] font-bold tracking-wide text-red-600 uppercase dark:text-red-400">
        <CircleAlert class="size-3.5" /> Important!
      </p>
      <div v-if="allowSubject && showSubject" class="flex items-center gap-2 border-b border-border/70 px-3">
        <input
          ref="subjectInput"
          v-model="subject"
          maxlength="150"
          class="h-10 min-w-0 flex-1 bg-transparent text-[15px] font-semibold outline-none placeholder:font-medium placeholder:text-muted-foreground"
          placeholder="Add a subject"
          aria-label="Subject"
          @keydown.enter.prevent="input?.focus()"
        />
        <button type="button" class="text-muted-foreground hover:text-foreground" aria-label="Remove the subject" title="Remove the subject" @click="toggleSubject">
          <X class="size-4" />
        </button>
      </div>
      <textarea
        ref="input"
        v-model="draft"
        rows="1"
        maxlength="4000"
        class="max-h-48 w-full resize-none bg-transparent px-3 text-[14px] leading-5 text-foreground outline-none placeholder:text-muted-foreground"
        :class="compact ? 'py-2' : 'min-h-11 py-3'"
        :placeholder="isDragging ? 'Drop files to share them' : placeholder"
        :aria-label="placeholder"
        @input="
          detectTrigger();
          autosize();
          signalTyping()
        "
        @click="detectTrigger"
        @keydown="onKeydown"
        @paste="onPaste"
      />

      <div v-if="pending.length" class="flex flex-wrap gap-1.5 px-3 pb-2">
        <span v-for="item in pending" :key="item.key" class="relative flex max-w-56 items-center gap-2 overflow-hidden rounded-md border border-border bg-muted/40 py-1.5 pr-1.5 pl-2 text-xs">
          <LoaderCircle v-if="!item.uploaded" class="size-4 shrink-0 animate-spin text-muted-foreground" />
          <FileText v-else class="size-4 shrink-0 text-primary" />
          <span class="min-w-0 flex-1">
            <span class="block truncate font-medium">{{ item.name }}</span>
            <span class="block text-[10.5px] text-muted-foreground">{{ item.uploaded ? formatBytes(item.size) : `${item.progress}%` }}</span>
          </span>
          <button type="button" class="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground" :aria-label="`Remove ${item.name}`" @click="removeFile(item.key)"><X class="size-3.5" /></button>
          <span v-if="!item.uploaded" class="absolute bottom-0 left-0 h-0.5 bg-primary transition-all" :style="{ width: `${item.progress}%` }" />
        </span>
      </div>

      <!-- One toolbar row: tools + subject + send, so the box fills width on phone -->
      <div class="flex items-center gap-1 border-t border-border/60 px-1.5 py-1.5">
        <div class="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto scrollbar-none">
          <template v-if="!compact">
            <button v-for="format in FORMATS" :key="format.label" type="button" :class="toolButton" :aria-label="format.label" :title="format.label" @click="format.run()">
              <component :is="format.icon" class="size-4" />
            </button>
            <span class="mx-0.5 h-4 w-px shrink-0 bg-border" />
          </template>
          <EmojiStickerPicker @emoji="insertAtCaret" @sticker="onSticker" />
          <button v-if="people.length || allowEveryone" type="button" :class="toolButton" aria-label="Mention someone" title="Mention someone" @click="startMention"><AtSign class="size-4" /></button>
          <template v-if="canAttach">
            <button type="button" :class="toolButton" aria-label="Attach files" title="Attach files (or paste / drop them)" @click="filePicker?.click()"><Paperclip class="size-4" /></button>
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
          </template>
          <button
            v-if="allowImportant"
            type="button"
            :class="[toolButton, important && 'bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-600 dark:bg-red-500/15 dark:text-red-400']"
            :aria-pressed="important"
            aria-label="Mark as important"
            title="Mark as important"
            @click="important = !important"
          >
            <CircleAlert class="size-4" />
          </button>
          <button
            v-if="allowSubject && !showSubject"
            type="button"
            class="ml-0.5 shrink-0 rounded px-2 py-1 text-xs font-medium whitespace-nowrap text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            @click="toggleSubject"
          >
            Add a subject
          </button>
        </div>
        <button
          type="submit"
          class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-95 disabled:opacity-50 sm:size-10"
          :disabled="!canSend"
          :aria-label="isUploading ? 'Waiting for files to upload' : 'Send'"
          :title="isUploading ? 'Waiting for files to upload' : 'Send'"
        >
          <SendHorizontal class="size-4 sm:size-[18px]" :class="isSending && 'animate-pulse'" />
        </button>
      </div>
    </div>
  </form>
</template>

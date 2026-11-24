<script setup lang="ts">
import { Paperclip, X } from 'lucide-vue-next'
import { computed, nextTick, ref } from 'vue'
import UserAvatar from '@/components/common/UserAvatar.vue'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { formatBytes } from '@/lib/utils'
import { useAuthStore } from '@/modules/auth/auth.store'
import WritingAssistBar from '@/modules/ai/components/WritingAssistBar.vue'
import type { UserSummary } from '@/types/models'

const auth = useAuthStore()
const canUseAi = computed(() => auth.hasFeature('aiAssistant'))

const props = withDefaults(
  defineProps<{
    members: UserSummary[]
    initialValue?: string
    submitLabel?: string
    placeholder?: string
    autofocus?: boolean
    /** Show Cancel even when not editing an existing comment (e.g. reply composer). */
    cancellable?: boolean
    /** Allow attaching files (issue comments / replies). */
    allowFiles?: boolean
  }>(),
  {
    initialValue: '',
    submitLabel: 'Comment',
    placeholder: 'Add a comment… type @ to mention someone',
    autofocus: false,
    cancellable: false,
    allowFiles: true,
  },
)
const emit = defineEmits<{ submit: [body: string, files: File[]]; cancel: [] }>()

const MENTION_TOKEN = /@\[([^\]]+)\]\(([0-9a-f-]{36})\)/gi

/** Mentions are shown as "@Name" while typing and converted to "@[Name](id)" tokens on submit. */
const mentions = ref<UserSummary[]>([])
const text = ref(
  props.initialValue.replace(MENTION_TOKEN, (_match, name: string, id: string) => {
    const member = props.members.find((item) => item.id === id)
    if (member) mentions.value.push(member)
    return `@${name}`
  }),
)
const query = ref<string | null>(null)
const highlighted = ref(0)
const isSubmitting = ref(false)
const textareaRef = ref<InstanceType<typeof Textarea> | null>(null)
const assistRef = ref<InstanceType<typeof WritingAssistBar> | null>(null)
const pendingFiles = ref<File[]>([])
const fileInput = ref<HTMLInputElement | null>(null)
const element = () => textareaRef.value?.$el as HTMLTextAreaElement | undefined

function onPickFiles(event: Event) {
  const input = event.target as HTMLInputElement
  pendingFiles.value = [...pendingFiles.value, ...(input.files ?? [])].slice(0, 10)
  input.value = ''
}

function removeFile(index: number) {
  pendingFiles.value = pendingFiles.value.filter((_, i) => i !== index)
}

const suggestions = computed(() => {
  if (query.value === null) return []
  const term = query.value.toLowerCase()
  return props.members.filter((member) => member.name.toLowerCase().includes(term) || member.email.toLowerCase().startsWith(term)).slice(0, 6)
})

function detectMention() {
  const el = element()
  if (!el) return
  const beforeCaret = el.value.slice(0, el.selectionStart)
  const match = /(?:^|\s)@([\w.-]*)$/.exec(beforeCaret)
  query.value = match ? match[1]! : null
  highlighted.value = 0
}

async function insertMention(member: UserSummary) {
  const el = element()
  if (!el) return
  const caret = el.selectionStart
  const before = text.value.slice(0, caret).replace(/@([\w.-]*)$/, `@${member.name} `)
  text.value = before + text.value.slice(caret)
  if (!mentions.value.some((item) => item.id === member.id)) mentions.value.push(member)
  query.value = null
  await nextTick()
  el.focus()
  el.setSelectionRange(before.length, before.length)
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
      void insertMention(suggestions.value[highlighted.value]!)
      return
    }
    if (event.key === 'Escape') {
      query.value = null
      return
    }
  }
  if (assistRef.value?.onKeydown(event)) return
  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
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
  if (!text.value.trim() && !pendingFiles.value.length) return
  isSubmitting.value = true
  emit('submit', serialize(), [...pendingFiles.value])
}

function reset() {
  text.value = ''
  mentions.value = []
  pendingFiles.value = []
  isSubmitting.value = false
}

defineExpose({ reset, done: () => (isSubmitting.value = false) })
</script>

<template>
  <div class="relative overflow-hidden rounded-xl border border-border/70 bg-card shadow-soft">
    <div v-if="canUseAi" class="border-b border-border/60 px-3 py-2 sm:px-3.5">
      <WritingAssistBar ref="assistRef" v-model="text" surface="comment" compact :auto-suggest="false" />
    </div>

    <Textarea
      ref="textareaRef"
      v-model="text"
      rows="3"
      :placeholder="placeholder"
      :autofocus="autofocus"
      aria-label="Comment"
      class="min-h-[5rem] resize-y rounded-none border-0 bg-transparent px-3 py-3 shadow-none focus-visible:ring-0 sm:px-3.5"
      @input="detectMention"
      @click="detectMention"
      @keydown="onKeydown"
    />

    <ul
      v-if="suggestions.length"
      class="absolute top-[calc(100%-0.25rem)] left-0 z-20 mt-1 w-[min(16rem,calc(100%-0.5rem))] overflow-hidden rounded-lg border border-border/70 bg-popover p-1 shadow-md"
      role="listbox"
    >
      <li v-for="(member, index) in suggestions" :key="member.id">
        <button
          type="button"
          class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm"
          :class="index === highlighted && 'bg-accent text-accent-foreground'"
          role="option"
          :aria-selected="index === highlighted"
          @mousedown.prevent="insertMention(member)"
        >
          <UserAvatar :user="member" size="xs" /> {{ member.name }}
        </button>
      </li>
    </ul>

    <ul v-if="pendingFiles.length" class="flex flex-wrap gap-1.5 border-t border-border/60 px-3 py-2.5 sm:px-3.5">
      <li
        v-for="(file, index) in pendingFiles"
        :key="`${file.name}-${index}`"
        class="inline-flex max-w-full items-center gap-1.5 rounded-md border border-border/70 bg-muted/40 px-2 py-1 text-xs"
      >
        <span class="truncate" :title="file.name">{{ file.name }}</span>
        <span class="shrink-0 text-muted-foreground">{{ formatBytes(file.size) }}</span>
        <button type="button" class="text-muted-foreground hover:text-destructive" :aria-label="`Remove ${file.name}`" @click="removeFile(index)">
          <X class="size-3.5" />
        </button>
      </li>
    </ul>

    <div class="flex flex-wrap items-center gap-2 border-t border-border/60 px-3 py-2.5 sm:px-3.5">
      <Button size="sm" :disabled="!text.trim() && !pendingFiles.length" :loading="isSubmitting" @click="submit">{{ submitLabel }}</Button>
      <Button v-if="initialValue || cancellable" size="sm" variant="ghost" @click="emit('cancel')">Cancel</Button>
      <template v-if="allowFiles">
        <Button type="button" size="icon-sm" variant="ghost" title="Attach files" aria-label="Attach files" @click="fileInput?.click()">
          <Paperclip />
        </Button>
        <input ref="fileInput" type="file" multiple class="hidden" @change="onPickFiles" />
      </template>
      <span class="ml-auto hidden text-[11px] text-muted-foreground sm:inline">Ctrl + Enter to send</span>
    </div>
  </div>
</template>

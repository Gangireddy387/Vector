<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import UserAvatar from '@/components/common/UserAvatar.vue'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import type { UserSummary } from '@/types/models'

const props = withDefaults(
  defineProps<{ members: UserSummary[]; initialValue?: string; submitLabel?: string; placeholder?: string; autofocus?: boolean }>(),
  { initialValue: '', submitLabel: 'Comment', placeholder: 'Add a comment… type @ to mention someone', autofocus: false },
)
const emit = defineEmits<{ submit: [body: string]; cancel: [] }>()

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
const element = () => textareaRef.value?.$el as HTMLTextAreaElement | undefined

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
  if (!text.value.trim()) return
  isSubmitting.value = true
  emit('submit', serialize())
}

function reset() {
  text.value = ''
  mentions.value = []
  isSubmitting.value = false
}

defineExpose({ reset, done: () => (isSubmitting.value = false) })
</script>

<template>
  <div class="relative space-y-2">
    <Textarea
      ref="textareaRef"
      v-model="text"
      rows="3"
      :placeholder="placeholder"
      :autofocus="autofocus"
      aria-label="Comment"
      @input="detectMention"
      @click="detectMention"
      @keydown="onKeydown"
    />
    <ul v-if="suggestions.length" class="absolute top-full left-0 z-20 mt-1 w-64 overflow-hidden border bg-popover p-1 shadow-md" role="listbox">
      <li v-for="(member, index) in suggestions" :key="member.id">
        <button
          type="button"
          class="flex w-full items-center gap-2 px-2 py-1.5 text-sm"
          :class="index === highlighted && 'bg-accent text-accent-foreground'"
          role="option"
          :aria-selected="index === highlighted"
          @mousedown.prevent="insertMention(member)"
        >
          <UserAvatar :user="member" size="xs" /> {{ member.name }}
        </button>
      </li>
    </ul>
    <div class="flex items-center gap-2">
      <Button size="sm" :disabled="!text.trim()" :loading="isSubmitting" @click="submit">{{ submitLabel }}</Button>
      <Button v-if="initialValue" size="sm" variant="ghost" @click="emit('cancel')">Cancel</Button>
      <span class="ml-auto hidden text-xs text-muted-foreground sm:inline">Ctrl + Enter to send</span>
    </div>
  </div>
</template>

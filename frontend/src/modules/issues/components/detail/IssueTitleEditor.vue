<script setup lang="ts">
import { nextTick, ref } from 'vue'

const props = withDefaults(defineProps<{ title: string; editable?: boolean; done?: boolean }>(), { editable: true, done: false })
const emit = defineEmits<{ save: [title: string] }>()

const isEditing = ref(false)
const draft = ref('')
const textarea = ref<HTMLTextAreaElement | null>(null)

async function startEditing() {
  if (!props.editable) return
  draft.value = props.title
  isEditing.value = true
  await nextTick()
  textarea.value?.focus()
  textarea.value?.select()
}

function save() {
  const value = draft.value.trim()
  isEditing.value = false
  if (value && value !== props.title) emit('save', value)
}
</script>

<template>
  <textarea
    v-if="isEditing"
    ref="textarea"
    v-model="draft"
    rows="2"
    class="w-full resize-none border border-ring bg-background px-2 py-1 text-xl font-semibold tracking-tight outline-none ring-[3px] ring-ring/30 field-sizing-content"
    aria-label="Task title"
    @keydown.enter.prevent="save"
    @keydown.esc="isEditing = false"
    @blur="save"
  />
  <h1
    v-else
    class="-mx-2 px-2 py-1 text-xl leading-snug font-semibold tracking-tight break-words"
    :class="[editable && 'cursor-text hover:bg-muted/60', done && 'text-muted-foreground']"
    :tabindex="editable ? 0 : undefined"
    @click="startEditing"
    @keydown.enter.prevent="startEditing"
  >
    {{ title }}
  </h1>
</template>

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
    class="w-full resize-none rounded-lg border border-ring bg-background px-2.5 py-1.5 text-[1.35rem] leading-snug font-semibold tracking-tight outline-none ring-[3px] ring-ring/25 field-sizing-content sm:text-[22px]"
    aria-label="Task title"
    @keydown.enter.prevent="save"
    @keydown.esc="isEditing = false"
    @blur="save"
  />
  <h1
    v-else
    class="-mx-1 rounded-lg px-2.5 py-1.5 text-[1.35rem] leading-snug font-semibold tracking-tight break-words transition-[background-color,color] duration-150 sm:text-[22px]"
    :class="[
      editable && 'cursor-text hover:bg-muted/55 focus-visible:bg-muted/55 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/25',
      done && 'text-muted-foreground line-through decoration-muted-foreground/40',
    ]"
    :tabindex="editable ? 0 : undefined"
    @click="startEditing"
    @keydown.enter.prevent="startEditing"
  >
    {{ title }}
  </h1>
</template>

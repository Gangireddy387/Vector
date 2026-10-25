<script setup lang="ts">
import { nextTick, ref } from 'vue'
import MarkdownContent from '@/components/common/MarkdownContent.vue'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

const props = withDefaults(defineProps<{ description: string | null; editable?: boolean }>(), { editable: true })
const emit = defineEmits<{ save: [description: string | null] }>()

const isEditing = ref(false)
const isPreview = ref(false)
const draft = ref('')
const editor = ref<InstanceType<typeof Textarea> | null>(null)

async function startEditing() {
  if (!props.editable) return
  draft.value = props.description ?? ''
  isPreview.value = false
  isEditing.value = true
  await nextTick()
  ;(editor.value?.$el as HTMLTextAreaElement | undefined)?.focus()
}

function save() {
  isEditing.value = false
  const value = draft.value.trim() || null
  if (value !== (props.description ?? null)) emit('save', value)
}
</script>

<template>
  <section class="space-y-2">
    <div class="flex items-center justify-between">
      <h2 class="text-sm font-semibold">Description</h2>
      <Button v-if="isEditing" variant="ghost" size="xs" @click="isPreview = !isPreview">{{ isPreview ? 'Edit' : 'Preview' }}</Button>
    </div>

    <template v-if="isEditing">
      <div v-if="isPreview" class="min-h-32 border p-3">
        <MarkdownContent :source="draft" />
      </div>
      <Textarea
        v-else
        ref="editor"
        v-model="draft"
        rows="8"
        class="font-mono text-[13px]"
        placeholder="Describe the work. Markdown is supported."
        @keydown.ctrl.enter.prevent="save"
        @keydown.meta.enter.prevent="save"
        @keydown.esc="isEditing = false"
      />
      <div class="flex items-center gap-2">
        <Button size="sm" @click="save">Save</Button>
        <Button size="sm" variant="ghost" @click="isEditing = false">Cancel</Button>
        <span class="ml-auto text-xs text-muted-foreground">Ctrl + Enter to save</span>
      </div>
    </template>

    <div
      v-else
      class="-mx-2 px-2 py-1"
      :class="editable && 'cursor-text hover:bg-muted/50'"
      :tabindex="editable ? 0 : undefined"
      @click="startEditing"
      @keydown.enter.prevent="startEditing"
    >
      <MarkdownContent v-if="description" :source="description" />
      <p v-else class="py-2 text-sm text-muted-foreground">{{ editable ? 'Add a description…' : 'No description.' }}</p>
    </div>
  </section>
</template>

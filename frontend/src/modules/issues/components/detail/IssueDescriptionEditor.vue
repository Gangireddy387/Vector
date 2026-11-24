<script setup lang="ts">
import { nextTick, ref } from 'vue'
import MarkdownContent from '@/components/common/MarkdownContent.vue'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import WritingAssistBar from '@/modules/ai/components/WritingAssistBar.vue'

const props = withDefaults(defineProps<{ description: string | null; editable?: boolean }>(), { editable: true })
const emit = defineEmits<{ save: [description: string | null] }>()

const isEditing = ref(false)
const isPreview = ref(false)
const draft = ref('')
const editor = ref<InstanceType<typeof Textarea> | null>(null)
const assistRef = ref<InstanceType<typeof WritingAssistBar> | null>(null)

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

function onKeydown(event: KeyboardEvent) {
  if (assistRef.value?.onKeydown(event)) return
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    event.preventDefault()
    save()
  }
  if (event.key === 'Escape') isEditing.value = false
}
</script>

<template>
  <section class="issue-section space-y-2.5">
    <div class="flex items-center justify-between gap-2">
      <h2 class="text-[13px] font-semibold tracking-tight">Description</h2>
      <Button v-if="isEditing" variant="ghost" size="xs" @click="isPreview = !isPreview">{{ isPreview ? 'Edit' : 'Preview' }}</Button>
    </div>

    <template v-if="isEditing">
      <div v-if="isPreview" class="min-h-32 rounded-xl border border-border/80 bg-card p-3.5 shadow-soft">
        <MarkdownContent :source="draft" />
      </div>
      <template v-else>
        <WritingAssistBar ref="assistRef" v-model="draft" surface="issue" />
        <Textarea
          ref="editor"
          v-model="draft"
          rows="8"
          class="rounded-xl font-mono text-[13px]"
          placeholder="Describe the work. Markdown is supported. Ctrl+Space to continue writing."
          @keydown="onKeydown"
        />
      </template>
      <div class="flex items-center gap-2">
        <Button size="sm" @click="save">Save</Button>
        <Button size="sm" variant="ghost" @click="isEditing = false">Cancel</Button>
        <span class="ml-auto text-xs text-muted-foreground">Ctrl + Enter to save</span>
      </div>
    </template>

    <div
      v-else
      class="rounded-xl border border-transparent px-3 py-2.5 transition-[background-color,border-color,box-shadow] duration-150"
      :class="
        editable
          ? 'cursor-text hover:border-border/80 hover:bg-muted/35 hover:shadow-soft focus-visible:border-ring/50 focus-visible:bg-muted/35 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/20'
          : 'border-border/50 bg-muted/20'
      "
      :tabindex="editable ? 0 : undefined"
      @click="startEditing"
      @keydown.enter.prevent="startEditing"
    >
      <MarkdownContent v-if="description" :source="description" />
      <p v-else class="py-1.5 text-sm text-muted-foreground">
        {{ editable ? 'Add a description…' : 'No description.' }}
      </p>
    </div>
  </section>
</template>

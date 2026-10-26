<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import FormField from '@/components/common/FormField.vue'
import { NumberField } from '@/components/forms'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { getErrorMessage } from '@/lib/http'
import IssueTypeSelect from '@/modules/issues/components/pickers/IssueTypeSelect.vue'
import LabelMultiSelect from '@/modules/issues/components/pickers/LabelMultiSelect.vue'
import PrioritySelect from '@/modules/issues/components/pickers/PrioritySelect.vue'
import type { IssueTemplate, ProjectDetail } from '@/types/models'
import { type TemplateInput, templatesApi } from '../automation.api'

const props = defineProps<{ project: ProjectDetail; template?: IssueTemplate | null }>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ saved: [] }>()

const empty = (): TemplateInput => ({
  name: '',
  issueType: 'task',
  titlePrefix: null,
  body: '',
  priority: 'medium',
  storyPoints: null,
  labelIds: [],
  subtaskTitles: [],
})
const form = ref<TemplateInput>(empty())
const storyPoints = ref('')
const isSaving = ref(false)

watch(open, (isOpen) => {
  if (!isOpen) return
  form.value = props.template ? { ...empty(), ...props.template } : empty()
  storyPoints.value = form.value.storyPoints?.toString() ?? ''
})

const subtaskText = computed({
  get: () => form.value.subtaskTitles.join('\n'),
  set: (value: string) => (form.value.subtaskTitles = value.split('\n').map((line) => line.trim()).filter(Boolean)),
})

async function save() {
  isSaving.value = true
  try {
    const payload: TemplateInput = {
      ...form.value,
      titlePrefix: form.value.titlePrefix?.trim() || null,
      body: form.value.body || null,
      storyPoints: storyPoints.value === '' ? null : Number(storyPoints.value),
    }
    if (props.template) await templatesApi.update(props.project.id, props.template.id, payload)
    else await templatesApi.create(props.project.id, payload)
    toast.success('Template saved')
    emit('saved')
    open.value = false
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>{{ template ? 'Edit template' : 'New task template' }}</DialogTitle>
        <DialogDescription>Templates pre-fill type, priority, description, labels and sub-tasks when creating tasks.</DialogDescription>
      </DialogHeader>
      <form class="space-y-4" @submit.prevent="save">
        <div class="grid gap-3 sm:grid-cols-2">
          <FormField label="Template name" for="template-name"><Input id="template-name" v-model="form.name" required placeholder="e.g. Bug report" /></FormField>
          <FormField label="Title prefix" for="template-prefix" optional>
            <Input id="template-prefix" :model-value="form.titlePrefix ?? ''" placeholder="e.g. [Bug]" @update:model-value="(value: string) => (form.titlePrefix = value)" />
          </FormField>
          <FormField label="Type"><IssueTypeSelect v-model="form.issueType" /></FormField>
          <FormField label="Priority"><PrioritySelect v-model="form.priority" /></FormField>
          <FormField label="Story points" for="template-points" optional><NumberField id="template-points" v-model="storyPoints" :min="0" :max="100" /></FormField>
          <FormField label="Labels"><LabelMultiSelect v-model="form.labelIds" :labels="project.labels" :project-id="project.id" /></FormField>
        </div>
        <FormField label="Description" for="template-body" hint="Markdown supported. Use checklists for acceptance criteria.">
          <Textarea id="template-body" :model-value="form.body ?? ''" rows="6" class="font-mono text-[13px]" @update:model-value="(value) => (form.body = value)" />
        </FormField>
        <FormField label="Sub-tasks" for="template-subtasks" hint="One per line — created automatically with each task.">
          <Textarea id="template-subtasks" v-model="subtaskText" rows="3" />
        </FormField>
        <DialogFooter>
          <Button type="button" variant="outline" @click="open = false">Cancel</Button>
          <Button type="submit" :loading="isSaving">Save template</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>

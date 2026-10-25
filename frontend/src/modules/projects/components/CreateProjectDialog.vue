<script setup lang="ts">
import { Columns3, Kanban } from 'lucide-vue-next'
import { reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import ColorSwatchPicker from '@/components/common/ColorSwatchPicker.vue'
import FormField from '@/components/common/FormField.vue'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { getErrorMessage, getFieldErrors } from '@/lib/http'
import type { ProjectType } from '@/types/models'
import { useProjectsStore } from '../projects.store'

const open = defineModel<boolean>('open', { default: false })

const router = useRouter()
const projects = useProjectsStore()

const form = reactive({ name: '', key: '', description: '', type: 'scrum' as ProjectType, color: '#6366f1' })
const keyTouched = ref(false)
const fieldErrors = ref<Record<string, string>>({})
const isSaving = ref(false)

const TYPES = [
  { value: 'scrum' as const, label: 'Scrum', icon: Columns3, description: 'Plan work in sprints with a backlog, velocity and burndown.' },
  { value: 'kanban' as const, label: 'Kanban', icon: Kanban, description: 'Continuous flow on a board with WIP limits.' },
]

/** Suggests a key from the project name: "Mobile App" → "MA", "Payments" → "PAY". */
const suggestKey = (name: string) => {
  const words = name.toUpperCase().replace(/[^A-Z0-9 ]/g, '').split(/\s+/).filter(Boolean)
  if (!words.length) return ''
  const key = words.length === 1 ? words[0]!.slice(0, 3) : words.map((word) => word[0]).join('').slice(0, 5)
  return /^[A-Z]/.test(key) ? key : `P${key}`.slice(0, 5)
}

watch(() => form.name, (name) => !keyTouched.value && (form.key = suggestKey(name)))
watch(open, (isOpen) => {
  if (!isOpen) return
  Object.assign(form, { name: '', key: '', description: '', type: 'scrum', color: '#6366f1' })
  keyTouched.value = false
  fieldErrors.value = {}
})

async function create() {
  isSaving.value = true
  fieldErrors.value = {}
  try {
    const project = await projects.createProject({ ...form, description: form.description || null })
    toast.success(`${project.name} is ready`, { description: 'Statuses, labels and a first sprint were set up for you.' })
    open.value = false
    await router.push({ name: 'project-board', params: { projectId: project.id } })
  } catch (error) {
    fieldErrors.value = getFieldErrors(error)
    if (!Object.keys(fieldErrors.value).length) toast.error(getErrorMessage(error))
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>Create project</DialogTitle>
        <DialogDescription>We set up a workflow, labels and your first sprint automatically.</DialogDescription>
      </DialogHeader>
      <form class="space-y-4" @submit.prevent="create">
        <div class="space-y-1.5">
          <div class="grid items-start gap-3 sm:grid-cols-[minmax(0,1fr)_8rem]">
            <FormField label="Name" for="project-name" :error="fieldErrors.name">
              <Input id="project-name" v-model="form.name" placeholder="e.g. Mobile App" autofocus required />
            </FormField>
            <FormField label="Key" for="project-key" :error="fieldErrors.key">
              <Input
                id="project-key"
                v-model="form.key"
                class="font-mono tracking-wider uppercase"
                placeholder="MA"
                maxlength="10"
                required
                @input="keyTouched = true"
              />
            </FormField>
          </div>
          <p class="text-xs text-muted-foreground">
            <template v-if="form.key">
              Issues will be numbered <span class="font-mono font-medium text-foreground">{{ form.key.toUpperCase() }}-1</span>,
              <span class="font-mono font-medium text-foreground">{{ form.key.toUpperCase() }}-2</span>, …
            </template>
            <template v-else>The key prefixes every issue in this project, e.g. MA-1.</template>
          </p>
        </div>
        <div class="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Project type">
          <button
            v-for="type in TYPES"
            :key="type.value"
            type="button"
            role="radio"
            :aria-checked="form.type === type.value"
            class="flex gap-3 border p-3 text-left transition-colors"
            :class="form.type === type.value ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:bg-muted/50'"
            @click="form.type = type.value"
          >
            <component :is="type.icon" class="mt-0.5 size-5 shrink-0 text-primary" />
            <span>
              <span class="block text-sm font-medium">{{ type.label }}</span>
              <span class="block text-xs text-muted-foreground">{{ type.description }}</span>
            </span>
          </button>
        </div>
        <FormField label="Description" for="project-description" optional>
          <Textarea id="project-description" v-model="form.description" rows="2" />
        </FormField>
        <FormField label="Color">
          <ColorSwatchPicker v-model="form.color" />
        </FormField>
        <DialogFooter>
          <Button type="button" variant="outline" @click="open = false">Cancel</Button>
          <Button type="submit" :loading="isSaving" :disabled="!form.name || !form.key">Create project</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>

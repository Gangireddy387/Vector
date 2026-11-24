<script setup lang="ts">
import { ListTree, Plus, Trash2 } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { toast } from 'vue-sonner'
import EmptyState from '@/components/common/EmptyState.vue'
import { SelectField, type SelectFieldOption } from '@/components/forms'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label as FormLabel } from '@/components/ui/label'
import { useConfirm } from '@/composables/useConfirm'
import { getErrorMessage } from '@/lib/http'
import { useAuthStore } from '@/modules/auth/auth.store'
import type { CustomField, CustomFieldType, ProjectDetail } from '@/types/models'
import { projectsApi } from '../../projects.api'
import { useProjectsStore } from '../../projects.store'

const props = defineProps<{ project: ProjectDetail }>()

const auth = useAuthStore()
const projects = useProjectsStore()
const confirm = useConfirm()
const canUse = computed(() => auth.hasFeature('customFields'))

const name = ref('')
const type = ref<CustomFieldType>('text')
const optionsText = ref('')
const required = ref(false)

const TYPE_OPTIONS: SelectFieldOption[] = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'select', label: 'Select' },
  { value: 'multi_select', label: 'Multi-select' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'url', label: 'URL' },
]

const needsOptions = computed(() => type.value === 'select' || type.value === 'multi_select')
const fields = computed(() => props.project.customFields ?? [])

const refresh = () => projects.fetchProject(props.project.id, true)

function parseOptions(text: string) {
  return [...new Set(text.split(/[\n,]/).map((part) => part.trim()).filter(Boolean))]
}

async function create() {
  if (!name.value.trim()) return
  try {
    await projectsApi.createCustomField(props.project.id, {
      name: name.value.trim(),
      type: type.value,
      required: required.value,
      options: needsOptions.value ? parseOptions(optionsText.value) : [],
    })
    name.value = ''
    optionsText.value = ''
    required.value = false
    type.value = 'text'
    await refresh()
    toast.success('Custom field added')
  } catch (error) {
    toast.error(getErrorMessage(error))
  }
}

async function rename(field: CustomField, nextName: string) {
  const trimmed = nextName.trim()
  if (!trimmed || trimmed === field.name) return
  try {
    await projectsApi.updateCustomField(props.project.id, field.id, { name: trimmed })
    await refresh()
  } catch (error) {
    toast.error(getErrorMessage(error))
  }
}

async function toggleRequired(field: CustomField, next: boolean) {
  try {
    await projectsApi.updateCustomField(props.project.id, field.id, { required: next })
    await refresh()
  } catch (error) {
    toast.error(getErrorMessage(error))
  }
}

async function remove(field: CustomField) {
  if (
    !(await confirm({
      title: `Delete field “${field.name}”?`,
      description: 'Values on every task are removed. This cannot be undone.',
      confirmLabel: 'Delete',
      destructive: true,
    }))
  ) {
    return
  }
  try {
    await projectsApi.removeCustomField(props.project.id, field.id)
    await refresh()
  } catch (error) {
    toast.error(getErrorMessage(error))
  }
}

function typeLabel(value: CustomFieldType) {
  return TYPE_OPTIONS.find((option) => option.value === value)?.label ?? value
}
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle class="flex items-center gap-2"><ListTree class="size-4" /> Custom fields</CardTitle>
      <CardDescription>
        Add extra fields to every task in this project — customer name, severity, environment, and more.
      </CardDescription>
    </CardHeader>
    <CardContent class="space-y-4">
      <EmptyState
        v-if="!canUse"
        title="Pro feature"
        description="Custom fields are included on Pro and Enterprise. Ask an organization admin to upgrade."
      />

      <template v-else>
        <ul class="divide-y border">
          <li v-for="field in fields" :key="field.id" class="flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
            <div class="min-w-0 flex-1 space-y-1">
              <Input
                :model-value="field.name"
                class="h-8 font-medium"
                :aria-label="`Rename ${field.name}`"
                @blur="(event: FocusEvent) => rename(field, (event.target as HTMLInputElement).value)"
              />
              <p class="text-xs text-muted-foreground">
                {{ typeLabel(field.type) }}
                <span v-if="field.options.length"> · {{ field.options.join(', ') }}</span>
                <span class="ml-1 font-mono text-[10px] opacity-70">{{ field.key }}</span>
              </p>
            </div>
            <label class="flex items-center gap-2 text-xs text-muted-foreground">
              <Checkbox
                :model-value="field.required"
                @update:model-value="(value) => toggleRequired(field, value === true)"
              />
              Required
            </label>
            <Button variant="ghost" size="icon-sm" :aria-label="`Delete ${field.name}`" @click="remove(field)">
              <Trash2 />
            </Button>
          </li>
          <li v-if="!fields.length" class="p-4 text-center text-sm text-muted-foreground">No custom fields yet</li>
        </ul>

        <form class="space-y-3 border-t pt-4" @submit.prevent="create">
          <div class="grid gap-3 sm:grid-cols-2">
            <div class="space-y-1.5">
              <FormLabel for="cf-name">Name</FormLabel>
              <Input id="cf-name" v-model="name" placeholder="e.g. Customer" />
            </div>
            <div class="space-y-1.5">
              <FormLabel for="cf-type">Type</FormLabel>
              <SelectField
                id="cf-type"
                :model-value="type"
                :options="TYPE_OPTIONS"
                size="sm"
                @update:model-value="(value) => value && (type = value as CustomFieldType)"
              />
            </div>
          </div>
          <div v-if="needsOptions" class="space-y-1.5">
            <FormLabel for="cf-options">Options</FormLabel>
            <Input id="cf-options" v-model="optionsText" placeholder="Comma or line separated — e.g. Low, Medium, High" />
          </div>
          <label class="flex items-center gap-2 text-sm">
            <Checkbox :model-value="required" @update:model-value="(value) => (required = value === true)" />
            Required on tasks
          </label>
          <Button type="submit" :disabled="!name.trim() || (needsOptions && !parseOptions(optionsText).length)">
            <Plus /> Add field
          </Button>
        </form>
      </template>
    </CardContent>
  </Card>
</template>

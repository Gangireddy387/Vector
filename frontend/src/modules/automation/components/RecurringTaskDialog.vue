<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import FormField from '@/components/common/FormField.vue'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { NumberField, SelectField, type SelectFieldOption, TimeField } from '@/components/forms'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { getErrorMessage } from '@/lib/http'
import IssueTypeSelect from '@/modules/issues/components/pickers/IssueTypeSelect.vue'
import LabelMultiSelect from '@/modules/issues/components/pickers/LabelMultiSelect.vue'
import MemberSelect from '@/modules/issues/components/pickers/MemberSelect.vue'
import PrioritySelect from '@/modules/issues/components/pickers/PrioritySelect.vue'
import type { ProjectDetail, RecurringFrequency, RecurringTask } from '@/types/models'
import { type RecurringTaskInput, recurringTasksApi } from '../automation.api'
import { describeSchedule, WEEKDAY_NAMES } from '../recurring-schedule'

const props = defineProps<{ project: ProjectDetail; task?: RecurringTask | null }>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ saved: [] }>()

const FREQUENCY_OPTIONS: SelectFieldOption[] = [
  { value: 'daily', label: 'Daily', description: 'Every day of the week' },
  { value: 'weekdays', label: 'Every weekday', description: 'Monday to Friday' },
  { value: 'weekly', label: 'Weekly', description: 'Once a week' },
  { value: 'monthly', label: 'Monthly', description: 'Once a month' },
]
const WEEKDAY_OPTIONS: SelectFieldOption[] = WEEKDAY_NAMES.map((day, index) => ({ value: String(index), label: day }))

const empty = (): RecurringTaskInput => ({
  title: '',
  description: null,
  issueType: 'task',
  priority: 'medium',
  assigneeId: null,
  labelIds: [],
  frequency: 'weekly',
  dayOfWeek: 1,
  dayOfMonth: 1,
  timeOfDay: '09:00',
  dueInDays: null,
  enabled: true,
})
const form = ref<RecurringTaskInput>(empty())
const dueInDays = ref('')
const isSaving = ref(false)

watch(open, (isOpen) => {
  if (!isOpen) return
  form.value = props.task ? { ...empty(), ...props.task } : empty()
  dueInDays.value = form.value.dueInDays?.toString() ?? ''
})

const schedule = computed(() => describeSchedule(form.value))
const dayOfMonthText = computed({
  get: () => String(form.value.dayOfMonth ?? 1),
  set: (value: string) => (form.value.dayOfMonth = Math.min(28, Math.max(1, Number(value) || 1))),
})

async function save() {
  isSaving.value = true
  try {
    const payload: RecurringTaskInput = {
      ...form.value,
      description: form.value.description || null,
      dueInDays: dueInDays.value === '' ? null : Number(dueInDays.value),
    }
    if (props.task) await recurringTasksApi.update(props.project.id, props.task.id, payload)
    else await recurringTasksApi.create(props.project.id, payload)
    toast.success('Recurring task saved', { description: schedule.value })
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
        <DialogTitle>{{ task ? 'Edit recurring task' : 'New recurring task' }}</DialogTitle>
        <DialogDescription>Vector creates this task for you on schedule — no more copy-pasting routine work.</DialogDescription>
      </DialogHeader>
      <form class="space-y-4" @submit.prevent="save">
        <FormField label="Task title" for="recurring-title"><Input id="recurring-title" v-model="form.title" required placeholder="e.g. Weekly security review" /></FormField>
        <FormField label="Description" for="recurring-description" optional>
          <Textarea id="recurring-description" :model-value="form.description ?? ''" rows="3" @update:model-value="(value) => (form.description = value)" />
        </FormField>

        <div class="grid gap-3 sm:grid-cols-3">
          <FormField label="Repeat" for="recurring-frequency">
            <SelectField
              id="recurring-frequency"
              :model-value="form.frequency"
              :options="FREQUENCY_OPTIONS"
              aria-label="Frequency"
              @update:model-value="(value) => value && (form.frequency = value as RecurringFrequency)"
            />
          </FormField>
          <FormField v-if="form.frequency === 'weekly'" label="On" for="recurring-weekday">
            <SelectField
              id="recurring-weekday"
              :model-value="String(form.dayOfWeek ?? 1)"
              :options="WEEKDAY_OPTIONS"
              aria-label="Day of week"
              @update:model-value="(value) => (form.dayOfWeek = Number(value))"
            />
          </FormField>
          <FormField v-if="form.frequency === 'monthly'" label="Day of month" for="recurring-day" hint="1 – 28">
            <NumberField id="recurring-day" v-model="dayOfMonthText" :min="1" :max="28" />
          </FormField>
          <FormField label="At" for="recurring-time"><TimeField id="recurring-time" v-model="form.timeOfDay" /></FormField>
        </div>
        <p class="text-sm text-primary">{{ schedule }}</p>

        <div class="grid gap-3 sm:grid-cols-2">
          <FormField label="Type"><IssueTypeSelect v-model="form.issueType" /></FormField>
          <FormField label="Priority"><PrioritySelect v-model="form.priority" /></FormField>
          <FormField label="Assignee" hint="Leave empty to use the project’s auto-assign setting.">
            <MemberSelect v-model="form.assigneeId" :members="project.members" />
          </FormField>
          <FormField label="Due after (days)" for="recurring-due" optional>
            <NumberField id="recurring-due" v-model="dueInDays" :min="0" :max="90" placeholder="No due date" suffix="days" />
          </FormField>
          <FormField label="Labels" class="sm:col-span-2"><LabelMultiSelect v-model="form.labelIds" :labels="project.labels" :project-id="project.id" /></FormField>
        </div>
        <div class="flex items-center gap-2 text-sm"><Switch v-model="form.enabled" aria-label="Active" /> Active</div>

        <DialogFooter>
          <Button type="button" variant="outline" @click="open = false">Cancel</Button>
          <Button type="submit" :loading="isSaving">Save</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>

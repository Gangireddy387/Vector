<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import FormField from '@/components/common/FormField.vue'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { NumberField, SelectField } from '@/components/forms'
import { Switch } from '@/components/ui/switch'
import { getErrorMessage } from '@/lib/http'
import MemberSelect from '@/modules/issues/components/pickers/MemberSelect.vue'
import type { AutoAssignStrategy, ProjectDetail, ProjectSettings } from '@/types/models'
import { useProjectsStore } from '../../projects.store'

const props = defineProps<{ project: ProjectDetail }>()

const projects = useProjectsStore()
const settings = reactive<ProjectSettings>({ ...props.project.settings })
const sprintLengthDays = ref(String(props.project.settings.sprintLengthDays))
const dueReminderHours = ref(String(props.project.settings.dueReminderHours))
const isSaving = ref(false)

watch(
  () => props.project.settings,
  (value) => {
    Object.assign(settings, value)
    sprintLengthDays.value = String(value.sprintLengthDays)
    dueReminderHours.value = String(value.dueReminderHours)
  },
)

const STRATEGIES: Array<{ value: AutoAssignStrategy; label: string; description: string }> = [
  { value: 'none', label: 'Off', description: 'New issues stay unassigned unless someone picks an owner.' },
  { value: 'round_robin', label: 'Round robin', description: 'Rotate new issues across members in turn.' },
  { value: 'least_loaded', label: 'Least busy', description: 'Give new issues to whoever has the fewest open points.' },
  { value: 'project_lead', label: 'Project lead', description: 'Send everything to the project lead for triage.' },
  { value: 'default_assignee', label: 'Default person', description: 'Always assign to one chosen member.' },
]

const TOGGLES: Array<{ key: 'autoCloseParent' | 'carryOverIncomplete'; label: string; description: string }> = [
  { key: 'autoCloseParent', label: 'Close parents automatically', description: 'When every sub-task is done, the parent moves to done too.' },
  { key: 'carryOverIncomplete', label: 'Carry over unfinished work', description: 'When a sprint ends, unfinished issues move to the next sprint.' },
]

async function save() {
  isSaving.value = true
  try {
    await projects.updateProject(props.project.id, {
      settings: {
        autoAssign: settings.autoAssign,
        defaultAssigneeId: settings.defaultAssigneeId,
        autoCloseParent: settings.autoCloseParent,
        carryOverIncomplete: settings.carryOverIncomplete,
        sprintLengthDays: Number(sprintLengthDays.value),
        dueReminderHours: Number(dueReminderHours.value),
      },
    })
    toast.success('Smart defaults saved')
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle>Smart defaults</CardTitle>
      <CardDescription>Built-in behaviour that removes routine work. For custom rules, use Automation.</CardDescription>
    </CardHeader>
    <CardContent>
      <form class="space-y-5" @submit.prevent="save">
        <FormField label="Auto-assign new issues" for="auto-assign" :hint="STRATEGIES.find((item) => item.value === settings.autoAssign)?.description">
          <SelectField
            id="auto-assign"
            :model-value="settings.autoAssign"
            :options="STRATEGIES"
            aria-label="Auto-assign strategy"
            @update:model-value="(value) => value && (settings.autoAssign = value as AutoAssignStrategy)"
          />
        </FormField>
        <FormField v-if="settings.autoAssign === 'default_assignee'" label="Default person" for="default-assignee">
          <MemberSelect id="default-assignee" v-model="settings.defaultAssigneeId" :members="project.members" none-label="Choose someone" />
        </FormField>

        <div class="space-y-4">
          <div v-for="toggle in TOGGLES" :key="toggle.key" class="flex items-start justify-between gap-4">
            <span>
              <span class="block text-sm font-medium">{{ toggle.label }}</span>
              <span class="block text-xs text-muted-foreground">{{ toggle.description }}</span>
            </span>
            <Switch v-model="settings[toggle.key]" :aria-label="toggle.label" />
          </div>
        </div>

        <div class="grid gap-4 sm:grid-cols-2">
          <FormField label="Default sprint length (days)" for="sprint-length">
            <NumberField id="sprint-length" v-model="sprintLengthDays" :min="1" :max="60" suffix="days" />
          </FormField>
          <FormField label="Due date reminder (hours before)" for="reminder-hours" hint="Assignees get an in-app and email reminder.">
            <NumberField id="reminder-hours" v-model="dueReminderHours" :min="1" :max="168" suffix="hours" />
          </FormField>
        </div>

        <Button type="submit" :loading="isSaving">Save smart defaults</Button>
      </form>
    </CardContent>
  </Card>
</template>

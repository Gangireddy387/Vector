<script setup lang="ts">
import { Check, Trash2 } from 'lucide-vue-next'
import { computed } from 'vue'
import FilterDropdown from '@/components/common/FilterDropdown.vue'
import { NumberField, SelectField, type SelectFieldOption } from '@/components/forms'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useAuthStore } from '@/modules/auth/auth.store'
import LabelMultiSelect from '@/modules/issues/components/pickers/LabelMultiSelect.vue'
import MemberSelect from '@/modules/issues/components/pickers/MemberSelect.vue'
import PrioritySelect from '@/modules/issues/components/pickers/PrioritySelect.vue'
import StatusSelect from '@/modules/issues/components/pickers/StatusSelect.vue'
import type { AutomationAction, AutomationActionType, IssuePriority, ProjectDetail } from '@/types/models'
import { ACTION_OPTIONS, ASSIGN_STRATEGY_OPTIONS, defaultParams, RECIPIENT_OPTIONS, TEMPLATE_VARIABLES } from '../automation.constants'

const props = defineProps<{ project: ProjectDetail; index: number }>()
const action = defineModel<AutomationAction>({ required: true })
defineEmits<{ remove: [] }>()

const auth = useAuthStore()
const canSendEmail = computed(() => auth.hasFeature('emailAutomations'))

/** Every setting an action can have; each action type uses some of them (see `defaultParams`). */
interface ActionParams {
  statusId?: string
  priority?: IssuePriority
  strategy?: string
  userId?: string | null
  userIds?: string[]
  labelIds?: string[]
  body?: string
  subject?: string
  message?: string
  recipients?: string[]
  titles?: string[]
  daysFromNow?: number | null
  storyPoints?: number | null
  fieldId?: string
  value?: string | number | boolean | string[] | null
  url?: string
  secret?: string
}
const params = computed(() => action.value.params as ActionParams)
const setParam = (key: string, value: unknown) => (action.value = { ...action.value, params: { ...action.value.params, [key]: value } })
const setType = (type: AutomationActionType) => (action.value = { type, params: defaultParams(type) })

const canUseCustomFields = computed(() => auth.hasFeature('customFields') && (props.project.customFields?.length ?? 0) > 0)
const actionOptions = computed<SelectFieldOption[]>(() =>
  ACTION_OPTIONS.filter((option) => {
    if (option.value === 'send_email') return canSendEmail.value
    if (option.value === 'set_custom_field') return canUseCustomFields.value
    return true
  }).map((option) => ({
    value: option.value,
    label: option.label,
  })),
)
const customFieldOptions = computed<SelectFieldOption[]>(() =>
  (props.project.customFields ?? []).map((field) => ({ value: field.id, label: field.name })),
)
const selectedCustomField = computed(() => props.project.customFields?.find((field) => field.id === params.value.fieldId) ?? null)
const customFieldValueOptions = computed<SelectFieldOption[]>(() => {
  if (!selectedCustomField.value) return []
  if (selectedCustomField.value.type === 'checkbox') {
    return [
      { value: 'true', label: 'Yes' },
      { value: 'false', label: 'No' },
    ]
  }
  return (selectedCustomField.value.options ?? []).map((option) => ({ value: option, label: option }))
})
const customFieldSingleValue = computed({
  get: () => {
    const value = params.value.value
    if (value == null) return ''
    if (Array.isArray(value)) return value[0] ?? ''
    if (typeof value === 'boolean') return value ? 'true' : 'false'
    return String(value)
  },
  set: (value: string) => {
    const type = selectedCustomField.value?.type
    if (type === 'checkbox') setParam('value', value === 'true')
    else if (type === 'number') setParam('value', value === '' ? null : Number(value))
    else if (type === 'multi_select') setParam('value', value ? [value] : [])
    else setParam('value', value || null)
  },
})
const strategyOptions: SelectFieldOption[] = ASSIGN_STRATEGY_OPTIONS.map((option) => ({ value: option.value, label: option.label }))
const memberOptions = computed(() => props.project.members.map((member) => ({ value: member.id, label: member.name })))
const recipients = computed<string[]>(() => params.value.recipients ?? [])
const toggleRecipient = (value: string) =>
  setParam('recipients', recipients.value.includes(value) ? recipients.value.filter((item) => item !== value) : [...recipients.value, value])

const subtaskText = computed({
  get: () => (params.value.titles ?? []).join('\n'),
  set: (value: string) => setParam('titles', value.split('\n').map((line) => line.trim()).filter(Boolean)),
})
</script>

<template>
  <div class="space-y-3 border bg-muted/30 p-3">
    <div class="flex items-center gap-2">
      <span class="flex size-6 shrink-0 items-center justify-center bg-primary text-xs font-semibold text-primary-foreground">{{ index + 1 }}</span>
      <SelectField
        :model-value="action.type"
        :options="actionOptions"
        size="sm"
        class="min-w-0 flex-1 sm:max-w-64 sm:flex-none sm:w-64"
        aria-label="Action"
        @update:model-value="(value) => value && setType(value as AutomationActionType)"
      />
      <Button variant="ghost" size="icon-sm" class="ml-auto shrink-0" aria-label="Remove action" @click="$emit('remove')"><Trash2 /></Button>
    </div>

    <div class="space-y-2 pl-0 sm:pl-8">
      <StatusSelect
        v-if="action.type === 'set_status'"
        :model-value="params.statusId ?? ''"
        :statuses="project.statuses"
        size="sm"
        class="w-full sm:w-56"
        @update:model-value="(value) => setParam('statusId', value)"
      />

      <div v-else-if="action.type === 'set_priority'" class="w-full sm:w-48">
        <PrioritySelect :model-value="(params.priority as IssuePriority) ?? 'high'" size="sm" @update:model-value="(value) => setParam('priority', value)" />
      </div>

      <div v-else-if="action.type === 'assign'" class="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <SelectField
          :model-value="params.strategy ?? null"
          :options="strategyOptions"
          size="sm"
          class="w-full sm:w-60"
          aria-label="Assign to"
          @update:model-value="(value) => setParam('strategy', value)"
        />
        <div v-if="params.strategy === 'user'" class="w-full sm:w-56">
          <MemberSelect :model-value="params.userId ?? null" :members="project.members" :allow-none="false" none-label="Choose person" size="sm" @update:model-value="(value) => setParam('userId', value)" />
        </div>
      </div>

      <div v-else-if="action.type === 'add_labels' || action.type === 'remove_labels'" class="max-w-md">
        <LabelMultiSelect :model-value="params.labelIds ?? []" :labels="project.labels" :allow-create="false" @update:model-value="(value) => setParam('labelIds', value)" />
      </div>

      <div v-else-if="action.type === 'add_comment'" class="space-y-1">
        <Textarea :model-value="params.body ?? ''" rows="2" placeholder="Comment text" @update:model-value="(value) => setParam('body', value)" />
        <p class="text-xs text-muted-foreground">Variables: {{ TEMPLATE_VARIABLES.join(' ') }}</p>
      </div>

      <div v-else-if="action.type === 'notify' || action.type === 'send_email'" class="space-y-2">
        <p
          v-if="action.type === 'send_email' && !canSendEmail"
          class="rounded-md border border-warning/40 bg-warning/10 px-2.5 py-2 text-xs text-amber-800 dark:text-warning"
          role="status"
        >
          Automation emails are off on this plan — this step is skipped when the rule runs.
        </p>
        <div class="flex flex-wrap items-center gap-3">
          <button
            v-for="option in RECIPIENT_OPTIONS"
            :key="option.value"
            type="button"
            :aria-pressed="recipients.includes(option.value)"
            class="flex h-8 items-center gap-1.5 border px-2.5 text-sm transition-colors"
            :class="recipients.includes(option.value) ? 'border-primary bg-primary/10 text-primary' : 'border-input hover:border-primary/40'"
            @click="toggleRecipient(option.value)"
          >
            <Check v-if="recipients.includes(option.value)" class="size-3.5" />
            {{ option.label }}
          </button>
          <FilterDropdown
            :model-value="(params.userIds as string[] | undefined)?.join(',') || undefined"
            label="People"
            :options="memberOptions"
            @update:model-value="(value) => setParam('userIds', value ? value.split(',') : [])"
          />
        </div>
        <Input
          v-if="action.type === 'send_email'"
          :model-value="params.subject ?? ''"
          placeholder="Email subject"
          class="h-8"
          @update:model-value="(value: string) => setParam('subject', value)"
        />
        <Textarea :model-value="params.message ?? ''" rows="2" placeholder="Message" @update:model-value="(value) => setParam('message', value)" />
        <p class="text-xs text-muted-foreground">Variables: {{ TEMPLATE_VARIABLES.join(' ') }}</p>
      </div>

      <div v-else-if="action.type === 'send_webhook'" class="space-y-2">
        <Input
          :model-value="(params.url as string) ?? ''"
          type="url"
          placeholder="https://example.com/hooks/vector"
          class="h-8"
          aria-label="Webhook URL"
          @update:model-value="(value: string) => setParam('url', value)"
        />
        <Input
          :model-value="(params.secret as string) ?? ''"
          placeholder="Optional HMAC secret (x-vector-signature)"
          class="h-8"
          aria-label="Webhook secret"
          @update:model-value="(value: string) => setParam('secret', value)"
        />
        <p class="text-xs text-muted-foreground">Sends a JSON payload with the task key, title, status and rule name. Private/local URLs are blocked.</p>
      </div>

      <div v-else-if="action.type === 'set_due_date'" class="flex flex-wrap items-center gap-2 text-sm">
        <NumberField
          :model-value="String(params.daysFromNow ?? 3)"
          :min="0"
          :max="365"
          size="sm"
          class="w-32"
          aria-label="Days after the trigger"
          @update:model-value="(value) => setParam('daysFromNow', Number(value || 0))"
        />
        day(s) after the trigger
      </div>

      <NumberField
        v-else-if="action.type === 'set_story_points'"
        :model-value="String(params.storyPoints ?? 3)"
        :min="0"
        :max="100"
        size="sm"
        class="w-32"
        aria-label="Story points"
        @update:model-value="(value) => setParam('storyPoints', Number(value || 0))"
      />

      <div v-else-if="action.type === 'set_custom_field'" class="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <SelectField
          :model-value="params.fieldId || null"
          :options="customFieldOptions"
          placeholder="Choose field…"
          size="sm"
          class="w-full sm:w-56"
          aria-label="Custom field"
          @update:model-value="(value) => { setParam('fieldId', value); setParam('value', null) }"
        />
        <SelectField
          v-if="customFieldValueOptions.length"
          :model-value="customFieldSingleValue || null"
          :options="customFieldValueOptions"
          placeholder="Value…"
          size="sm"
          class="w-full sm:w-48"
          aria-label="Custom field value"
          @update:model-value="(value) => (customFieldSingleValue = value ?? '')"
        />
        <NumberField
          v-else-if="selectedCustomField?.type === 'number'"
          v-model="customFieldSingleValue"
          size="sm"
          class="w-full sm:w-32"
          aria-label="Custom field value"
        />
        <Input
          v-else-if="selectedCustomField"
          v-model="customFieldSingleValue"
          class="h-8 w-full sm:max-w-56"
          :placeholder="selectedCustomField.type === 'date' ? 'YYYY-MM-DD' : 'Value'"
          aria-label="Custom field value"
        />
      </div>

      <div v-else-if="action.type === 'create_subtasks'" class="space-y-1">
        <Textarea v-model="subtaskText" rows="3" placeholder="One sub-task per line" />
      </div>

      <p v-else class="text-xs text-muted-foreground">No settings needed.</p>
    </div>
  </div>
</template>

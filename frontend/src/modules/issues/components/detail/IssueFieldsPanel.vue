<script setup lang="ts">
import { useDebounceFn } from '@vueuse/core'
import { X } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import UserAvatar from '@/components/common/UserAvatar.vue'
import { DatePicker, NumberField, SelectField } from '@/components/forms'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { formatDateTime } from '@/lib/format'
import { getErrorMessage } from '@/lib/http'
import { askTransitionComment } from '@/lib/transition-comment'
import { canPerformTransition, transitionRuleFor } from '@/lib/workflow-transitions'
import { formatMinutes, parseDuration } from '@/lib/utils'
import { useAuthStore } from '@/modules/auth/auth.store'
import type { CustomField, CustomFieldValue, IssueDetail, ProjectDetail, Sprint } from '@/types/models'
import { type UpdateIssueInput, issuesApi } from '../../api/issues.api'
import IssueTypeSelect from '../pickers/IssueTypeSelect.vue'
import LabelMultiSelect from '../pickers/LabelMultiSelect.vue'
import MemberSelect from '../pickers/MemberSelect.vue'
import ParentEpicSelect from '../pickers/ParentEpicSelect.vue'
import PrioritySelect from '../pickers/PrioritySelect.vue'
import SprintSelect from '../pickers/SprintSelect.vue'
import StatusSelect from '../pickers/StatusSelect.vue'
import IssueFieldRow from './IssueFieldRow.vue'

const props = withDefaults(
  defineProps<{ issue: IssueDetail; project: ProjectDetail; sprints: Sprint[]; editable?: boolean; showStatus?: boolean }>(),
  { editable: true, showStatus: true },
)
const emit = defineEmits<{ update: [changes: UpdateIssueInput]; refreshed: [issue: IssueDetail] }>()

const auth = useAuthStore()
const canEditCustomFields = computed(() => props.editable && auth.hasFeature('customFields'))
const customFields = computed(() => props.project.customFields ?? [])
const customValueMap = computed(() => {
  const map = new Map<string, CustomFieldValue>()
  for (const row of props.issue.customFieldValues ?? []) map.set(row.fieldId, row.value)
  return map
})

function customValue(field: CustomField): CustomFieldValue {
  if (customValueMap.value.has(field.id)) return customValueMap.value.get(field.id) ?? null
  return field.type === 'checkbox' ? false : null
}

function setCustomField(fieldId: string, value: CustomFieldValue) {
  if (!canEditCustomFields.value) return
  const current = customValueMap.value.get(fieldId) ?? null
  if (JSON.stringify(current) === JSON.stringify(value)) return
  emit('update', { customFields: { [fieldId]: value } })
}

function toggleMultiOption(field: CustomField, option: string, on: boolean) {
  const current = Array.isArray(customValue(field)) ? ([...(customValue(field) as string[])] as string[]) : []
  const next = on ? [...new Set([...current, option])] : current.filter((item) => item !== option)
  setCustomField(field.id, next.length ? next : null)
}

const assignableMembers = computed(() => props.project.members.filter((member) => member.role !== 'viewer'))
const watcherCandidateId = ref<string | null>(null)
const watcherOptions = computed(() =>
  props.project.members.filter((member) => !props.issue.watchers.some((watcher) => watcher.id === member.id)),
)
const isWatcherBusy = ref(false)

async function addWatcher() {
  if (!watcherCandidateId.value || isWatcherBusy.value) return
  isWatcherBusy.value = true
  try {
    const updated = await issuesApi.watch(props.issue.id, watcherCandidateId.value)
    watcherCandidateId.value = null
    emit('refreshed', updated)
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    isWatcherBusy.value = false
  }
}

async function removeWatcher(userId: string) {
  if (isWatcherBusy.value) return
  isWatcherBusy.value = true
  try {
    emit('refreshed', await issuesApi.removeWatcher(props.issue.id, userId))
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    isWatcherBusy.value = false
  }
}

const storyPoints = ref('')
const estimate = ref('')
/** True while a value is being typed or waiting to be saved, so a refresh of the issue doesn't overwrite it. */
const isPointsPending = ref(false)
const isEditingEstimate = ref(false)
watch(
  () => props.issue,
  (issue) => {
    if (!isPointsPending.value) storyPoints.value = issue.storyPoints?.toString() ?? ''
    if (!isEditingEstimate.value) estimate.value = issue.estimateMinutes ? formatMinutes(issue.estimateMinutes) : ''
  },
  { immediate: true },
)

const timeProgress = computed(() => {
  const estimateMinutes = props.issue.estimateMinutes ?? 0
  if (!estimateMinutes) return null
  return Math.min(100, Math.round((props.issue.timeSpentMinutes / estimateMinutes) * 100))
})

/** Rapid +/− clicks are batched into a single save of the final value. */
const saveStoryPoints = useDebounceFn(() => {
  isPointsPending.value = false
  const value = storyPoints.value.trim() === '' ? null : Number.parseInt(storyPoints.value, 10)
  if (value !== props.issue.storyPoints && (value === null || Number.isFinite(value))) emit('update', { storyPoints: value })
}, 500)

function commitStoryPoints() {
  isPointsPending.value = true
  void saveStoryPoints()
}

function commitEstimate() {
  isEditingEstimate.value = false
  const minutes = estimate.value.trim() ? parseDuration(estimate.value) : null
  if (estimate.value.trim() && minutes === null) {
    estimate.value = props.issue.estimateMinutes ? formatMinutes(props.issue.estimateMinutes) : ''
    return
  }
  if (minutes !== props.issue.estimateMinutes) emit('update', { estimateMinutes: minutes })
}

function setField<K extends keyof UpdateIssueInput>(field: K, value: UpdateIssueInput[K]) {
  if (props.issue[field as keyof IssueDetail] === value) return
  emit('update', { [field]: value } as UpdateIssueInput)
}

const transitionActor = computed(() => ({
  role: props.project.myRole,
  userId: auth.user?.id ?? null,
  projectLeadId: props.project.leadId ?? null,
  teamLeadId: props.project.team?.leadId ?? null,
}))

async function setStatus(statusId: string) {
  if (statusId === props.issue.statusId) return
  const rule = transitionRuleFor(props.project.workflowTransitions, props.issue.statusId)
  if (!canPerformTransition(rule, transitionActor.value)) {
    toast.error('You are not allowed to make this status change')
    return
  }
  if (rule?.requireAssignee && !props.issue.assigneeId) {
    toast.error('Assign someone before moving to this status')
    return
  }
  if (rule?.requireComment) {
    const from = props.project.statuses.find((status) => status.id === props.issue.statusId)?.name
    const to = props.project.statuses.find((status) => status.id === statusId)?.name
    const comment = await askTransitionComment(from, to)
    if (comment === null) return
    emit('update', { statusId, transitionComment: comment })
    return
  }
  setField('statusId', statusId)
}
</script>

<template>
  <div class="divide-y">
    <div class="pb-2">
      <IssueFieldRow v-if="showStatus" label="Status" for="field-status">
        <StatusSelect
          id="field-status"
          :model-value="issue.statusId"
          :statuses="project.statuses"
          :from-status-id="issue.statusId"
          :transitions="project.workflowTransitions"
          :transition-actor="transitionActor"
          size="sm"
          :disabled="!editable"
          @update:model-value="(value) => value && setStatus(value)"
        />
      </IssueFieldRow>
      <IssueFieldRow label="Assignee" for="field-assignee">
        <MemberSelect
          id="field-assignee"
          :model-value="issue.assigneeId"
          :members="assignableMembers"
          size="sm"
          :disabled="!editable"
          @update:model-value="(value) => setField('assigneeId', value)"
        />
      </IssueFieldRow>
      <IssueFieldRow label="Reporter" readonly>
        <span class="flex items-center gap-2"><UserAvatar :user="issue.reporter" size="xs" /> {{ issue.reporter?.name ?? 'Automation' }}</span>
      </IssueFieldRow>
      <IssueFieldRow label="Priority" for="field-priority">
        <PrioritySelect id="field-priority" :model-value="issue.priority" size="sm" :disabled="!editable" @update:model-value="(value) => setField('priority', value)" />
      </IssueFieldRow>
      <IssueFieldRow label="Type" for="field-type">
        <IssueTypeSelect
          id="field-type"
          :model-value="issue.type"
          :allow-subtask="Boolean(issue.parentId)"
          size="sm"
          :disabled="!editable"
          @update:model-value="(value) => setField('type', value)"
        />
      </IssueFieldRow>
      <IssueFieldRow v-if="issue.type !== 'epic' && issue.type !== 'subtask'" label="Epic" for="field-epic">
        <ParentEpicSelect
          id="field-epic"
          :model-value="issue.parentId"
          :project-id="project.id"
          size="sm"
          :disabled="!editable"
          @update:model-value="(value) => setField('parentId', value)"
        />
      </IssueFieldRow>
      <IssueFieldRow v-if="project.type === 'scrum' && issue.type !== 'epic'" label="Sprint" for="field-sprint">
        <SprintSelect id="field-sprint" :model-value="issue.sprintId" :sprints="sprints" size="sm" :disabled="!editable" @update:model-value="(value) => setField('sprintId', value)" />
      </IssueFieldRow>
      <IssueFieldRow label="Labels">
        <LabelMultiSelect
          :model-value="issue.labels.map((label) => label.id)"
          :labels="project.labels"
          :project-id="project.id"
          :disabled="!editable"
          @update:model-value="(value) => setField('labelIds', value)"
        />
      </IssueFieldRow>
    </div>

    <div v-if="customFields.length" class="py-2">
      <IssueFieldRow
        v-for="field in customFields"
        :key="field.id"
        :label="field.name"
        :for="`cf-${field.id}`"
        :readonly="field.type === 'checkbox' ? false : !canEditCustomFields && field.type !== 'url'"
      >
        <template v-if="field.type === 'text' || field.type === 'url'">
          <Input
            :id="`cf-${field.id}`"
            :model-value="typeof customValue(field) === 'string' ? (customValue(field) as string) : ''"
            class="h-8"
            :type="field.type === 'url' ? 'url' : 'text'"
            :placeholder="field.type === 'url' ? 'https://…' : '–'"
            :disabled="!canEditCustomFields"
            @blur="(event) => setCustomField(field.id, (event.target as HTMLInputElement).value.trim() || null)"
            @keydown.enter="(event) => ((event.target as HTMLInputElement).blur())"
          />
        </template>
        <template v-else-if="field.type === 'number'">
          <Input
            :id="`cf-${field.id}`"
            type="number"
            class="h-8"
            :model-value="customValue(field) == null ? '' : String(customValue(field))"
            placeholder="–"
            :disabled="!canEditCustomFields"
            @blur="
              (event) => {
                const text = (event.target as HTMLInputElement).value.trim()
                setCustomField(field.id, text === '' ? null : Number(text))
              }
            "
            @keydown.enter="(event) => ((event.target as HTMLInputElement).blur())"
          />
        </template>
        <template v-else-if="field.type === 'date'">
          <DatePicker
            :id="`cf-${field.id}`"
            :model-value="typeof customValue(field) === 'string' ? (customValue(field) as string) : ''"
            size="sm"
            placeholder="None"
            display-format="d MMM yyyy"
            :disabled="!canEditCustomFields"
            @update:model-value="(value) => setCustomField(field.id, value || null)"
          />
        </template>
        <template v-else-if="field.type === 'select'">
          <SelectField
            :id="`cf-${field.id}`"
            :model-value="typeof customValue(field) === 'string' ? (customValue(field) as string) : ''"
            :options="[{ value: '', label: 'None' }, ...field.options.map((option) => ({ value: option, label: option }))]"
            size="sm"
            :disabled="!canEditCustomFields"
            @update:model-value="(value) => setCustomField(field.id, value || null)"
          />
        </template>
        <template v-else-if="field.type === 'multi_select'">
          <div class="flex w-full flex-col gap-1.5">
            <label v-for="option in field.options" :key="option" class="flex items-center gap-2 text-sm">
              <Checkbox
                :model-value="Array.isArray(customValue(field)) && (customValue(field) as string[]).includes(option)"
                :disabled="!canEditCustomFields"
                @update:model-value="(value) => toggleMultiOption(field, option, value === true)"
              />
              {{ option }}
            </label>
          </div>
        </template>
        <template v-else-if="field.type === 'checkbox'">
          <Checkbox
            :id="`cf-${field.id}`"
            :model-value="Boolean(customValue(field))"
            :disabled="!canEditCustomFields"
            @update:model-value="(value) => setCustomField(field.id, value === true)"
          />
        </template>
      </IssueFieldRow>
    </div>

    <div class="py-2">
      <IssueFieldRow label="Story points" for="field-points">
        <NumberField id="field-points" v-model="storyPoints" :min="0" :max="100" size="sm" placeholder="–" :disabled="!editable" @commit="commitStoryPoints" />
      </IssueFieldRow>
      <IssueFieldRow label="Estimate" for="field-estimate">
        <Input
          id="field-estimate"
          v-model="estimate"
          placeholder="e.g. 2h 30m"
          class="h-8"
          :disabled="!editable"
          @focus="isEditingEstimate = true"
          @input="isEditingEstimate = true"
          @blur="commitEstimate"
          @keydown.enter="commitEstimate"
        />
      </IssueFieldRow>
      <IssueFieldRow label="Start date" for="field-start">
        <DatePicker
          id="field-start"
          :model-value="issue.startDate ?? ''"
          size="sm"
          placeholder="None"
          display-format="d MMM yyyy"
          :disabled="!editable"
          @update:model-value="(value) => emit('update', { startDate: value || null })"
        />
      </IssueFieldRow>
      <IssueFieldRow label="Due date" for="field-due">
        <DatePicker
          id="field-due"
          :model-value="issue.dueDate ?? ''"
          size="sm"
          placeholder="None"
          display-format="d MMM yyyy"
          :disabled="!editable"
          @update:model-value="(value) => emit('update', { dueDate: value || null })"
        />
      </IssueFieldRow>
      <IssueFieldRow label="Time tracking" readonly>
        <div class="w-full space-y-1">
          <Progress v-if="timeProgress !== null" :model-value="timeProgress" class="h-1.5" :indicator-class="timeProgress >= 100 ? 'bg-destructive' : 'bg-primary'" />
          <p class="text-xs text-muted-foreground">
            {{ formatMinutes(issue.timeSpentMinutes) }} logged
            <template v-if="issue.estimateMinutes"> of {{ formatMinutes(issue.estimateMinutes) }}</template>
          </p>
        </div>
      </IssueFieldRow>
    </div>

    <div class="pt-2">
      <IssueFieldRow label="Watchers" :readonly="!editable">
        <div class="w-full space-y-2">
          <ul v-if="issue.watchers.length" class="flex flex-wrap gap-1.5">
            <li
              v-for="watcher in issue.watchers"
              :key="watcher.id"
              class="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/40 py-0.5 pl-1 pr-1.5 text-xs"
            >
              <UserAvatar :user="watcher" size="xs" />
              <span class="max-w-28 truncate">{{ watcher.name }}</span>
              <button
                v-if="editable"
                type="button"
                class="rounded p-0.5 text-muted-foreground hover:bg-background hover:text-destructive"
                :aria-label="`Stop ${watcher.name} watching`"
                :disabled="isWatcherBusy"
                @click="removeWatcher(watcher.id)"
              >
                <X class="size-3" />
              </button>
            </li>
          </ul>
          <p v-else class="text-xs text-muted-foreground">Nobody yet</p>
          <div v-if="editable && watcherOptions.length" class="flex gap-2">
            <MemberSelect
              v-model="watcherCandidateId"
              class="min-w-0 flex-1"
              :members="watcherOptions"
              none-label="Add a watcher"
              size="sm"
              aria-label="Add a watcher"
            />
            <Button type="button" size="sm" variant="outline" :disabled="!watcherCandidateId || isWatcherBusy" @click="addWatcher">
              Add
            </Button>
          </div>
        </div>
      </IssueFieldRow>
      <IssueFieldRow label="Created" readonly><span class="text-xs text-muted-foreground">{{ formatDateTime(issue.createdAt) }}</span></IssueFieldRow>
      <IssueFieldRow label="Updated" readonly><span class="text-xs text-muted-foreground">{{ formatDateTime(issue.updatedAt) }}</span></IssueFieldRow>
      <IssueFieldRow v-if="issue.completedAt" label="Resolved" readonly>
        <span class="text-xs text-muted-foreground">{{ formatDateTime(issue.completedAt) }}</span>
      </IssueFieldRow>
    </div>
  </div>
</template>

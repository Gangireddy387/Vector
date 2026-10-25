<script setup lang="ts">
import { useDebounceFn } from '@vueuse/core'
import { computed, ref, watch } from 'vue'
import UserAvatar from '@/components/common/UserAvatar.vue'
import UserAvatarStack from '@/components/common/UserAvatarStack.vue'
import { DatePicker, NumberField } from '@/components/forms'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { formatDateTime } from '@/lib/format'
import { formatMinutes, parseDuration } from '@/lib/utils'
import type { IssueDetail, ProjectDetail, Sprint } from '@/types/models'
import type { UpdateIssueInput } from '../../api/issues.api'
import IssueTypeSelect from '../pickers/IssueTypeSelect.vue'
import LabelMultiSelect from '../pickers/LabelMultiSelect.vue'
import MemberSelect from '../pickers/MemberSelect.vue'
import PrioritySelect from '../pickers/PrioritySelect.vue'
import SprintSelect from '../pickers/SprintSelect.vue'
import StatusSelect from '../pickers/StatusSelect.vue'
import IssueFieldRow from './IssueFieldRow.vue'

const props = withDefaults(
  defineProps<{ issue: IssueDetail; project: ProjectDetail; sprints: Sprint[]; editable?: boolean; showStatus?: boolean }>(),
  { editable: true, showStatus: true },
)
const emit = defineEmits<{ update: [changes: UpdateIssueInput] }>()

const assignableMembers = computed(() => props.project.members.filter((member) => member.role !== 'viewer'))

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
</script>

<template>
  <div class="divide-y">
    <div class="pb-2">
      <IssueFieldRow v-if="showStatus" label="Status" for="field-status">
        <StatusSelect
          id="field-status"
          :model-value="issue.statusId"
          :statuses="project.statuses"
          size="sm"
          :disabled="!editable"
          @update:model-value="(value) => setField('statusId', value)"
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
      <IssueFieldRow label="Watchers" readonly>
        <UserAvatarStack v-if="issue.watchers.length" :users="issue.watchers" :max="6" />
        <span v-else class="text-xs text-muted-foreground">Nobody yet</span>
      </IssueFieldRow>
      <IssueFieldRow label="Created" readonly><span class="text-xs text-muted-foreground">{{ formatDateTime(issue.createdAt) }}</span></IssueFieldRow>
      <IssueFieldRow label="Updated" readonly><span class="text-xs text-muted-foreground">{{ formatDateTime(issue.updatedAt) }}</span></IssueFieldRow>
      <IssueFieldRow v-if="issue.completedAt" label="Resolved" readonly>
        <span class="text-xs text-muted-foreground">{{ formatDateTime(issue.completedAt) }}</span>
      </IssueFieldRow>
    </div>
  </div>
</template>

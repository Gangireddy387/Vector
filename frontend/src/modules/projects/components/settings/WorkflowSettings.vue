<script setup lang="ts">
import { ArrowDown, ArrowUp, GitBranch, Plus, Trash2 } from 'lucide-vue-next'
import { computed, reactive, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ColorField, NumberField, SelectField, type SelectFieldOption } from '@/components/forms'
import { Input } from '@/components/ui/input'
import { COLOR_SWATCHES, STATUS_CATEGORY_META } from '@/constants/issue'
import { getErrorMessage } from '@/lib/http'
import type { ProjectDetail, Status, StatusCategory } from '@/types/models'
import { projectsApi, type StatusInput } from '../../projects.api'
import { useProjectsStore } from '../../projects.store'

const props = defineProps<{ project: ProjectDetail }>()

const projects = useProjectsStore()
const CATEGORY_OPTIONS: SelectFieldOption[] = (Object.keys(STATUS_CATEGORY_META) as StatusCategory[]).map((category) => ({
  value: category,
  label: STATUS_CATEGORY_META[category].label,
  color: STATUS_CATEGORY_META[category].color,
}))
const newStatusName = ref('')
const newStatusCategory = ref<StatusCategory>('in_progress')
const deleting = ref<Status | null>(null)
const moveTarget = ref('')
const isSavingTransitions = ref(false)

type DraftRule = { enabled: boolean; toStatusIds: string[]; requireAssignee: boolean; requireComment: boolean }
const drafts = reactive<Record<string, DraftRule>>({})

function syncDrafts() {
  for (const status of props.project.statuses) {
    const existing = (props.project.workflowTransitions ?? []).find((rule) => rule.fromStatusId === status.id)
    drafts[status.id] = {
      enabled: Boolean(existing),
      toStatusIds: existing ? [...existing.toStatusIds] : props.project.statuses.filter((item) => item.id !== status.id).map((item) => item.id),
      requireAssignee: existing?.requireAssignee ?? false,
      requireComment: existing?.requireComment ?? false,
    }
  }
}

watch(
  () => [props.project.statuses, props.project.workflowTransitions] as const,
  () => syncDrafts(),
  { immediate: true, deep: true },
)

const hasRestricted = computed(() => Object.values(drafts).some((draft) => draft?.enabled))

const refresh = () => projects.fetchProject(props.project.id, true)

async function run(task: () => Promise<unknown>) {
  try {
    await task()
    await refresh()
  } catch (error) {
    toast.error(getErrorMessage(error))
  }
}

const updateStatus = (status: Status, changes: Partial<StatusInput>) => run(() => projectsApi.updateStatus(props.project.id, status.id, changes))

function commitName(status: Status, event: Event) {
  const name = (event.target as HTMLInputElement).value.trim()
  if (name && name !== status.name) void updateStatus(status, { name })
}

function commitWipLimit(status: Status, raw: string) {
  const wipLimit = raw ? Number.parseInt(raw, 10) : null
  if (wipLimit !== status.wipLimit) void updateStatus(status, { wipLimit })
}

function move(index: number, direction: -1 | 1) {
  const ids = props.project.statuses.map((status) => status.id)
  const target = index + direction
  if (target < 0 || target >= ids.length) return
  ;[ids[index], ids[target]] = [ids[target]!, ids[index]!]
  void run(() => projectsApi.reorderStatuses(props.project.id, ids))
}

function addStatus() {
  if (!newStatusName.value.trim()) return
  const color = COLOR_SWATCHES[props.project.statuses.length % COLOR_SWATCHES.length]
  void run(async () => {
    await projectsApi.createStatus(props.project.id, { name: newStatusName.value.trim(), category: newStatusCategory.value, color })
    newStatusName.value = ''
  })
}

function askDelete(status: Status) {
  deleting.value = status
  moveTarget.value = props.project.statuses.find((item) => item.id !== status.id)?.id ?? ''
}

async function confirmDelete() {
  const status = deleting.value
  if (!status) return
  await run(() => projectsApi.removeStatus(props.project.id, status.id, moveTarget.value))
  deleting.value = null
}

function toggleTarget(fromId: string, toId: string, on: boolean) {
  const draft = drafts[fromId]
  if (!draft) return
  draft.toStatusIds = on ? [...new Set([...draft.toStatusIds, toId])] : draft.toStatusIds.filter((id) => id !== toId)
}

async function saveTransitions() {
  isSavingTransitions.value = true
  try {
    const rules = props.project.statuses
      .filter((status) => drafts[status.id]?.enabled)
      .map((status) => {
        const draft = drafts[status.id]!
        return {
          fromStatusId: status.id,
          toStatusIds: draft.toStatusIds,
          requireAssignee: draft.requireAssignee,
          requireComment: draft.requireComment,
        }
      })
    await projectsApi.saveWorkflowTransitions(props.project.id, rules)
    await refresh()
    toast.success(rules.length ? 'Transition rules saved' : 'Workflow is unrestricted again')
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    isSavingTransitions.value = false
  }
}
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle>Workflow</CardTitle>
      <CardDescription>Board columns in order. The category drives reports and automation (e.g. “done” sets the resolved date).</CardDescription>
    </CardHeader>
    <CardContent class="space-y-4">
      <ul class="divide-y border">
        <li v-for="(status, index) in project.statuses" :key="status.id" class="flex flex-wrap items-center gap-2 p-2.5">
          <div class="flex flex-col">
            <Button variant="ghost" size="icon-sm" class="size-6" :disabled="index === 0" aria-label="Move up" @click="move(index, -1)"><ArrowUp /></Button>
            <Button variant="ghost" size="icon-sm" class="size-6" :disabled="index === project.statuses.length - 1" aria-label="Move down" @click="move(index, 1)">
              <ArrowDown />
            </Button>
          </div>
          <ColorField
            :model-value="status.color"
            size="sm"
            compact
            :aria-label="`${status.name} colour`"
            @change="(color) => updateStatus(status, { color })"
          />
          <Input :model-value="status.name" class="h-8 min-w-36 flex-1" :aria-label="`${status.name} name`" @blur="(event: Event) => commitName(status, event)" />
          <SelectField
            :model-value="status.category"
            :options="CATEGORY_OPTIONS"
            size="sm"
            class="w-40"
            aria-label="Category"
            @update:model-value="(value) => value && updateStatus(status, { category: value as StatusCategory })"
          />
          <NumberField
            :model-value="status.wipLimit?.toString() ?? ''"
            :min="1"
            :max="999"
            size="sm"
            placeholder="No limit"
            class="w-36"
            :aria-label="`${status.name} WIP limit`"
            @commit="(value) => commitWipLimit(status, value)"
          />
          <Button variant="ghost" size="icon-sm" :disabled="project.statuses.length <= 1" :aria-label="`Delete ${status.name}`" @click="askDelete(status)">
            <Trash2 />
          </Button>
        </li>
      </ul>

      <form class="flex flex-col gap-2 sm:flex-row" @submit.prevent="addStatus">
        <Input v-model="newStatusName" placeholder="New status, e.g. QA" class="flex-1" aria-label="New status name" />
        <SelectField
          :model-value="newStatusCategory"
          :options="CATEGORY_OPTIONS"
          class="sm:w-44"
          aria-label="New status category"
          @update:model-value="(value) => value && (newStatusCategory = value as StatusCategory)"
        />
        <Button type="submit" :disabled="!newStatusName.trim()"><Plus /> Add status</Button>
      </form>
    </CardContent>
  </Card>

  <Card>
    <CardHeader>
      <CardTitle class="flex items-center gap-2"><GitBranch class="size-4" /> Transitions</CardTitle>
      <CardDescription>
        Limit which columns a task may move to. Statuses without a rule stay unrestricted. Leave everything off for free movement.
      </CardDescription>
    </CardHeader>
    <CardContent class="space-y-4">
      <ul class="space-y-3">
        <li v-for="status in project.statuses" :key="`tr-${status.id}`" class="rounded-md border p-3">
          <label class="mb-2 flex items-center gap-2 text-sm font-medium">
            <Checkbox
              :model-value="drafts[status.id]?.enabled ?? false"
              @update:model-value="(value) => drafts[status.id] && (drafts[status.id]!.enabled = value === true)"
            />
            Restrict moves from {{ status.name }}
          </label>
          <div v-if="drafts[status.id]?.enabled" class="space-y-3 pl-6">
            <div class="flex flex-wrap gap-3">
              <label
                v-for="target in project.statuses.filter((item) => item.id !== status.id)"
                :key="target.id"
                class="flex items-center gap-2 text-sm"
              >
                <Checkbox
                  :model-value="drafts[status.id]?.toStatusIds.includes(target.id)"
                  @update:model-value="(value) => toggleTarget(status.id, target.id, value === true)"
                />
                {{ target.name }}
              </label>
            </div>
            <div class="flex flex-wrap gap-4 text-sm">
              <label class="flex items-center gap-2">
                <Checkbox
                  :model-value="drafts[status.id]?.requireAssignee ?? false"
                  @update:model-value="(value) => drafts[status.id] && (drafts[status.id]!.requireAssignee = value === true)"
                />
                Require assignee
              </label>
              <label class="flex items-center gap-2">
                <Checkbox
                  :model-value="drafts[status.id]?.requireComment ?? false"
                  @update:model-value="(value) => drafts[status.id] && (drafts[status.id]!.requireComment = value === true)"
                />
                Require comment
              </label>
            </div>
          </div>
        </li>
      </ul>
      <Button type="button" :loading="isSavingTransitions" @click="saveTransitions">
        Save transitions
        <span v-if="!hasRestricted" class="ml-1 font-normal opacity-70">(clear all)</span>
      </Button>
    </CardContent>
  </Card>

  <Dialog :open="Boolean(deleting)" @update:open="(open: boolean) => !open && (deleting = null)">
    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Delete “{{ deleting?.name }}”?</DialogTitle>
        <DialogDescription>Tasks in this status will be moved to the status you choose.</DialogDescription>
      </DialogHeader>
      <SelectField
        :model-value="moveTarget"
        :options="project.statuses.filter((item) => item.id !== deleting?.id).map((status) => ({ value: status.id, label: status.name, color: status.color }))"
        aria-label="Move tasks to"
        @update:model-value="(value) => value && (moveTarget = value)"
      />
      <DialogFooter>
        <Button variant="outline" @click="deleting = null">Cancel</Button>
        <Button variant="destructive" @click="confirmDelete">Delete status</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

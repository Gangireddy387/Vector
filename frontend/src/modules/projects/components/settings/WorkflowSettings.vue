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
import { TRANSITION_ACTOR_META, type TransitionActor } from '@/lib/workflow-transitions'
import type { ProjectDetail, Status, StatusCategory } from '@/types/models'
import { projectsApi, type StatusInput } from '../../projects.api'
import { useProjectsStore } from '../../projects.store'
import WorkflowGraph from './WorkflowGraph.vue'

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

const ACTOR_GROUPS: Array<{ key: string; label: string; actors: TransitionActor[] }> = [
  { key: 'admin', label: 'Admins', actors: ['admin'] },
  { key: 'leads', label: 'Leads (within members)', actors: ['scrum_master', 'team_lead'] },
  { key: 'members', label: 'Everyone else', actors: ['member', 'viewer'] },
]

type DraftRule = {
  enabled: boolean
  toStatusIds: string[]
  requireAssignee: boolean
  requireComment: boolean
  allowedRoles: TransitionActor[]
}
const drafts = reactive<Record<string, DraftRule>>({})

function syncDrafts() {
  for (const status of props.project.statuses) {
    const existing = (props.project.workflowTransitions ?? []).find((rule) => rule.fromStatusId === status.id)
    drafts[status.id] = {
      enabled: Boolean(existing),
      toStatusIds: existing ? [...existing.toStatusIds] : props.project.statuses.filter((item) => item.id !== status.id).map((item) => item.id),
      requireAssignee: existing?.requireAssignee ?? false,
      requireComment: existing?.requireComment ?? false,
      allowedRoles: existing?.allowedRoles?.length ? ([...existing.allowedRoles] as TransitionActor[]) : [],
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

function toggleActor(fromId: string, actor: TransitionActor, on: boolean) {
  const draft = drafts[fromId]
  if (!draft) return
  draft.allowedRoles = on ? [...new Set([...draft.allowedRoles, actor])] : draft.allowedRoles.filter((item) => item !== actor)
}

function enableAllTargets(fromId: string) {
  const draft = drafts[fromId]
  if (!draft) return
  draft.toStatusIds = props.project.statuses.filter((item) => item.id !== fromId).map((item) => item.id)
}

function clearActors(fromId: string) {
  const draft = drafts[fromId]
  if (!draft) return
  draft.allowedRoles = []
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
          allowedRoles: draft.allowedRoles,
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

function actorSummary(fromId: string) {
  const roles = drafts[fromId]?.allowedRoles ?? []
  if (!roles.length) return 'Anyone who can edit'
  return roles.map((role) => TRANSITION_ACTOR_META[role].label).join(', ')
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
        Limit which columns a task may move to, who can move them (admins, scrum master, team lead, members), and whether a comment or assignee is required.
      </CardDescription>
    </CardHeader>
    <CardContent class="space-y-4">
      <WorkflowGraph :statuses="project.statuses" :transitions="project.workflowTransitions ?? []" :drafts="drafts" />

      <ul class="space-y-3">
        <li v-for="status in project.statuses" :key="`tr-${status.id}`" class="rounded-lg border bg-card/40">
          <label class="flex cursor-pointer items-start gap-3 p-3">
            <Checkbox
              class="mt-0.5"
              :model-value="drafts[status.id]?.enabled ?? false"
              @update:model-value="(value) => drafts[status.id] && (drafts[status.id]!.enabled = value === true)"
            />
            <span class="min-w-0 flex-1">
              <span class="flex flex-wrap items-center gap-2 text-sm font-medium">
                <span class="size-2.5 rounded-full" :style="{ backgroundColor: status.color }" />
                Restrict moves from {{ status.name }}
              </span>
              <span v-if="drafts[status.id]?.enabled" class="mt-0.5 block text-xs text-muted-foreground">
                {{ drafts[status.id]!.toStatusIds.length }} destination{{ drafts[status.id]!.toStatusIds.length === 1 ? '' : 's' }}
                · {{ actorSummary(status.id) }}
                <template v-if="drafts[status.id]!.requireAssignee"> · assignee required</template>
                <template v-if="drafts[status.id]!.requireComment"> · comment required</template>
              </span>
              <span v-else class="mt-0.5 block text-xs text-muted-foreground">Unrestricted — any editable move is allowed</span>
            </span>
          </label>

          <div v-if="drafts[status.id]?.enabled" class="space-y-4 border-t px-3 pb-3 pt-3 sm:pl-10">
            <section class="space-y-2">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Allowed destinations</p>
                <button type="button" class="text-xs text-primary hover:underline" @click="enableAllTargets(status.id)">Select all</button>
              </div>
              <div class="grid gap-2 sm:grid-cols-2">
                <label
                  v-for="target in project.statuses.filter((item) => item.id !== status.id)"
                  :key="target.id"
                  class="flex items-center gap-2 rounded-md border bg-background/50 px-2.5 py-2 text-sm"
                >
                  <Checkbox
                    :model-value="drafts[status.id]?.toStatusIds.includes(target.id)"
                    @update:model-value="(value) => toggleTarget(status.id, target.id, value === true)"
                  />
                  <span class="size-2 rounded-full" :style="{ backgroundColor: target.color }" />
                  {{ target.name }}
                </label>
              </div>
            </section>

            <section class="space-y-2">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Who can move</p>
                <button type="button" class="text-xs text-muted-foreground hover:underline" @click="clearActors(status.id)">Clear (anyone)</button>
              </div>
              <div class="space-y-3 rounded-md border bg-background/50 p-3">
                <div v-for="group in ACTOR_GROUPS" :key="group.key" class="space-y-2">
                  <p class="text-[11px] font-medium text-muted-foreground">{{ group.label }}</p>
                  <div class="grid gap-2 sm:grid-cols-2">
                    <label
                      v-for="actor in group.actors"
                      :key="actor"
                      class="flex items-start gap-2 rounded-md border border-transparent px-2 py-1.5 text-sm hover:border-border hover:bg-muted/40"
                    >
                      <Checkbox
                        class="mt-0.5"
                        :model-value="drafts[status.id]?.allowedRoles.includes(actor)"
                        @update:model-value="(value) => toggleActor(status.id, actor, value === true)"
                      />
                      <span>
                        <span class="font-medium">{{ TRANSITION_ACTOR_META[actor].label }}</span>
                        <span class="block text-[11px] text-muted-foreground">{{ TRANSITION_ACTOR_META[actor].hint }}</span>
                      </span>
                    </label>
                  </div>
                </div>
              </div>
              <p class="text-[11px] text-muted-foreground">
                Leave all unchecked to allow any project member who can edit. Scrum master is the project lead; team lead is the owning team’s lead.
              </p>
            </section>

            <section class="space-y-2">
              <p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Requirements</p>
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
            </section>
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

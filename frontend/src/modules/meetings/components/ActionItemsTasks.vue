<script setup lang="ts">
import { CircleCheck, ListTodo, SquareArrowOutUpRight } from 'lucide-vue-next'
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { toast } from 'vue-sonner'
import { DatePicker, SelectField, type SelectFieldOption } from '@/components/forms'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { getErrorMessage } from '@/lib/http'
import { useProjectsStore } from '@/modules/projects/projects.store'
import { useUiStore } from '@/stores/ui.store'
import { type Meeting, type MeetingActionItem, type MeetingSummary, meetingsApi } from '../meetings.api'

/**
 * The summary's action items, ready to become tasks: pick which, check the title, owner and due date, choose the
 * project, and create them in one go. Items that already became tasks link to them.
 */
const props = defineProps<{ meeting: Meeting; summary: MeetingSummary; /** Pulse Create when deep-linked from Home */ highlight?: boolean }>()
const emit = defineEmits<{ summary: [summary: MeetingSummary] }>()
const projects = useProjectsStore()
const ui = useUiStore()
const NOBODY = 'nobody'

/** Two weekdays ahead when the AI left no due date. */
function defaultDueDate() {
  const d = new Date()
  let added = 0
  while (added < 2) {
    d.setDate(d.getDate() + 1)
    const day = d.getDay()
    if (day !== 0 && day !== 6) added += 1
  }
  return d.toISOString().slice(0, 10)
}

interface Row {
  chosen: boolean
  title: string
  assigneeId: string
  dueDate: string
}

const rows = reactive<Record<number, Row>>({})
const projectId = ref<string | null>(props.meeting.context?.type === 'project' ? props.meeting.context.id : null)
const isCreating = ref(false)

function prepare() {
  const fallbackDue = defaultDueDate()
  props.summary.actionItems.forEach((item, index) => {
    if (rows[index]) return
    rows[index] = {
      chosen: !item.issue,
      title: item.text,
      assigneeId: item.ownerId ?? NOBODY,
      dueDate: item.due ?? fallbackDue,
    }
  })
}
watch(() => props.summary, prepare, { immediate: true })

onMounted(async () => {
  await projects.fetchProjects().catch(() => undefined)
  projectId.value ??= projects.projects.find((project) => !project.archivedAt)?.id ?? null
})

const projectOptions = computed<SelectFieldOption[]>(() => projects.projects.filter((project) => !project.archivedAt).map((project) => ({ value: project.id, label: `${project.name} · ${project.key}` })))
const peopleOptions = computed<SelectFieldOption[]>(() => {
  const people = [...(props.meeting.host ? [props.meeting.host] : []), ...props.meeting.participants]
  const unique = people.filter((person, index) => people.findIndex((other) => other.id === person.id) === index)
  return [{ value: NOBODY, label: 'Unassigned' }, ...unique.map((person) => ({ value: person.id, label: person.name }))]
})

const open = computed(() => props.summary.actionItems.map((item, index) => ({ item, index })).filter(({ item }) => !item.issue))
const done = computed(() => props.summary.actionItems.filter((item): item is MeetingActionItem & { issue: NonNullable<MeetingActionItem['issue']> } => Boolean(item.issue)))
const chosenCount = computed(() => open.value.filter(({ index }) => rows[index]?.chosen && rows[index]?.title.trim()).length)
const creatingIndex = ref<number | null>(null)

async function createItems(indexes: number[]) {
  if (!projectId.value) return toast.error('Choose the project for the tasks')
  const items = open.value
    .filter(({ index }) => indexes.includes(index) && rows[index]?.title.trim())
    .map(({ item, index }) => {
      const row = rows[index]!
      return {
        index,
        title: row.title.trim(),
        assigneeId: row.assigneeId === NOBODY ? null : row.assigneeId,
        dueDate: row.dueDate || null,
        priority: item.priority ?? null,
      }
    })
  if (!items.length) return
  isCreating.value = true
  if (indexes.length === 1) creatingIndex.value = indexes[0]!
  try {
    const result = await meetingsApi.createTasks(props.meeting.id, { projectId: projectId.value, items })
    emit('summary', result.summary)
    ui.notifyIssuesChanged()
    toast.success(`Created ${result.created.length} ${result.created.length === 1 ? 'task' : 'tasks'}`, {
      description: [
        result.created.map((task) => task.key).join(', '),
        result.unassigned.length ? 'Some owners are not in that project, so those tasks are unassigned.' : 'Owners and due dates applied.',
      ]
        .filter(Boolean)
        .join(' · '),
    })
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    isCreating.value = false
    creatingIndex.value = null
  }
}

function create() {
  void createItems(open.value.filter(({ index }) => rows[index]?.chosen && rows[index]?.title.trim()).map(({ index }) => index))
}

function createOne(index: number) {
  void createItems([index])
}
</script>

<template>
  <div id="meeting-action-items" class="scroll-mt-24 space-y-2">
    <h3 class="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><ListTodo class="size-3.5" /> Action items</h3>
    <ul class="space-y-1 text-sm">
      <li v-for="item in done" :key="item.issue.id" class="flex items-center gap-2">
        <CircleCheck class="size-4 shrink-0 text-emerald-600" />
        <span class="min-w-0 flex-1 truncate">{{ item.text }}<span v-if="item.owner" class="text-muted-foreground"> · {{ item.owner }}</span></span>
        <RouterLink :to="`/issues/${item.issue.key}`" class="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary hover:underline">
          {{ item.issue.key }} <SquareArrowOutUpRight class="size-3" />
        </RouterLink>
      </li>
    </ul>

    <div
      v-if="open.length"
      class="space-y-2 border bg-muted/20 p-3"
      :class="highlight ? 'border-primary ring-2 ring-primary/20' : 'border-border/70'"
    >
      <p v-if="highlight" class="text-xs font-medium text-primary">Turn these into owned tasks — review, then create.</p>
      <div
        v-for="{ item, index } in open"
        :key="index"
        class="grid gap-2 sm:grid-cols-[auto_1fr_10rem_9.5rem_auto] sm:items-center"
      >
        <Checkbox v-if="rows[index]" v-model="rows[index].chosen" :aria-label="`Include ${item.text} in batch create`" />
        <Input v-if="rows[index]" v-model="rows[index].title" class="h-8 text-sm" maxlength="255" :disabled="!rows[index].chosen" :aria-label="`Title for ${item.text}`" />
        <SelectField
          v-if="rows[index]"
          :model-value="rows[index].assigneeId"
          :options="peopleOptions"
          :disabled="!rows[index].chosen"
          aria-label="Owner"
          class="h-8"
          @update:model-value="(value) => rows[index] && (rows[index].assigneeId = value ?? NOBODY)"
        />
        <DatePicker v-if="rows[index]" v-model="rows[index].dueDate" :disabled="!rows[index].chosen" aria-label="Due date" />
        <Button
          v-if="rows[index]"
          type="button"
          variant="outline"
          size="sm"
          class="justify-self-start sm:justify-self-end"
          :loading="creatingIndex === index"
          :disabled="isCreating || !projectId || !rows[index].title.trim()"
          @click="createOne(index)"
        >
          Create task
        </Button>
      </div>
      <div class="flex flex-wrap items-center gap-2 border-t border-border/60 pt-2">
        <span class="text-xs text-muted-foreground">Create in</span>
        <SelectField
          :model-value="projectId"
          :options="projectOptions"
          class="w-60"
          aria-label="Project for the tasks"
          placeholder="Choose a project"
          @update:model-value="(value) => (projectId = value ?? null)"
        />
        <Button
          variant="brand"
          size="sm"
          class="ml-auto"
          :class="highlight && 'ring-2 ring-primary/40'"
          :loading="isCreating"
          :disabled="!chosenCount || !projectId"
          @click="create"
        >
          <ListTodo /> Create {{ chosenCount }} {{ chosenCount === 1 ? 'task' : 'tasks' }}
        </Button>
      </div>
    </div>
  </div>
</template>

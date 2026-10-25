<script setup lang="ts">
import { useStorage } from '@vueuse/core'
import { LayoutTemplate, ListChecks, Plus, Sparkles, X } from 'lucide-vue-next'
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import FormField from '@/components/common/FormField.vue'
import { DatePicker, NumberField, SelectField, type SelectFieldOption } from '@/components/forms'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { getErrorMessage } from '@/lib/http'
import { parseQuickAdd } from '@/lib/quick-add-parser'
import { useAuthStore } from '@/modules/auth/auth.store'
import { templatesApi } from '@/modules/automation/automation.api'
import { useProjectsStore } from '@/modules/projects/projects.store'
import { sprintsApi } from '@/modules/sprints/sprints.api'
import type { CreateIssueDefaults } from '@/stores/ui.store'
import type { IssueDetail, IssuePriority, IssueTemplate, IssueType, Sprint } from '@/types/models'
import { aiApi } from '../api/ai.api'
import { type CreateIssueInput, issuesApi } from '../api/issues.api'
import IssueTypeSelect from './pickers/IssueTypeSelect.vue'
import LabelMultiSelect from './pickers/LabelMultiSelect.vue'
import MemberSelect from './pickers/MemberSelect.vue'
import PrioritySelect from './pickers/PrioritySelect.vue'
import SprintSelect from './pickers/SprintSelect.vue'
import StatusSelect from './pickers/StatusSelect.vue'
import QuickAddSyntaxHelp from './QuickAddSyntaxHelp.vue'
import QuickAddTokens from './QuickAddTokens.vue'

const props = withDefaults(defineProps<{ defaults?: CreateIssueDefaults; compact?: boolean }>(), {
  defaults: () => ({}),
  compact: false,
})
const emit = defineEmits<{ created: [issue: IssueDetail]; cancel: [] }>()

const auth = useAuthStore()
const projects = useProjectsStore()

const lastProjectId = useStorage<string | null>('vector.lastProjectId', null)
const createAnother = useStorage('vector.createAnother', false)

const projectId = ref(
  props.defaults.projectId ??
    (projects.activeProjects.some((project) => project.id === lastProjectId.value) ? lastProjectId.value : null) ??
    projects.activeProjects[0]?.id ??
    '',
)
const title = ref(props.defaults.title ?? '')
const form = reactive({
  type: (props.defaults.type ?? (props.defaults.parentId ? 'subtask' : 'task')) as IssueType,
  priority: (props.defaults.priority ?? 'medium') as IssuePriority,
  statusId: props.defaults.statusId ?? '',
  assigneeId: (props.defaults.assigneeId ?? null) as string | null,
  sprintId: (props.defaults.sprintId ?? null) as string | null,
  dueDate: props.defaults.dueDate ?? '',
  storyPoints: props.defaults.storyPoints?.toString() ?? '',
  labelIds: [...(props.defaults.labelIds ?? [])],
  description: props.defaults.description ?? '',
})
const assigneeTouched = ref(props.defaults.assigneeId !== undefined)
const subtasks = ref<string[]>([])
const newSubtask = ref('')
const templates = ref<IssueTemplate[]>([])
const sprints = ref<Sprint[]>([])
const selectedTemplateId = ref<string>('')
const isSubmitting = ref(false)
const isDrafting = ref(false)
const isAiEnabled = ref(false)
const errorMessage = ref('')
const titleInput = ref<InstanceType<typeof Input> | null>(null)

const project = computed(() => (projectId.value ? projects.details[projectId.value] : undefined))
const projectOptions = computed<SelectFieldOption[]>(() =>
  projects.activeProjects.map((item) => ({ value: item.id, label: item.name, description: item.key, color: item.color })),
)
const templateOptions = computed<SelectFieldOption[]>(() => [
  { value: null, label: 'No template', icon: LayoutTemplate },
  ...templates.value.map((template) => ({ value: template.id, label: template.name, icon: LayoutTemplate, description: template.issueType })),
])
const members = computed(() => project.value?.members.filter((member) => member.role !== 'viewer') ?? [])
const parsed = computed(() =>
  parseQuickAdd(title.value, { members: members.value, labels: project.value?.labels ?? [], currentUserId: auth.user?.id }),
)
const autoAssignHint = computed(() => {
  const strategy = project.value?.settings.autoAssign
  if (!strategy || strategy === 'none' || assigneeTouched.value || parsed.value.assigneeId !== undefined) return ''
  return `Auto-assigned (${strategy.replace(/_/g, ' ')}) if left empty`
})

async function loadProjectContext(id: string) {
  if (!id) return
  lastProjectId.value = id
  const detail = await projects.fetchProject(id)
  if (!form.statusId || !detail.statuses.some((status) => status.id === form.statusId)) form.statusId = detail.statuses[0]?.id ?? ''
  const [projectTemplates, projectSprints] = await Promise.all([
    templatesApi.list(id),
    detail.type === 'scrum' ? sprintsApi.list(id) : Promise.resolve([]),
  ])
  templates.value = projectTemplates
  sprints.value = projectSprints
}

watch(
  () => projects.activeProjects,
  (list) => {
    if (projectId.value || !list.length) return
    projectId.value = list.some((project) => project.id === lastProjectId.value) ? lastProjectId.value! : list[0]!.id
  },
  { immediate: true },
)

watch(projectId, (id, previous) => {
  if (previous) {
    form.labelIds = []
    form.assigneeId = null
    form.sprintId = null
    selectedTemplateId.value = ''
  }
  void loadProjectContext(id)
}, { immediate: true })

onMounted(async () => {
  isAiEnabled.value = (await aiApi.status().catch(() => ({ enabled: false }))).enabled
  await nextTick()
  ;(titleInput.value?.$el as HTMLInputElement | undefined)?.focus()
})

function applyTemplate(templateId: string) {
  const template = templates.value.find((item) => item.id === templateId)
  if (!template) return
  form.type = template.issueType
  form.priority = template.priority
  if (!form.description.trim()) form.description = template.body ?? ''
  if (template.storyPoints !== null) form.storyPoints = String(template.storyPoints)
  form.labelIds = [...new Set([...form.labelIds, ...template.labelIds])]
  subtasks.value = [...new Set([...subtasks.value, ...template.subtaskTitles])]
}
watch(selectedTemplateId, applyTemplate)

async function draftWithAi() {
  if (!parsed.value.title || !projectId.value) {
    errorMessage.value = 'Write a short title first, then let the assistant fill in the rest.'
    return
  }
  isDrafting.value = true
  errorMessage.value = ''
  try {
    const draft = await aiApi.draftIssue({ projectId: projectId.value, title: parsed.value.title, description: form.description || null })
    form.type = draft.type
    form.priority = draft.priority
    form.storyPoints = String(draft.storyPoints)
    form.description = draft.description
    form.labelIds = [...new Set([...form.labelIds, ...draft.labelIds])]
    subtasks.value = draft.subtasks
    toast.success(draft.source === 'openai' ? 'Drafted with AI' : 'Drafted with smart suggestions', {
      description: draft.source === 'heuristic' ? 'Add an OpenAI key on the server for richer drafts.' : undefined,
    })
  } catch (error) {
    errorMessage.value = getErrorMessage(error)
  } finally {
    isDrafting.value = false
  }
}

function addSubtask() {
  const value = newSubtask.value.trim()
  if (value) subtasks.value.push(value)
  newSubtask.value = ''
}

function buildPayload(): CreateIssueInput {
  const result = parsed.value
  const template = templates.value.find((item) => item.id === selectedTemplateId.value)
  const prefix = template?.titlePrefix && !result.title.startsWith(template.titlePrefix) ? `${template.titlePrefix} ` : ''
  const storyPoints = result.storyPoints ?? (form.storyPoints === '' ? null : Number(form.storyPoints))

  const payload: CreateIssueInput = {
    projectId: projectId.value,
    title: `${prefix}${result.title}`,
    type: result.type ?? form.type,
    priority: result.priority ?? form.priority,
    statusId: form.statusId || undefined,
    description: form.description.trim() || null,
    dueDate: result.dueDate ?? (form.dueDate || null),
    storyPoints: Number.isFinite(storyPoints) ? storyPoints : null,
    labelIds: [...new Set([...form.labelIds, ...result.labelIds])],
    subtaskTitles: subtasks.value,
  }
  if (project.value?.type === 'scrum') payload.sprintId = form.sprintId
  if (props.defaults.parentId) payload.parentId = props.defaults.parentId
  if (result.assigneeId !== undefined) payload.assigneeId = result.assigneeId
  else if (assigneeTouched.value || form.assigneeId) payload.assigneeId = form.assigneeId
  return payload
}

async function submit() {
  if (!parsed.value.title) {
    errorMessage.value = 'Give the issue a title'
    return
  }
  isSubmitting.value = true
  errorMessage.value = ''
  try {
    const issue = await issuesApi.create(buildPayload())
    emit('created', issue)
    if (createAnother.value) {
      title.value = ''
      subtasks.value = []
      form.description = ''
      await nextTick()
      ;(titleInput.value?.$el as HTMLInputElement | undefined)?.focus()
    }
  } catch (error) {
    errorMessage.value = getErrorMessage(error)
  } finally {
    isSubmitting.value = false
  }
}

defineExpose({ createAnother })
</script>

<template>
  <form
    class="flex min-h-full flex-col"
    novalidate
    @submit.prevent="submit"
    @keydown.ctrl.enter.prevent="submit"
    @keydown.meta.enter.prevent="submit"
  >
    <div class="mx-auto grid w-full max-w-6xl flex-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-4" :class="compact ? 'p-3' : 'px-5 pt-3 pb-5'">
      <!-- What: title, description, sub-tasks -->
      <section class="space-y-5 border border-border/70 bg-card p-4 shadow-soft sm:p-5" aria-label="Issue content">
        <div class="grid gap-2">
          <div class="flex items-center justify-between gap-2">
            <label for="create-title" class="text-sm font-medium">Title</label>
            <div class="flex items-center gap-1">
              <Button type="button" variant="ghost" size="xs" :loading="isDrafting" @click="draftWithAi">
                <Sparkles class="text-primary" /> {{ isAiEnabled ? 'Draft with AI' : 'Smart draft' }}
              </Button>
              <QuickAddSyntaxHelp />
            </div>
          </div>
          <Input
            id="create-title"
            ref="titleInput"
            v-model="title"
            class="h-12 text-base font-medium md:text-base"
            placeholder="e.g. Fix checkout crash @me #backend !high ^fri ~3"
            autocomplete="off"
            enterkeyhint="done"
          />
          <p v-if="!parsed.tokens.length" class="text-xs text-muted-foreground">
            Type naturally — @assignee, #label, !priority, ^due and ~points are picked up automatically.
          </p>
          <QuickAddTokens :tokens="parsed.tokens" />
        </div>

        <FormField label="Description" for="create-description" optional hint="Markdown supported: **bold**, lists, - [ ] checklists.">
          <Textarea
            id="create-description"
            v-model="form.description"
            :rows="compact ? 6 : 12"
            class="min-h-40 resize-y"
            placeholder="Add context, acceptance criteria, links…"
          />
        </FormField>

        <div class="grid gap-2">
          <div class="flex items-center gap-2">
            <ListChecks class="size-4 text-muted-foreground" />
            <span class="text-sm font-medium">Sub-tasks</span>
            <span class="text-xs text-muted-foreground">{{ subtasks.length }}</span>
          </div>
          <ul v-if="subtasks.length" class="divide-y border">
            <li v-for="(subtask, index) in subtasks" :key="`${subtask}-${index}`" class="flex items-center gap-2 px-3 py-2 text-sm">
              <span class="size-1.5 shrink-0 rounded-full bg-muted-foreground/50" />
              <span class="min-w-0 flex-1 truncate">{{ subtask }}</span>
              <button
                type="button"
                class="text-muted-foreground hover:text-destructive"
                :aria-label="`Remove ${subtask}`"
                @click="subtasks.splice(index, 1)"
              >
                <X class="size-4" />
              </button>
            </li>
          </ul>
          <div class="flex gap-2">
            <Input v-model="newSubtask" placeholder="Add a sub-task and press Enter" @keydown.enter.prevent="addSubtask" />
            <Button type="button" variant="outline" :disabled="!newSubtask.trim()" @click="addSubtask"><Plus /> Add</Button>
          </div>
        </div>
      </section>

      <!-- Where & who: project and fields -->
      <aside class="border border-border/70 bg-card shadow-soft lg:sticky lg:top-6" aria-label="Issue details">
        <h2 class="border-b px-4 py-3 text-sm font-semibold">Details</h2>
        <div class="grid gap-4 p-4" :class="compact && 'sm:grid-cols-2'">
          <FormField label="Project" for="create-project">
            <SelectField
              id="create-project"
              :model-value="projectId"
              :options="projectOptions"
              placeholder="Choose a project"
              aria-label="Project"
              @update:model-value="(value) => value && (projectId = value)"
            />
          </FormField>
          <FormField v-if="templates.length" label="Template" for="create-template">
            <SelectField
              id="create-template"
              :model-value="selectedTemplateId || null"
              :options="templateOptions"
              aria-label="Template"
              @update:model-value="(value) => (selectedTemplateId = value ?? '')"
            />
          </FormField>
          <div class="grid grid-cols-2 gap-3" :class="compact && 'sm:col-span-2'">
            <FormField label="Type" for="create-type">
              <IssueTypeSelect id="create-type" v-model="form.type" :allow-subtask="Boolean(defaults.parentId)" />
            </FormField>
            <FormField label="Priority" for="create-priority">
              <PrioritySelect id="create-priority" v-model="form.priority" />
            </FormField>
          </div>
          <FormField label="Status" for="create-status">
            <StatusSelect v-if="project" id="create-status" v-model="form.statusId" :statuses="project.statuses" />
          </FormField>
          <FormField label="Assignee" for="create-assignee" :hint="autoAssignHint">
            <div class="flex gap-2">
              <div class="min-w-0 flex-1">
                <MemberSelect
                  id="create-assignee"
                  v-model="form.assigneeId"
                  :members="members"
                  @update:model-value="assigneeTouched = true"
                />
              </div>
              <Button
                v-if="auth.user && form.assigneeId !== auth.user.id"
                type="button"
                variant="outline"
                class="h-9"
                @click="form.assigneeId = auth.user.id; assigneeTouched = true"
              >
                Me
              </Button>
            </div>
          </FormField>
          <FormField v-if="project?.type === 'scrum'" label="Sprint" for="create-sprint">
            <SprintSelect id="create-sprint" v-model="form.sprintId" :sprints="sprints" />
          </FormField>
          <div class="grid grid-cols-2 gap-3" :class="compact && 'sm:col-span-2'">
            <FormField label="Due date" for="create-due">
              <DatePicker id="create-due" v-model="form.dueDate" placeholder="None" />
            </FormField>
            <FormField label="Story points" for="create-points">
              <NumberField id="create-points" v-model="form.storyPoints" :min="0" :max="100" placeholder="–" />
            </FormField>
          </div>
          <FormField label="Labels" :class="compact && 'sm:col-span-2'">
            <LabelMultiSelect v-model="form.labelIds" :labels="project?.labels ?? []" :project-id="projectId" />
          </FormField>
        </div>
      </aside>
    </div>

    <!-- Actions -->
    <footer class="glass sticky bottom-0 z-20 border-t border-border/60" :class="compact && 'pb-safe'">
      <div class="mx-auto flex w-full max-w-6xl flex-col gap-3 sm:flex-row sm:items-center" :class="compact ? 'p-3' : 'px-5 py-2.5'">
        <p v-if="errorMessage" class="bg-destructive/10 px-3 py-2 text-sm text-destructive sm:order-2 sm:flex-1" role="alert">{{ errorMessage }}</p>
        <label class="flex items-center gap-2 text-sm text-muted-foreground sm:order-1" :class="!errorMessage && 'sm:flex-1'">
          <Switch v-model="createAnother" aria-label="Create another" />
          Create another
        </label>
        <div class="flex gap-2 sm:order-3">
          <Button type="button" variant="outline" class="flex-1 sm:flex-none" @click="emit('cancel')">Cancel</Button>
          <Button type="submit" class="flex-1 sm:flex-none" :loading="isSubmitting" :disabled="!projectId">
            Create issue
            <kbd v-if="!compact" class="ml-1 border border-primary-foreground/30 px-1 text-[10px]">Ctrl ↵</kbd>
          </Button>
        </div>
      </div>
    </footer>
  </form>
</template>

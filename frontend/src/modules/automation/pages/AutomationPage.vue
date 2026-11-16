<script setup lang="ts">
import { ChevronDown, Ellipsis, LayoutTemplate, Pencil, Play, Plus, Repeat, Trash2, TriangleAlert, Workflow } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { toast } from 'vue-sonner'
import EmptyState from '@/components/common/EmptyState.vue'
import IssueTypeIcon from '@/components/common/IssueTypeIcon.vue'
import MobileSectionSelect from '@/components/common/MobileSectionSelect.vue'
import UserAvatar from '@/components/common/UserAvatar.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useConfirm } from '@/composables/useConfirm'
import { useDevice } from '@/composables/useDevice'
import { formatDateTime, timeAgo } from '@/lib/format'
import { getErrorMessage } from '@/lib/http'
import { useAuthStore } from '@/modules/auth/auth.store'
import { useProjectsStore } from '@/modules/projects/projects.store'
import type { AutomationRule, IssueTemplate, RecurringTask } from '@/types/models'
import { automationApi, recurringTasksApi, type RuleInput, templatesApi } from '../automation.api'
import { AUTOMATION_RECIPES, type AutomationRecipe, describeRule } from '../automation.constants'
import RecurringTaskDialog from '../components/RecurringTaskDialog.vue'
import RuleEditorDialog from '../components/RuleEditorDialog.vue'
import TemplateEditorDialog from '../components/TemplateEditorDialog.vue'
import { describeSchedule } from '../recurring-schedule'

const route = useRoute()
const projects = useProjectsStore()
const auth = useAuthStore()
const confirm = useConfirm()
const { isDesktop } = useDevice()

const projectId = computed(() => route.params.projectId as string)
const project = computed(() => projects.details[projectId.value])
const isAdmin = computed(() => projects.isAdmin(projectId.value))
const canEdit = computed(() => projects.canEdit(projectId.value))

const rules = ref<AutomationRule[]>([])
const templates = ref<IssueTemplate[]>([])
const recurringTasks = ref<RecurringTask[]>([])
const isLoading = ref(true)
const loadError = ref<string | null>(null)
const expandedRuleId = ref<string | null>(null)

const isRuleDialogOpen = ref(false)
const editingRule = ref<AutomationRule | null>(null)
const ruleDraft = ref<RuleInput | null>(null)
const isTemplateDialogOpen = ref(false)
const editingTemplate = ref<IssueTemplate | null>(null)
const isRecurringDialogOpen = ref(false)
const editingTask = ref<RecurringTask | null>(null)

const canRules = computed(() => auth.hasFeature('automations'))
const canTemplates = computed(() => auth.hasFeature('templates'))
const canRecurring = computed(() => auth.hasFeature('recurringTasks'))
const defaultTab = computed(() => (canRules.value ? 'rules' : canTemplates.value ? 'templates' : 'recurring'))
const tab = ref(defaultTab.value)
const tabOptions = computed(() => [
  ...(canRules.value ? [{ value: 'rules', label: 'Rules', icon: Workflow }] : []),
  ...(canTemplates.value ? [{ value: 'templates', label: 'Templates', icon: LayoutTemplate }] : []),
  ...(canRecurring.value ? [{ value: 'recurring', label: 'Recurring', icon: Repeat }] : []),
])
const tabListClass = computed(() => {
  const cols = tabOptions.value.length
  return cols <= 1 ? 'grid w-full grid-cols-1' : cols === 2 ? 'grid w-full grid-cols-2' : 'grid w-full grid-cols-3'
})
watch(defaultTab, (value) => {
  const allowed =
    (tab.value === 'rules' && canRules.value) ||
    (tab.value === 'templates' && canTemplates.value) ||
    (tab.value === 'recurring' && canRecurring.value)
  if (!allowed) tab.value = value
})

async function load() {
  isLoading.value = true
  loadError.value = null
  try {
    await projects.fetchProject(projectId.value)
    ;[rules.value, templates.value, recurringTasks.value] = await Promise.all([
      canRules.value ? automationApi.listRules(projectId.value) : [],
      canTemplates.value ? templatesApi.list(projectId.value) : [],
      canRecurring.value ? recurringTasksApi.list(projectId.value) : [],
    ])
  } catch (error) {
    loadError.value = getErrorMessage(error)
  } finally {
    isLoading.value = false
  }
}
watch(projectId, load, { immediate: true })

const usedRecipeNames = computed(() => new Set(rules.value.map((rule) => rule.name)))
const sortedRules = computed(() =>
  [...rules.value].sort((a, b) => {
    const aErr = a.lastError ? 0 : 1
    const bErr = b.lastError ? 0 : 1
    if (aErr !== bErr) return aErr - bErr
    return a.name.localeCompare(b.name)
  }),
)

function openRule(rule: AutomationRule | null = null, draft: RuleInput | null = null) {
  editingRule.value = rule
  ruleDraft.value = draft
  isRuleDialogOpen.value = true
}

const useRecipe = (recipe: AutomationRecipe) => project.value && openRule(null, recipe.build(project.value))

async function toggleRule(rule: AutomationRule, enabled: boolean) {
  rule.enabled = enabled
  try {
    await automationApi.updateRule(projectId.value, rule.id, { enabled })
  } catch (error) {
    rule.enabled = !enabled
    toast.error(getErrorMessage(error))
  }
}

async function removeRule(rule: AutomationRule) {
  if (!(await confirm({ title: `Delete “${rule.name}”?`, confirmLabel: 'Delete rule', destructive: true }))) return
  await automationApi.removeRule(projectId.value, rule.id)
  await load()
}

function openTemplate(template: IssueTemplate | null = null) {
  editingTemplate.value = template
  isTemplateDialogOpen.value = true
}

async function removeTemplate(template: IssueTemplate) {
  if (!(await confirm({ title: `Delete template “${template.name}”?`, confirmLabel: 'Delete', destructive: true }))) return
  await templatesApi.remove(projectId.value, template.id)
  await load()
}

function openRecurring(task: RecurringTask | null = null) {
  editingTask.value = task
  isRecurringDialogOpen.value = true
}

async function toggleRecurring(task: RecurringTask, enabled: boolean) {
  await recurringTasksApi.update(projectId.value, task.id, { enabled })
  await load()
}

async function runNow(task: RecurringTask) {
  try {
    const result = await recurringTasksApi.runNow(projectId.value, task.id)
    toast.success(`${result.key} created`)
    await load()
  } catch (error) {
    toast.error(getErrorMessage(error))
  }
}

async function removeRecurring(task: RecurringTask) {
  if (!(await confirm({ title: `Stop “${task.title}”?`, description: 'Already created tasks are kept.', confirmLabel: 'Delete', destructive: true }))) return
  await recurringTasksApi.remove(projectId.value, task.id)
  await load()
}
</script>

<template>
  <div class="w-full space-y-4 sm:space-y-5" :class="isDesktop ? 'p-4 sm:p-5 lg:p-6' : 'p-3'">
    <div v-if="isLoading" class="space-y-3">
      <Skeleton class="h-10 w-full max-w-md" />
      <Skeleton v-for="index in 4" :key="index" class="h-20 w-full rounded-xl" />
    </div>

    <EmptyState
      v-else-if="loadError"
      :icon="Workflow"
      title="Automation did not load"
      :description="loadError"
      class="rounded-xl border border-dashed py-12"
    >
      <Button variant="outline" @click="load">Try again</Button>
    </EmptyState>

    <Tabs v-else-if="project" v-model="tab" class="gap-4">
      <MobileSectionSelect v-if="!isDesktop" v-model="tab" :options="tabOptions" aria-label="Automation sections" />
      <TabsList v-else :class="tabListClass">
        <TabsTrigger v-if="canRules" value="rules"><Workflow /> Rules</TabsTrigger>
        <TabsTrigger v-if="canTemplates" value="templates"><LayoutTemplate /> Templates</TabsTrigger>
        <TabsTrigger v-if="canRecurring" value="recurring"><Repeat /> Recurring</TabsTrigger>
      </TabsList>

      <!-- Rules -->
      <TabsContent v-if="canRules" value="rules" class="space-y-4">
        <div class="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div class="min-w-0">
            <h2 class="font-semibold">Automation rules</h2>
            <p class="text-sm text-muted-foreground">When something happens, Vector does the follow-up work for you.</p>
          </div>
          <Button v-if="isAdmin" variant="brand" class="max-sm:w-full shrink-0" @click="openRule()"><Plus /> New rule</Button>
        </div>

        <ul v-if="sortedRules.length" class="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/70 bg-card shadow-soft">
          <li v-for="rule in sortedRules" :key="rule.id" class="flex flex-col gap-3 p-4 transition-colors hover:bg-accent/30 sm:flex-row">
            <Switch
              :model-value="rule.enabled"
              :disabled="!isAdmin"
              :aria-label="`${rule.enabled ? 'Disable' : 'Enable'} ${rule.name}`"
              class="mt-0.5"
              @update:model-value="(value: boolean) => toggleRule(rule, value)"
            />
            <div class="min-w-0 flex-1 space-y-1">
              <p class="flex flex-wrap items-center gap-2 font-medium">
                {{ rule.name }}
                <Badge v-if="!rule.enabled" variant="outline">Off</Badge>
                <Badge v-if="rule.lastError" variant="destructive">Error</Badge>
              </p>
              <p class="text-sm text-muted-foreground">{{ describeRule(rule, project) }}</p>
              <p class="text-xs text-muted-foreground">
                Ran {{ rule.runCount }} time{{ rule.runCount === 1 ? '' : 's' }}<template v-if="rule.lastRunAt"> · last {{ timeAgo(rule.lastRunAt) }}</template>
              </p>
              <p v-if="rule.lastError" class="flex items-start gap-1 text-xs text-destructive">
                <TriangleAlert class="mt-0.5 size-3.5 shrink-0" />
                <span>{{ rule.lastError }} — clears on the next successful run.</span>
              </p>
              <button
                type="button"
                class="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                @click="expandedRuleId = expandedRuleId === rule.id ? null : rule.id"
              >
                Run details
                <ChevronDown class="size-3.5 transition-transform" :class="expandedRuleId === rule.id && 'rotate-180'" />
              </button>
              <div v-if="expandedRuleId === rule.id" class="rounded-md border border-border/70 bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                <p>Total runs: <span class="font-medium text-foreground tabular-nums">{{ rule.runCount }}</span></p>
                <p>
                  Last run:
                  <span class="font-medium text-foreground">{{ rule.lastRunAt ? formatDateTime(rule.lastRunAt) : 'Never' }}</span>
                </p>
                <p>
                  Status:
                  <span class="font-medium" :class="rule.lastError ? 'text-destructive' : 'text-foreground'">
                    {{ rule.lastError ? 'Last run failed' : rule.enabled ? 'Ready' : 'Paused' }}
                  </span>
                </p>
              </div>
            </div>
            <DropdownMenu v-if="isAdmin">
              <DropdownMenuTrigger as-child>
                <Button variant="ghost" size="icon-sm" :aria-label="`${rule.name} actions`"><Ellipsis /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem @select="openRule(rule)"><Pencil /> Edit</DropdownMenuItem>
                <DropdownMenuItem variant="destructive" @select="removeRule(rule)"><Trash2 /> Delete</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </li>
        </ul>
        <EmptyState
          v-else
          :icon="Workflow"
          title="No rules yet"
          description="Start from a recipe below — one click and it’s running."
          class="rounded-xl border border-dashed"
        />

        <section v-if="isAdmin" class="space-y-3">
          <h3 class="text-sm font-semibold">Recipes</h3>
          <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <button
              v-for="recipe in AUTOMATION_RECIPES"
              :key="recipe.id"
              type="button"
              class="surface-hover flex min-w-0 flex-col gap-2 rounded-xl border border-border/70 bg-card p-4 text-left shadow-soft disabled:pointer-events-none disabled:opacity-60"
              :disabled="usedRecipeNames.has(recipe.name)"
              @click="useRecipe(recipe)"
            >
              <span class="flex size-10 items-center justify-center bg-brand text-primary-foreground shadow-glow">
                <component :is="recipe.icon" class="size-5" />
              </span>
              <span class="font-medium">{{ recipe.name }}</span>
              <span class="text-sm text-muted-foreground">{{ recipe.description }}</span>
              <span class="mt-auto text-xs font-medium text-primary">{{ usedRecipeNames.has(recipe.name) ? 'Already added' : 'Use recipe →' }}</span>
            </button>
          </div>
        </section>
      </TabsContent>

      <!-- Templates -->
      <TabsContent v-if="canTemplates" value="templates" class="space-y-4">
        <div class="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div class="min-w-0">
            <h2 class="font-semibold">Task templates</h2>
            <p class="text-sm text-muted-foreground">Pick a template when creating a task to fill everything in at once.</p>
          </div>
          <Button v-if="canEdit" variant="brand" class="max-sm:w-full shrink-0" @click="openTemplate()"><Plus /> New template</Button>
        </div>
        <div v-if="templates.length" class="grid gap-3 sm:grid-cols-2">
          <article v-for="template in templates" :key="template.id" class="surface-hover min-w-0 space-y-2 rounded-xl border border-border/70 bg-card p-4 shadow-soft">
            <div class="flex items-start gap-2">
              <IssueTypeIcon :type="template.issueType" size="md" />
              <div class="min-w-0 flex-1">
                <p class="font-medium">{{ template.name }}</p>
                <p class="text-xs text-muted-foreground capitalize">
                  {{ template.priority }} priority<template v-if="template.storyPoints !== null"> · {{ template.storyPoints }} pts</template> ·
                  {{ template.subtaskTitles.length }} sub-tasks
                </p>
              </div>
              <template v-if="canEdit">
                <Button variant="ghost" size="icon-sm" :aria-label="`Edit ${template.name}`" @click="openTemplate(template)"><Pencil /></Button>
                <Button variant="ghost" size="icon-sm" :aria-label="`Delete ${template.name}`" @click="removeTemplate(template)"><Trash2 /></Button>
              </template>
            </div>
            <p v-if="template.body" class="line-clamp-3 text-xs whitespace-pre-line text-muted-foreground">{{ template.body }}</p>
          </article>
        </div>
        <EmptyState
          v-else
          :icon="LayoutTemplate"
          title="No templates"
          description="Save your team’s standard bug report or feature request format."
          class="rounded-xl border border-dashed"
        />
      </TabsContent>

      <!-- Recurring -->
      <TabsContent v-if="canRecurring" value="recurring" class="space-y-4">
        <div class="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div class="min-w-0">
            <h2 class="font-semibold">Recurring tasks</h2>
            <p class="text-sm text-muted-foreground">Routine work creates itself — stand-up notes, releases, reviews, reports.</p>
          </div>
          <Button v-if="canEdit" variant="brand" class="max-sm:w-full shrink-0" @click="openRecurring()"><Plus /> New recurring task</Button>
        </div>
        <ul v-if="recurringTasks.length" class="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/70 bg-card shadow-soft">
          <li v-for="task in recurringTasks" :key="task.id" class="flex flex-col gap-3 p-4 transition-colors hover:bg-accent/30 sm:flex-row sm:flex-wrap sm:items-center">
            <Switch
              :model-value="task.enabled"
              :disabled="!canEdit"
              :aria-label="`${task.enabled ? 'Pause' : 'Resume'} ${task.title}`"
              @update:model-value="(value: boolean) => toggleRecurring(task, value)"
            />
            <div class="min-w-0 flex-1">
              <p class="flex items-center gap-2 font-medium"><IssueTypeIcon :type="task.issueType" /> {{ task.title }}</p>
              <p class="text-sm text-muted-foreground">{{ describeSchedule(task) }}</p>
              <p class="text-xs text-muted-foreground">
                Next: {{ task.enabled ? formatDateTime(task.nextRunAt) : 'paused' }}<template v-if="task.lastRunAt"> · last {{ timeAgo(task.lastRunAt) }}</template>
              </p>
            </div>
            <UserAvatar :user="task.assignee" size="md" show-tooltip />
            <div v-if="canEdit" class="flex flex-wrap items-center gap-2">
              <Button variant="soft" size="sm" class="max-sm:flex-1" @click="runNow(task)"><Play /> Run now</Button>
              <Button variant="ghost" size="icon-sm" :aria-label="`Edit ${task.title}`" @click="openRecurring(task)"><Pencil /></Button>
              <Button variant="ghost" size="icon-sm" :aria-label="`Delete ${task.title}`" @click="removeRecurring(task)"><Trash2 /></Button>
            </div>
          </li>
        </ul>
        <EmptyState
          v-else
          :icon="Repeat"
          title="No recurring tasks"
          description="Set it once and never forget routine work again."
          class="rounded-xl border border-dashed"
        />
      </TabsContent>
    </Tabs>

    <template v-if="project && !isLoading && !loadError">
      <RuleEditorDialog v-model:open="isRuleDialogOpen" :project="project" :rule="editingRule" :draft="ruleDraft" @saved="load" />
      <TemplateEditorDialog v-model:open="isTemplateDialogOpen" :project="project" :template="editingTemplate" @saved="load" />
      <RecurringTaskDialog v-model:open="isRecurringDialogOpen" :project="project" :task="editingTask" @saved="load" />
    </template>
  </div>
</template>

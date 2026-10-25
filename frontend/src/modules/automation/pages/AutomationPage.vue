<script setup lang="ts">
import { Ellipsis, LayoutTemplate, Pencil, Play, Plus, Repeat, Trash2, TriangleAlert, Workflow } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { toast } from 'vue-sonner'
import EmptyState from '@/components/common/EmptyState.vue'
import IssueTypeIcon from '@/components/common/IssueTypeIcon.vue'
import UserAvatar from '@/components/common/UserAvatar.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useConfirm } from '@/composables/useConfirm'
import { useDevice } from '@/composables/useDevice'
import { formatDateTime, timeAgo } from '@/lib/format'
import { getErrorMessage } from '@/lib/http'
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
const confirm = useConfirm()
const { isDesktop } = useDevice()

const projectId = computed(() => route.params.projectId as string)
const project = computed(() => projects.details[projectId.value])
const isAdmin = computed(() => projects.isAdmin(projectId.value))
const canEdit = computed(() => projects.canEdit(projectId.value))

const rules = ref<AutomationRule[]>([])
const templates = ref<IssueTemplate[]>([])
const recurringTasks = ref<RecurringTask[]>([])

const isRuleDialogOpen = ref(false)
const editingRule = ref<AutomationRule | null>(null)
const ruleDraft = ref<RuleInput | null>(null)
const isTemplateDialogOpen = ref(false)
const editingTemplate = ref<IssueTemplate | null>(null)
const isRecurringDialogOpen = ref(false)
const editingTask = ref<RecurringTask | null>(null)

async function load() {
  await projects.fetchProject(projectId.value)
  ;[rules.value, templates.value, recurringTasks.value] = await Promise.all([
    automationApi.listRules(projectId.value),
    templatesApi.list(projectId.value),
    recurringTasksApi.list(projectId.value),
  ])
}
watch(projectId, load, { immediate: true })

const usedRecipeNames = computed(() => new Set(rules.value.map((rule) => rule.name)))

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
  if (!(await confirm({ title: `Stop “${task.title}”?`, description: 'Already created issues are kept.', confirmLabel: 'Delete', destructive: true }))) return
  await recurringTasksApi.remove(projectId.value, task.id)
  await load()
}
</script>

<template>
  <div class="w-full" :class="isDesktop ? 'px-5 py-4' : 'p-3'">
    <Tabs v-if="project" default-value="rules" class="gap-4">
      <TabsList class="w-full sm:w-auto">
        <TabsTrigger value="rules"><Workflow /> Rules</TabsTrigger>
        <TabsTrigger value="templates"><LayoutTemplate /> Templates</TabsTrigger>
        <TabsTrigger value="recurring"><Repeat /> Recurring</TabsTrigger>
      </TabsList>

      <!-- Rules -->
      <TabsContent value="rules" class="space-y-4">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 class="font-semibold">Automation rules</h2>
            <p class="text-sm text-muted-foreground">When something happens, Vector does the follow-up work for you.</p>
          </div>
          <Button v-if="isAdmin" variant="brand" @click="openRule()"><Plus /> New rule</Button>
        </div>

        <ul v-if="rules.length" class="divide-y divide-border/60 overflow-hidden border border-border/70 bg-card shadow-soft">
          <li v-for="rule in rules" :key="rule.id" class="flex gap-3 p-4 transition-colors hover:bg-accent/30">
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
              </p>
              <p class="text-sm text-muted-foreground">{{ describeRule(rule, project) }}</p>
              <p class="text-xs text-muted-foreground">
                Ran {{ rule.runCount }} time{{ rule.runCount === 1 ? '' : 's' }}<template v-if="rule.lastRunAt"> · last {{ timeAgo(rule.lastRunAt) }}</template>
              </p>
              <p v-if="rule.lastError" class="flex items-center gap-1 text-xs text-destructive"><TriangleAlert class="size-3.5" /> {{ rule.lastError }}</p>
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
          class=" border border-dashed"
        />

        <section v-if="isAdmin" class="space-y-3">
          <h3 class="text-sm font-semibold">Recipes</h3>
          <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <button
              v-for="recipe in AUTOMATION_RECIPES"
              :key="recipe.id"
              type="button"
              class="surface-hover flex flex-col gap-2 border border-border/70 bg-card p-4 text-left shadow-soft disabled:pointer-events-none disabled:opacity-60"
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
      <TabsContent value="templates" class="space-y-4">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 class="font-semibold">Issue templates</h2>
            <p class="text-sm text-muted-foreground">Pick a template when creating an issue to fill everything in at once.</p>
          </div>
          <Button v-if="canEdit" variant="brand" @click="openTemplate()"><Plus /> New template</Button>
        </div>
        <div v-if="templates.length" class="grid gap-3 sm:grid-cols-2">
          <article v-for="template in templates" :key="template.id" class="surface-hover space-y-2 border border-border/70 bg-card p-4 shadow-soft">
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
          class=" border border-dashed"
        />
      </TabsContent>

      <!-- Recurring -->
      <TabsContent value="recurring" class="space-y-4">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 class="font-semibold">Recurring tasks</h2>
            <p class="text-sm text-muted-foreground">Routine work creates itself — stand-up notes, releases, reviews, reports.</p>
          </div>
          <Button v-if="canEdit" variant="brand" @click="openRecurring()"><Plus /> New recurring task</Button>
        </div>
        <ul v-if="recurringTasks.length" class="divide-y divide-border/60 overflow-hidden border border-border/70 bg-card shadow-soft">
          <li v-for="task in recurringTasks" :key="task.id" class="flex flex-wrap items-center gap-3 p-4">
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
            <template v-if="canEdit">
              <Button variant="soft" size="sm" @click="runNow(task)"><Play /> Run now</Button>
              <Button variant="ghost" size="icon-sm" :aria-label="`Edit ${task.title}`" @click="openRecurring(task)"><Pencil /></Button>
              <Button variant="ghost" size="icon-sm" :aria-label="`Delete ${task.title}`" @click="removeRecurring(task)"><Trash2 /></Button>
            </template>
          </li>
        </ul>
        <EmptyState
          v-else
          :icon="Repeat"
          title="No recurring tasks"
          description="Set it once and never forget routine work again."
          class=" border border-dashed"
        />
      </TabsContent>
    </Tabs>

    <template v-if="project">
      <RuleEditorDialog v-model:open="isRuleDialogOpen" :project="project" :rule="editingRule" :draft="ruleDraft" @saved="load" />
      <TemplateEditorDialog v-model:open="isTemplateDialogOpen" :project="project" :template="editingTemplate" @saved="load" />
      <RecurringTaskDialog v-model:open="isRecurringDialogOpen" :project="project" :task="editingTask" @saved="load" />
    </template>
  </div>
</template>

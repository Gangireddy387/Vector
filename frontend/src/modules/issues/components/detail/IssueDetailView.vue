<script setup lang="ts">
import {
  Check,
  ChevronRight,
  Ellipsis,
  ExternalLink,
  Eye,
  Link2,
  Paperclip,
  RotateCcw,
  Sparkles,
  Trash2,
  UserPlus,
  X,
} from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import EmptyState from '@/components/common/EmptyState.vue'
import IssueTypeIcon from '@/components/common/IssueTypeIcon.vue'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useDevice } from '@/composables/useDevice'
import { useProjectRealtime } from '@/composables/useProjectRealtime'
import { useAuthStore } from '@/modules/auth/auth.store'
import { useProjectsStore } from '@/modules/projects/projects.store'
import { sprintsApi } from '@/modules/sprints/sprints.api'
import type { IssueDetail, Sprint } from '@/types/models'
import { issuesApi, type UpdateIssueInput } from '../../api/issues.api'
import { useIssueActions } from '../../composables/useIssueActions'
import StatusSelect from '../pickers/StatusSelect.vue'
import IssueActivity from './IssueActivity.vue'
import IssueAiSummary from './IssueAiSummary.vue'
import IssueAttachments from './IssueAttachments.vue'
import IssueComments from './IssueComments.vue'
import IssueFollowups from './IssueFollowups.vue'
import IssueDescriptionEditor from './IssueDescriptionEditor.vue'
import IssueFieldsPanel from './IssueFieldsPanel.vue'
import IssueLinks from './IssueLinks.vue'
import IssueSubtasks from './IssueSubtasks.vue'
import IssueTitleEditor from './IssueTitleEditor.vue'
import IssueWorkLogs from './IssueWorkLogs.vue'

const props = withDefaults(defineProps<{ issueKey: string; mode?: 'page' | 'panel' }>(), { mode: 'page' })
const emit = defineEmits<{ close: [] }>()

const router = useRouter()
const auth = useAuthStore()
const projects = useProjectsStore()
const actions = useIssueActions()
const { isDesktop } = useDevice()

const issue = ref<IssueDetail | null>(null)
const sprints = ref<Sprint[]>([])
const isLoading = ref(true)
const notFound = ref(false)
const refreshKey = ref(0)
const activeTab = ref('comments')

const attachmentsRef = ref<InstanceType<typeof IssueAttachments> | null>(null)
const linksRef = ref<InstanceType<typeof IssueLinks> | null>(null)
const summaryRef = ref<InstanceType<typeof IssueAiSummary> | null>(null)

const project = computed(() => (issue.value ? projects.details[issue.value.projectId] ?? null : null))
const canEdit = computed(() => projects.canEdit(issue.value?.projectId))
const canUseAi = computed(() => auth.hasFeature('aiAssistant'))
const canAttach = computed(() => canEdit.value && auth.hasFeature('attachments'))
const isDone = computed(() => issue.value?.status.category === 'done')
const projectId = computed(() => issue.value?.projectId)

async function load(showSkeleton = true) {
  if (showSkeleton) isLoading.value = true
  notFound.value = false
  try {
    const loaded = await issuesApi.get(props.issueKey)
    const detail = await projects.fetchProject(loaded.projectId)
    sprints.value = detail.type === 'scrum' ? await sprintsApi.list(loaded.projectId) : []
    issue.value = loaded
  } catch {
    notFound.value = true
  } finally {
    isLoading.value = false
  }
}

watch(() => props.issueKey, () => load(), { immediate: true })

async function reloadQuietly() {
  await load(false)
  refreshKey.value += 1
}

useProjectRealtime(projectId, reloadQuietly)

async function update(changes: UpdateIssueInput) {
  if (!issue.value) return
  const updated = await actions.update(issue.value, changes)
  if (updated) {
    issue.value = updated
    refreshKey.value += 1
  }
}

async function toggleDone() {
  if (!issue.value) return
  const updated = isDone.value ? await actions.reopen(issue.value) : await actions.complete(issue.value)
  if (updated) issue.value = updated
}

async function toggleWatch() {
  if (!issue.value) return
  if (issue.value.isWatching) await issuesApi.unwatch(issue.value.id)
  else await issuesApi.watch(issue.value.id)
  await load(false)
}

async function remove() {
  if (!issue.value) return
  const parentKey = issue.value.parent?.key
  if (!(await actions.remove(issue.value))) return
  if (props.mode === 'panel') emit('close')
  else if (parentKey) void router.replace({ name: 'issue', params: { issueKey: parentKey } })
  else void router.replace({ name: 'project-board', params: { projectId: issue.value.projectId } })
}

function startLinking() {
  activeTab.value = 'comments'
  linksRef.value?.startAdding()
}
</script>

<template>
  <div v-if="isLoading" class="space-y-4 p-6">
    <Skeleton class="h-5 w-40" />
    <Skeleton class="h-8 w-3/4" />
    <Skeleton class="h-32 w-full" />
  </div>

  <EmptyState
    v-else-if="notFound || !issue || !project"
    title="Task not found"
    description="It may have been deleted, or you do not have access to its project."
    class="py-20"
  >
    <Button variant="outline" @click="mode === 'panel' ? emit('close') : router.push({ name: 'home' })">Go back</Button>
  </EmptyState>

  <div v-else class="flex h-full min-h-0 flex-col">
    <!-- Header: breadcrumbs and actions -->
    <header class="flex shrink-0 items-center gap-2 border-b px-4 py-2.5" :class="!isDesktop && 'bg-background'">
      <nav class="flex min-w-0 flex-1 items-center gap-1 text-sm text-muted-foreground" aria-label="Breadcrumb">
        <RouterLink :to="{ name: 'project-board', params: { projectId: project.id } }" class="hidden truncate hover:text-foreground sm:inline">
          {{ project.name }}
        </RouterLink>
        <ChevronRight class="hidden size-3.5 shrink-0 sm:inline" />
        <template v-if="issue.parent">
          <RouterLink :to="{ name: 'issue', params: { issueKey: issue.parent.key } }" class="flex items-center gap-1 hover:text-foreground">
            <IssueTypeIcon :type="issue.parent.type" /> {{ issue.parent.key }}
          </RouterLink>
          <ChevronRight class="size-3.5 shrink-0" />
        </template>
        <span class="flex items-center gap-1.5 font-medium text-foreground"><IssueTypeIcon :type="issue.type" /> {{ issue.key }}</span>
      </nav>

      <Button
        variant="ghost"
        size="icon-sm"
        :class="issue.isWatching && 'text-primary'"
        :aria-pressed="issue.isWatching"
        :aria-label="issue.isWatching ? 'Watching — click to stop' : 'Watch this task'"
        :title="issue.isWatching ? 'Watching — click to stop' : 'Watch this task'"
        @click="toggleWatch"
      >
        <Eye />
      </Button>
      <Button variant="ghost" size="icon-sm" aria-label="Copy link" title="Copy link" @click="actions.copyLink(issue)"><Link2 /></Button>
      <Button
        v-if="mode === 'panel'"
        variant="ghost"
        size="icon-sm"
        aria-label="Open full page"
        title="Open full page"
        @click="router.push({ name: 'issue', params: { issueKey: issue.key } })"
      >
        <ExternalLink />
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <Button variant="ghost" size="icon-sm" aria-label="More actions"><Ellipsis /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" class="w-52">
          <DropdownMenuItem v-if="canUseAi" @select="summaryRef?.generate()"><Sparkles /> Summarize</DropdownMenuItem>
          <DropdownMenuItem v-if="canEdit" @select="startLinking"><Link2 /> Link task</DropdownMenuItem>
          <DropdownMenuItem v-if="canAttach" @select="attachmentsRef?.openPicker()"><Paperclip /> Attach files</DropdownMenuItem>
          <template v-if="canEdit">
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" @select="remove"><Trash2 /> Delete task</DropdownMenuItem>
          </template>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button v-if="mode === 'panel'" variant="ghost" size="icon-sm" aria-label="Close" @click="emit('close')"><X /></Button>
    </header>

    <div class="min-h-0 flex-1" :class="isDesktop ? 'grid grid-cols-[minmax(0,1fr)_340px] overflow-hidden' : ''">
      <!-- Main column -->
      <div class="space-y-5 overflow-y-auto" :class="isDesktop ? 'p-5' : 'p-4 pb-8'">
        <div class="space-y-3">
          <IssueTitleEditor :title="issue.title" :editable="canEdit" :done="isDone" @save="(title) => update({ title })" />

          <!-- Task-focused quick actions (primary on mobile) -->
          <div class="flex flex-wrap items-center gap-2">
            <StatusSelect
              v-if="!isDesktop"
              :model-value="issue.statusId"
              :statuses="project.statuses"
              :disabled="!canEdit"
              class="w-auto min-w-36"
              @update:model-value="(statusId) => update({ statusId })"
            />
            <Button v-if="canEdit" :variant="isDone ? 'outline' : 'default'" size="sm" @click="toggleDone">
              <RotateCcw v-if="isDone" /> <Check v-else />
              {{ isDone ? 'Reopen' : 'Mark done' }}
            </Button>
            <Button
              v-if="canEdit && auth.user && issue.assigneeId !== auth.user.id"
              variant="outline"
              size="sm"
              @click="update({ assigneeId: auth.user.id })"
            >
              <UserPlus /> Assign to me
            </Button>
            <Button v-if="isDesktop && canUseAi" variant="outline" size="sm" @click="summaryRef?.generate()"><Sparkles class="text-primary" /> Summarize</Button>
            <Button v-if="isDesktop && canAttach" variant="outline" size="sm" @click="attachmentsRef?.openPicker()"><Paperclip /> Attach</Button>
            <Button v-if="isDesktop && canEdit" variant="outline" size="sm" @click="startLinking"><Link2 /> Link</Button>
          </div>
        </div>

        <IssueAiSummary v-if="canUseAi" ref="summaryRef" :issue-id="issue.id" />

        <!-- On phones, key fields come before long-form content -->
        <details v-if="!isDesktop" class="group border bg-card" open>
          <summary class="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-semibold">
            Details <ChevronRight class="size-4 transition-transform group-open:rotate-90" />
          </summary>
          <div class="px-4 pb-3">
            <IssueFieldsPanel :issue="issue" :project="project" :sprints="sprints" :editable="canEdit" :show-status="false" @update="update" />
          </div>
        </details>

        <IssueDescriptionEditor :description="issue.description" :editable="canEdit" @save="(description) => update({ description })" />
        <IssueSubtasks :issue="issue" :project="project" :editable="canEdit" @changed="reloadQuietly" />
        <IssueLinks ref="linksRef" :issue="issue" :editable="canEdit" @changed="reloadQuietly" />
        <IssueAttachments ref="attachmentsRef" :issue-id="issue.id" :editable="canAttach" :refresh-key="refreshKey" />

        <Tabs v-model="activeTab" class="gap-4">
          <TabsList class="w-full sm:w-auto">
            <TabsTrigger value="comments">Comments</TabsTrigger>
            <TabsTrigger v-if="auth.hasFeature('chat')" value="followups">Follow-ups</TabsTrigger>
            <TabsTrigger value="activity">History</TabsTrigger>
            <TabsTrigger v-if="auth.hasFeature('timeTracking')" value="work">Work log</TabsTrigger>
          </TabsList>
          <TabsContent value="comments">
            <IssueComments
              :issue-id="issue.id"
              :members="project.members"
              :editable="canEdit"
              :is-admin="project.myRole === 'admin'"
              :refresh-key="refreshKey"
            />
          </TabsContent>
          <TabsContent v-if="auth.hasFeature('chat')" value="followups">
            <IssueFollowups :issue-id="issue.id" :issue-key="issue.key" :project-id="issue.projectId" :refresh-key="refreshKey" />
          </TabsContent>
          <TabsContent value="activity">
            <IssueActivity :issue-id="issue.id" :refresh-key="refreshKey" />
          </TabsContent>
          <TabsContent v-if="auth.hasFeature('timeTracking')" value="work">
            <IssueWorkLogs :issue-id="issue.id" :editable="canEdit" :refresh-key="refreshKey" @changed="load(false)" />
          </TabsContent>
        </Tabs>
      </div>

      <!-- Desktop side panel with every field visible at once -->
      <aside v-if="isDesktop" class="overflow-y-auto border-l bg-muted/20 p-5">
        <IssueFieldsPanel :issue="issue" :project="project" :sprints="sprints" :editable="canEdit" @update="update" />
      </aside>
    </div>
  </div>
</template>

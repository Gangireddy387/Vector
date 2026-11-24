<script setup lang="ts">
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Ellipsis,
  ExternalLink,
  Eye,
  GitBranch,
  Link2,
  Paperclip,
  RotateCcw,
  Share2,
  Sparkles,
  Trash2,
  UserPlus,
  X,
} from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import EmptyState from '@/components/common/EmptyState.vue'
import IssueTypeIcon from '@/components/common/IssueTypeIcon.vue'
import Toolbar from '@/components/common/Toolbar.vue'
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
import { getErrorMessage, isNotFoundError } from '@/lib/http'
import { canEditIssueField } from '@/lib/issue-field-acl'
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
import IssueExternalLinks from './IssueExternalLinks.vue'
import IssueLinks from './IssueLinks.vue'
import IssueSubtasks from './IssueSubtasks.vue'
import IssueTitleEditor from './IssueTitleEditor.vue'
import IssueWorkLogs from './IssueWorkLogs.vue'
import IssueShareDialog from '@/modules/shares/components/IssueShareDialog.vue'
import { intakeApi, type IntakeSubmissionRow } from '@/modules/intake/intake.api'

const props = withDefaults(defineProps<{ issueKey: string; mode?: 'page' | 'panel' }>(), { mode: 'page' })
const emit = defineEmits<{ close: [] }>()

const router = useRouter()
const auth = useAuthStore()
const projects = useProjectsStore()
const actions = useIssueActions()
const { isDesktop, isWide } = useDevice()

const issue = ref<IssueDetail | null>(null)
const sprints = ref<Sprint[]>([])
const isLoading = ref(true)
const notFound = ref(false)
const loadError = ref<string | null>(null)
const refreshKey = ref(0)
const activeTab = ref('comments')
const intakeSubmission = ref<Pick<IntakeSubmissionRow, 'id' | 'state' | 'submitterName' | 'submitterEmail' | 'reviewNote' | 'createdAt'> | null>(null)

const attachmentsRef = ref<InstanceType<typeof IssueAttachments> | null>(null)
const linksRef = ref<InstanceType<typeof IssueLinks> | null>(null)
const externalLinksRef = ref<InstanceType<typeof IssueExternalLinks> | null>(null)
const summaryRef = ref<InstanceType<typeof IssueAiSummary> | null>(null)
const shareOpen = ref(false)

const project = computed(() => (issue.value ? projects.details[issue.value.projectId] ?? null : null))
const transitionActor = computed(() => ({
  role: project.value?.myRole ?? null,
  userId: auth.user?.id ?? null,
  projectLeadId: project.value?.leadId ?? null,
  teamLeadId: project.value?.team?.leadId ?? null,
}))
const canEdit = computed(() => projects.canEdit(issue.value?.projectId))
const canEditTitle = computed(() => canEditIssueField(project.value, 'title', transitionActor.value, canEdit.value))
const canEditDescription = computed(() =>
  canEditIssueField(project.value, 'description', transitionActor.value, canEdit.value),
)
const canEditAssignee = computed(() =>
  canEditIssueField(project.value, 'assigneeId', transitionActor.value, canEdit.value),
)
/** Anyone with project access can discuss; editing work still needs member+. */
const canComment = computed(() => Boolean(issue.value && project.value?.myRole))
const canUseAi = computed(() => auth.hasFeature('aiAssistant'))
const canAttach = computed(() => canEdit.value && auth.hasFeature('attachments'))
const canLinkCode = computed(() => canEdit.value && auth.hasFeature('vcsLinks'))
const canSharePublicly = computed(() => canEdit.value && auth.hasFeature('publicShare'))
const isDone = computed(() => issue.value?.status.category === 'done')
const projectId = computed(() => issue.value?.projectId)

/**
 * "Not found" only when the server says so. Any other failure (offline, a server restart) keeps what is on screen
 * during a quiet reload, or offers to try again.
 */
async function load(showSkeleton = true) {
  if (showSkeleton) isLoading.value = true
  const key = props.issueKey
  try {
    const loaded = await issuesApi.get(key)
    const detail = await projects.fetchProject(loaded.projectId)
    const loadedSprints = detail.type === 'scrum' ? await sprintsApi.list(loaded.projectId) : []
    if (key !== props.issueKey) return
    sprints.value = loadedSprints
    issue.value = loaded
    notFound.value = false
    loadError.value = null
    intakeSubmission.value = null
    if (auth.hasFeature('intakeForms')) {
      intakeApi.forIssue(loaded.id).then((row) => {
        if (key === props.issueKey) intakeSubmission.value = row
      }).catch(() => {
        if (key === props.issueKey) intakeSubmission.value = null
      })
    }
  } catch (error) {
    if (key !== props.issueKey) return
    if (isNotFoundError(error)) notFound.value = true
    else if (showSkeleton || !issue.value) loadError.value = getErrorMessage(error)
  } finally {
    if (key === props.issueKey) isLoading.value = false
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
  issue.value = issue.value.isWatching ? await issuesApi.unwatch(issue.value.id) : await issuesApi.watch(issue.value.id)
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

function startCodeLinking() {
  activeTab.value = 'comments'
  externalLinksRef.value?.startAdding()
}
</script>

<template>
  <div v-if="isLoading" class="flex h-full min-h-0 flex-col" aria-busy="true" aria-label="Loading task">
    <div class="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
      <Skeleton class="h-7 w-7 rounded-md" />
      <Skeleton class="h-4 w-48" />
      <Skeleton class="ml-auto h-7 w-7 rounded-md" />
      <Skeleton class="h-7 w-7 rounded-md" />
    </div>
    <div class="grid min-h-0 flex-1 gap-0 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div class="space-y-4 p-5">
        <Skeleton class="h-9 w-4/5 rounded-lg" />
        <Skeleton class="h-8 w-56 rounded-lg" />
        <Skeleton class="h-36 w-full rounded-xl" />
        <Skeleton class="h-24 w-full rounded-xl" />
        <Skeleton class="h-40 w-full rounded-xl" />
      </div>
      <div class="hidden space-y-3 border-l border-border/70 bg-muted/15 p-4 lg:block">
        <Skeleton class="h-3 w-16" />
        <Skeleton v-for="index in 8" :key="index" class="h-8 w-full rounded-lg" />
      </div>
    </div>
  </div>

  <EmptyState v-else-if="loadError && !issue" title="This task did not load" :description="loadError" class="py-20">
    <Button variant="outline" @click="load()">Try again</Button>
  </EmptyState>

  <EmptyState
    v-else-if="notFound || !issue || !project"
    title="Task not found"
    description="It may have been deleted, or you do not have access to its project."
    class="py-20"
  >
    <Button variant="outline" @click="mode === 'panel' ? emit('close') : router.push({ name: 'home' })">Go back</Button>
  </EmptyState>

  <div v-else class="issue-detail rise-in flex h-full min-h-0 flex-col">
    <!-- Header: breadcrumbs and actions -->
    <Toolbar
      variant="wrap"
      dense
      class="sticky top-0 z-20 h-12 shrink-0 border-b border-border/80 bg-card/90 px-3 backdrop-blur-md sm:px-4 supports-[backdrop-filter]:bg-card/75"
      :class="!isDesktop && 'bg-background/95'"
    >
      <Button
        v-if="mode === 'panel'"
        variant="ghost"
        size="icon-sm"
        class="shrink-0"
        aria-label="Back to tasks"
        title="Back to tasks"
        @click="emit('close')"
      >
        <ArrowLeft />
      </Button>
      <nav class="flex min-w-0 flex-1 items-center gap-1 text-[13px] text-muted-foreground" aria-label="Breadcrumb">
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
        <span class="inline-flex items-center gap-1.5 rounded-md bg-muted/70 px-1.5 py-0.5 font-medium text-foreground tabular-nums ring-1 ring-border/60">
          <IssueTypeIcon :type="issue.type" /> {{ issue.key }}
        </span>
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
          <DropdownMenuItem v-if="canLinkCode" @select="startCodeLinking"><GitBranch /> Link code</DropdownMenuItem>
          <DropdownMenuItem v-if="canAttach" @select="attachmentsRef?.openPicker()"><Paperclip /> Attach files</DropdownMenuItem>
          <DropdownMenuItem v-if="canSharePublicly" @select="shareOpen = true"><Share2 /> Share publicly</DropdownMenuItem>
          <template v-if="canEdit">
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" @select="remove"><Trash2 /> Delete task</DropdownMenuItem>
          </template>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button v-if="mode === 'panel'" variant="ghost" size="icon-sm" aria-label="Close" @click="emit('close')"><X /></Button>
    </Toolbar>

    <div
      class="min-h-0 flex-1"
      :class="
        isWide
          ? 'grid grid-cols-[minmax(0,3fr)_minmax(0,2fr)] overflow-hidden'
          : ''
      "
    >
      <!-- Main column (60%) · details rail (40%) -->
      <div class="overflow-y-auto" :class="isWide ? (mode === 'panel' ? 'px-4 py-4 xl:px-5 xl:py-5' : 'px-5 py-5 xl:px-8 xl:py-6') : 'p-4 pb-8 sm:p-5'">
        <div class="space-y-5 xl:space-y-6">
        <header class="space-y-3">
          <IssueTitleEditor :title="issue.title" :editable="canEditTitle" :done="isDone" @save="(title) => update({ title })" />

          <div
            v-if="intakeSubmission"
            class="rounded-xl border px-3.5 py-2.5 text-sm shadow-soft"
            :class="
              intakeSubmission.state === 'pending'
                ? 'border-amber-500/30 bg-amber-500/10 text-amber-950 dark:text-amber-100'
                : intakeSubmission.state === 'approved'
                  ? 'border-emerald-500/30 bg-emerald-500/10'
                  : 'border-border bg-muted/40 text-muted-foreground'
            "
          >
            <p class="font-medium">
              <template v-if="intakeSubmission.state === 'pending'">Waiting for intake approval</template>
              <template v-else-if="intakeSubmission.state === 'approved'">Request approved</template>
              <template v-else>Request rejected</template>
            </p>
            <p class="mt-0.5 text-xs opacity-90">
              Submitted by {{ intakeSubmission.submitterName }} · {{ intakeSubmission.submitterEmail }}
              <template v-if="intakeSubmission.reviewNote"> · {{ intakeSubmission.reviewNote }}</template>
            </p>
          </div>

          <!-- Primary actions stay visible; Attach / Link / Code live in the header ··· menu. -->
          <Toolbar variant="wrap" dense class="rounded-xl border border-border/60 bg-muted/25 px-2 py-1.5 dark:bg-muted/15">
            <StatusSelect
              v-if="!isWide"
              :model-value="issue.statusId"
              :statuses="project.statuses"
              :from-status-id="issue.statusId"
              :transitions="project.workflowTransitions"
              :transition-actor="transitionActor"
              :disabled="!canEdit"
              class="w-auto min-w-36"
              @update:model-value="(statusId) => statusId && update({ statusId })"
            />
            <Button v-if="canEdit" :variant="isDone ? 'outline' : 'brand'" size="sm" @click="toggleDone">
              <RotateCcw v-if="isDone" /> <Check v-else />
              {{ isDone ? 'Reopen' : 'Mark done' }}
            </Button>
            <Button
              v-if="canEditAssignee && auth.user && issue.assigneeId !== auth.user.id"
              variant="outline"
              size="sm"
              @click="update({ assigneeId: auth.user.id })"
            >
              <UserPlus /> Assign to me
            </Button>
            <Button v-if="canUseAi" variant="ghost" size="sm" @click="summaryRef?.generate()">
              <Sparkles class="text-primary" /> Summarize
            </Button>
            <Button v-if="canAttach" variant="ghost" size="sm" class="max-sm:hidden" @click="attachmentsRef?.openPicker()">
              <Paperclip /> Attach
            </Button>
            <Button v-if="canEdit" variant="ghost" size="sm" class="max-sm:hidden" @click="startLinking">
              <Link2 /> Link
            </Button>
            <Button v-if="canLinkCode" variant="ghost" size="sm" class="max-sm:hidden" @click="startCodeLinking">
              <GitBranch /> Code
            </Button>
          </Toolbar>
        </header>

        <IssueAiSummary v-if="canUseAi" ref="summaryRef" :issue-id="issue.id" />

        <!-- Phone and tablet: key fields before long-form content (side rail only on wide screens) -->
        <details v-if="!isWide" class="group overflow-hidden rounded-xl border border-border/70 bg-card shadow-soft" open>
          <summary class="flex cursor-pointer list-none items-center justify-between px-3.5 py-2.5 text-sm font-semibold">
            Details <ChevronRight class="size-4 text-muted-foreground transition-transform duration-200 group-open:rotate-90" />
          </summary>
          <div class="border-t border-border/60 px-3 pb-3 pt-1.5">
            <IssueFieldsPanel
              :issue="issue"
              :project="project"
              :sprints="sprints"
              :editable="canEdit"
              :show-status="false"
              @update="update"
              @refreshed="(next) => (issue = next)"
            />
          </div>
        </details>

        <IssueDescriptionEditor
          :description="issue.description"
          :editable="canEditDescription"
          @save="(description) => update({ description })"
        />

        <div class="space-y-4 rounded-xl border border-border/60 bg-card/40 p-3.5 shadow-soft sm:p-4 dark:bg-card/20">
          <IssueSubtasks :issue="issue" :project="project" :editable="canEdit" @changed="reloadQuietly" />
          <div class="border-t border-border/50" />
          <IssueLinks ref="linksRef" :issue="issue" :editable="canEdit" @changed="reloadQuietly" />
          <template v-if="canLinkCode || (issue.externalLinks?.length ?? 0) > 0">
            <div class="border-t border-border/50" />
            <IssueExternalLinks
              ref="externalLinksRef"
              :issue="issue"
              :editable="canLinkCode"
              @changed="reloadQuietly"
            />
          </template>
          <div class="border-t border-border/50" />
          <IssueAttachments ref="attachmentsRef" :issue-id="issue.id" :editable="canAttach" :refresh-key="refreshKey" />
        </div>

        <Tabs v-model="activeTab" class="gap-4 border-t border-border/60 pt-5">
          <TabsList class="h-auto min-h-10 w-full max-w-full flex-wrap justify-start gap-1 rounded-xl border border-border/60 bg-muted/30 p-1.5 sm:w-auto">
            <TabsTrigger value="comments" class="h-8 px-3.5">Comments</TabsTrigger>
            <TabsTrigger v-if="auth.hasFeature('chat')" value="followups" class="h-8 px-3.5">Follow-ups</TabsTrigger>
            <TabsTrigger value="activity" class="h-8 px-3.5">History</TabsTrigger>
            <TabsTrigger v-if="auth.hasFeature('timeTracking')" value="work" class="h-8 px-3.5">Work log</TabsTrigger>
          </TabsList>
          <TabsContent value="comments">
            <IssueComments
              :issue-id="issue.id"
              :members="project.members"
              :editable="canComment"
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
      </div>

      <!-- Wide screens: side panel with every field visible at once -->
      <aside
        v-if="isWide"
        class="ghost-fields min-w-0 overflow-y-auto border-l border-border/70 bg-[color-mix(in_oklch,var(--muted)_35%,var(--card))] px-3 py-3.5 xl:px-4 xl:py-4 dark:bg-sidebar/45"
      >
        <div class="rounded-xl border border-border/50 bg-card/60 p-2 shadow-soft backdrop-blur-sm dark:bg-card/30">
          <IssueFieldsPanel
            :issue="issue"
            :project="project"
            :sprints="sprints"
            :editable="canEdit"
            @update="update"
            @refreshed="(next) => (issue = next)"
          />
        </div>
      </aside>
    </div>
    <IssueShareDialog v-if="issue" v-model:open="shareOpen" :issue-id="issue.id" />
  </div>
</template>

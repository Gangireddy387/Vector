<script setup lang="ts">
import { Link2, Plus, Trash2 } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import EmptyState from '@/components/common/EmptyState.vue'
import IssueTypeIcon from '@/components/common/IssueTypeIcon.vue'
import UserAvatar from '@/components/common/UserAvatar.vue'
import { DateField } from '@/components/forms'
import { useConfirm } from '@/composables/useConfirm'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { getErrorMessage } from '@/lib/http'
import { useOpenIssue } from '@/modules/issues/composables/useOpenIssue'
import type { Goal, GoalStatus, IssueType, KeyResult, KeyResultMetricType } from '@/types/models'
import GoalProgressBar from '../components/GoalProgressBar.vue'
import KeyResultCheckInPanel from '../components/KeyResultCheckInPanel.vue'
import { goalsApi, type LinkableIssue } from '../goals.api'

const props = defineProps<{ goalId: string }>()
const router = useRouter()
const confirm = useConfirm()
const openIssue = useOpenIssue()

const goal = ref<Goal | null>(null)
const allGoals = ref<Goal[]>([])
const loading = ref(false)
const loadError = ref<string | null>(null)
const krTitle = ref('')
const krType = ref<KeyResultMetricType>('percent')
const linkQuery = ref('')
const linkTarget = ref<KeyResult | null>(null)
const linkResults = ref<LinkableIssue[]>([])
const searching = ref(false)
const expandedCheckIn = ref<string | null>(null)

const statuses: GoalStatus[] = ['draft', 'active', 'completed', 'cancelled']

const parentOptions = computed(() =>
  allGoals.value.filter((item) => item.id !== props.goalId && item.parentGoalId !== props.goalId),
)

async function load() {
  loading.value = true
  loadError.value = null
  try {
    const [detail, list] = await Promise.all([goalsApi.get(props.goalId), goalsApi.list()])
    goal.value = detail
    allGoals.value = list
  } catch (error) {
    loadError.value = getErrorMessage(error)
    toast.error(loadError.value)
  } finally {
    loading.value = false
  }
}

watch(() => props.goalId, load, { immediate: true })

async function run(task: () => Promise<Goal>) {
  try {
    goal.value = await task()
  } catch (error) {
    toast.error(getErrorMessage(error))
  }
}

async function setStatus(status: GoalStatus) {
  if (!goal.value || goal.value.status === status) return
  await run(() => goalsApi.update(goal.value!.id, { status }))
}

async function setParent(raw: string) {
  if (!goal.value) return
  await run(() => goalsApi.update(goal.value!.id, { parentGoalId: raw || null }))
}

async function addKeyResult() {
  if (!goal.value || !krTitle.value.trim()) return
  await run(() => goalsApi.createKeyResult(goal.value!.id, { title: krTitle.value.trim(), metricType: krType.value }))
  krTitle.value = ''
}

function onCheckInUpdated(next: Goal) {
  goal.value = next
}

async function removeKr(kr: KeyResult) {
  if (!goal.value) return
  const ok = await confirm({
    title: `Remove “${kr.title}”?`,
    description: 'This key result and its linked tasks will be removed from the goal.',
    confirmLabel: 'Remove',
  })
  if (!ok) return
  await run(() => goalsApi.removeKeyResult(goal.value!.id, kr.id))
}

async function removeGoal() {
  if (!goal.value) return
  const ok = await confirm({
    title: `Delete “${goal.value.title}”?`,
    description: 'This deletes the goal and all key results.',
    confirmLabel: 'Delete',
  })
  if (!ok) return
  try {
    await goalsApi.remove(goal.value.id)
    toast.success('Goal deleted')
    await router.push({ name: 'goals' })
  } catch (error) {
    toast.error(getErrorMessage(error))
  }
}

async function openLinkPicker(kr: KeyResult) {
  linkTarget.value = kr
  linkQuery.value = ''
  linkResults.value = []
  searching.value = true
  try {
    linkResults.value = await goalsApi.searchIssues('', 20)
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    searching.value = false
  }
}

async function searchLinks() {
  if (!linkTarget.value) return
  searching.value = true
  try {
    linkResults.value = await goalsApi.searchIssues(linkQuery.value, 20)
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    searching.value = false
  }
}

async function linkIssue(issue: LinkableIssue) {
  if (!goal.value || !linkTarget.value) return
  await run(() => goalsApi.addLink(goal.value!.id, linkTarget.value!.id, issue.id))
  linkTarget.value = null
  toast.success(`Linked ${issue.key}`)
}

async function unlink(kr: KeyResult, linkId: string) {
  if (!goal.value) return
  await run(() => goalsApi.removeLink(goal.value!.id, kr.id, linkId))
}

function metricLabel(type: KeyResultMetricType) {
  return (
    {
      percent: 'Percent',
      number: 'Number',
      binary: 'Done / not done',
      linked_progress: 'From linked tasks',
    }[type] ?? type
  )
}
</script>

<template>
  <div class="flex h-full min-h-0 flex-col gap-3 overflow-hidden p-3 sm:gap-4 sm:p-4 lg:p-5">
    <div v-if="loading && !goal" class="space-y-3">
      <Skeleton class="h-10 w-2/3 rounded-xl" />
      <Skeleton class="h-24 w-full rounded-xl" />
      <Skeleton class="h-40 w-full rounded-xl" />
    </div>

    <EmptyState
      v-else-if="loadError && !goal"
      title="Goal did not load"
      :description="loadError"
      class="min-h-0 flex-1"
    >
      <Button @click="load">Try again</Button>
    </EmptyState>

    <template v-else-if="goal">
      <header class="shrink-0 space-y-3">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="min-w-0 space-y-1">
            <div class="flex flex-wrap items-center gap-2">
              <h1 class="text-lg font-semibold tracking-tight sm:text-xl">{{ goal.title }}</h1>
              <span class="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {{ goal.status }}
              </span>
            </div>
            <p v-if="goal.description" class="max-w-2xl text-sm text-muted-foreground">{{ goal.description }}</p>
            <div class="mt-2 grid max-w-md grid-cols-1 gap-2 sm:grid-cols-2">
              <DateField
                :model-value="goal.periodStart ?? ''"
                placeholder="Period start"
                aria-label="Period start"
                size="sm"
                :presets="false"
                period-presets
                :max="goal.periodEnd ?? undefined"
                @update:model-value="(value) => run(() => goalsApi.update(goal!.id, { periodStart: value || null }))"
              />
              <DateField
                :model-value="goal.periodEnd ?? ''"
                placeholder="Period end"
                aria-label="Period end"
                size="sm"
                :presets="false"
                period-presets
                :min="goal.periodStart ?? undefined"
                @update:model-value="(value) => run(() => goalsApi.update(goal!.id, { periodEnd: value || null }))"
              />
            </div>
            <div class="mt-2 flex flex-wrap items-center gap-2 text-xs">
              <label class="flex items-center gap-1.5 text-muted-foreground">
                Parent objective
                <select
                  class="h-8 rounded-md border bg-background px-2 text-foreground"
                  :value="goal.parentGoalId ?? ''"
                  aria-label="Parent objective"
                  @change="setParent(($event.target as HTMLSelectElement).value)"
                >
                  <option value="">None (top-level)</option>
                  <option v-for="option in parentOptions" :key="option.id" :value="option.id">
                    {{ option.title }}
                  </option>
                </select>
              </label>
              <RouterLink
                v-if="goal.parent"
                :to="{ name: 'goal', params: { goalId: goal.parent.id } }"
                class="text-primary hover:underline"
              >
                {{ goal.parent.title }}
              </RouterLink>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <UserAvatar v-if="goal.owner" :user="goal.owner" class="size-8" />
            <Button variant="outline" size="sm" @click="removeGoal"><Trash2 /> Delete</Button>
          </div>
        </div>
        <GoalProgressBar :progress="goal.progress" />
        <div class="flex flex-wrap gap-1.5">
          <Button
            v-for="status in statuses"
            :key="status"
            variant="outline"
            size="sm"
            :class="goal.status === status && 'bg-muted'"
            @click="setStatus(status)"
          >
            {{ status }}
          </Button>
        </div>
      </header>

      <section class="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain pb-4">
        <div v-if="goal.children?.length" class="rounded-xl border bg-card p-3 shadow-soft sm:p-4">
          <h2 class="text-sm font-semibold">Contributing goals</h2>
          <p class="mt-0.5 text-xs text-muted-foreground">Parent progress averages these child objectives.</p>
          <ul class="mt-3 space-y-2">
            <li v-for="child in goal.children" :key="child.id" class="rounded-md border px-3 py-2">
              <div class="flex items-center justify-between gap-2">
                <RouterLink
                  :to="{ name: 'goal', params: { goalId: child.id } }"
                  class="min-w-0 truncate text-sm font-medium hover:underline"
                >
                  {{ child.title }}
                </RouterLink>
                <span class="shrink-0 text-xs tabular-nums text-muted-foreground">{{ child.progress ?? 0 }}%</span>
              </div>
              <GoalProgressBar :progress="child.progress ?? 0" size="sm" class="mt-2" />
            </li>
          </ul>
        </div>

        <div class="flex flex-wrap items-end justify-between gap-2">
          <h2 class="text-sm font-semibold">Key results</h2>
          <form class="flex w-full flex-col gap-2 sm:w-auto sm:flex-row" @submit.prevent="addKeyResult">
            <Input v-model="krTitle" placeholder="New key result" class="sm:w-64" aria-label="Key result title" />
            <select
              v-model="krType"
              class="h-9 rounded-md border bg-background px-2 text-sm"
              aria-label="Metric type"
            >
              <option value="percent">Percent</option>
              <option value="number">Number</option>
              <option value="binary">Binary</option>
              <option value="linked_progress">Linked tasks</option>
            </select>
            <Button type="submit" size="sm" :disabled="!krTitle.trim"><Plus /> Add</Button>
          </form>
        </div>

        <EmptyState
          v-if="!goal.keyResults.length"
          title="No key results yet"
          description="Add measurable outcomes, then link tasks to track them automatically."
        />

        <article
          v-for="kr in goal.keyResults"
          :key="kr.id"
          class="rounded-xl border bg-card p-3 shadow-soft sm:p-4"
        >
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0">
              <h3 class="text-sm font-medium">{{ kr.title }}</h3>
              <p class="text-[11px] text-muted-foreground">{{ metricLabel(kr.metricType) }}</p>
            </div>
            <div class="flex shrink-0 gap-1">
              <Button variant="ghost" size="icon-sm" aria-label="Link work" @click="openLinkPicker(kr)">
                <Link2 />
              </Button>
              <Button variant="ghost" size="icon-sm" aria-label="Remove key result" @click="removeKr(kr)">
                <Trash2 />
              </Button>
            </div>
          </div>

          <div class="mt-3 space-y-2">
            <GoalProgressBar :progress="kr.progress" size="sm" />
            <div v-if="kr.metricType !== 'linked_progress'" class="flex flex-wrap items-center gap-2 text-xs">
              <span class="tabular-nums font-medium">
                {{ kr.currentValue }}{{ kr.unit ? ` ${kr.unit}` : '' }}
              </span>
              <span class="text-muted-foreground">
                of {{ kr.targetValue }}{{ kr.unit ? ` ${kr.unit}` : '' }}
              </span>
              <Button
                variant="outline"
                size="sm"
                class="h-7"
                @click="expandedCheckIn = expandedCheckIn === kr.id ? null : kr.id"
              >
                {{ expandedCheckIn === kr.id ? 'Hide check-ins' : 'Check in' }}
              </Button>
            </div>
            <p v-else class="text-xs text-muted-foreground">
              {{ kr.linkedDone ?? 0 }} / {{ kr.linkedTotal ?? 0 }} linked tasks done · updates when tasks move
            </p>
            <KeyResultCheckInPanel
              v-if="kr.metricType !== 'linked_progress' && expandedCheckIn === kr.id"
              :goal-id="goal.id"
              :key-result="kr"
              @updated="onCheckInUpdated"
            />
          </div>

          <ul v-if="kr.links?.length" class="mt-3 space-y-1.5 border-t pt-3">
            <li
              v-for="link in kr.links"
              :key="link.id"
              class="flex items-center gap-2 rounded-md px-1 py-1 text-sm hover:bg-muted/40"
            >
              <IssueTypeIcon v-if="link.issue?.type" :type="link.issue.type" class="size-3.5" />
              <button
                type="button"
                class="min-w-0 flex-1 truncate text-left hover:underline"
                @click="link.issue && openIssue(link.issue)"
              >
                <span class="font-mono text-[11px] text-muted-foreground">{{ link.issue?.key }}</span>
                {{ link.issue?.title }}
              </button>
              <span
                v-if="link.issue?.status"
                class="hidden text-[10px] text-muted-foreground sm:inline"
              >
                {{ link.issue.status.name }}
              </span>
              <Button variant="ghost" size="icon-sm" aria-label="Unlink" @click="unlink(kr, link.id)">
                <Trash2 class="size-3.5" />
              </Button>
            </li>
          </ul>
        </article>
      </section>

      <div
        v-if="linkTarget"
        class="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center"
        @click.self="linkTarget = null"
      >
        <div class="max-h-[80vh] w-full max-w-md overflow-hidden rounded-xl border bg-card shadow-lg">
          <div class="border-b p-3">
            <h3 class="text-sm font-semibold">Link work to “{{ linkTarget.title }}”</h3>
            <form class="mt-2 flex gap-2" @submit.prevent="searchLinks">
              <Input v-model="linkQuery" placeholder="Search tasks…" aria-label="Search tasks" />
              <Button type="submit" size="sm" :loading="searching">Search</Button>
            </form>
          </div>
          <ul class="max-h-80 overflow-y-auto p-2">
            <li v-for="issue in linkResults" :key="issue.id">
              <button
                type="button"
                class="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-muted"
                @click="linkIssue(issue)"
              >
                <IssueTypeIcon :type="issue.type as IssueType" class="size-3.5" />
                <span class="min-w-0 flex-1 truncate">
                  <span class="font-mono text-[11px] text-muted-foreground">{{ issue.key }}</span>
                  {{ issue.title }}
                </span>
              </button>
            </li>
            <li v-if="!linkResults.length && !searching" class="px-2 py-6 text-center text-sm text-muted-foreground">
              No tasks found
            </li>
          </ul>
        </div>
      </div>
    </template>
  </div>
</template>

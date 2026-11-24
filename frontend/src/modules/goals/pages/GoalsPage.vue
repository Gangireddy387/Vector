<script setup lang="ts">
import { Plus, RefreshCw, Target } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import EmptyState from '@/components/common/EmptyState.vue'
import PageFrame from '@/components/common/PageFrame.vue'
import UserAvatar from '@/components/common/UserAvatar.vue'
import { DateField } from '@/components/forms'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { useDevice } from '@/composables/useDevice'
import { formatDate } from '@/lib/format'
import { getErrorMessage } from '@/lib/http'
import type { Goal, GoalStatus } from '@/types/models'
import GoalProgressBar from '../components/GoalProgressBar.vue'
import { goalsApi } from '../goals.api'

const router = useRouter()
const { isPhone } = useDevice()

const goals = ref<Goal[]>([])
const loading = ref(false)
const loadError = ref<string | null>(null)
const statusFilter = ref<GoalStatus | 'all'>('active')
const creating = ref(false)
const isSaving = ref(false)
const form = ref({ title: '', description: '', periodStart: '', periodEnd: '' })

const filtered = computed(() =>
  statusFilter.value === 'all' ? goals.value : goals.value.filter((goal) => goal.status === statusFilter.value),
)

const avgProgress = computed(() => {
  if (!filtered.value.length) return 0
  return Math.round(filtered.value.reduce((sum, goal) => sum + (goal.progress || 0), 0) / filtered.value.length)
})

async function load() {
  loading.value = true
  loadError.value = null
  try {
    goals.value = await goalsApi.list()
  } catch (error) {
    loadError.value = getErrorMessage(error)
    toast.error(loadError.value)
  } finally {
    loading.value = false
  }
}

watch(statusFilter, () => undefined)
void load()

async function createGoal() {
  if (!form.value.title.trim()) return
  isSaving.value = true
  try {
    const goal = await goalsApi.create({
      title: form.value.title.trim(),
      description: form.value.description.trim() || null,
      periodStart: form.value.periodStart || null,
      periodEnd: form.value.periodEnd || null,
      status: 'active',
    })
    creating.value = false
    form.value = { title: '', description: '', periodStart: '', periodEnd: '' }
    toast.success('Goal created')
    await router.push({ name: 'goal', params: { goalId: goal.id } })
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    isSaving.value = false
  }
}

function periodLabel(goal: Goal) {
  if (!goal.periodStart && !goal.periodEnd) return 'No period'
  return `${formatDate(goal.periodStart)} – ${formatDate(goal.periodEnd)}`
}
</script>

<template>
  <PageFrame mode="bare" pad="compact" class="flex h-full min-h-0 flex-col gap-3 overflow-hidden sm:gap-4">
    <header class="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div class="min-w-0 space-y-1">
        <h1 class="text-lg font-semibold tracking-tight sm:text-xl lg:text-2xl">Goals & OKRs</h1>
        <p class="text-sm text-muted-foreground">
          Organization objectives with measurable key results. Link tasks to auto-track progress.
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" :loading="loading" @click="load"><RefreshCw /></Button>
        <Button size="sm" @click="creating = true"><Plus /> New goal</Button>
      </div>
    </header>

    <div class="flex shrink-0 flex-wrap items-center gap-2">
      <Button
        v-for="option in ([
          { value: 'active', label: 'Active' },
          { value: 'draft', label: 'Draft' },
          { value: 'completed', label: 'Completed' },
          { value: 'all', label: 'All' },
        ] as const)"
        :key="option.value"
        variant="outline"
        size="sm"
        :aria-pressed="statusFilter === option.value"
        :class="statusFilter === option.value && 'bg-muted'"
        @click="statusFilter = option.value"
      >
        {{ option.label }}
      </Button>
      <span v-if="!isPhone" class="ml-auto text-xs text-muted-foreground">
        {{ filtered.length }} goals · avg {{ avgProgress }}%
      </span>
    </div>

    <div v-if="loading && !goals.length" class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      <Skeleton v-for="index in 3" :key="index" class="h-40 rounded-xl" />
    </div>

    <EmptyState
      v-else-if="loadError && !goals.length"
      :icon="Target"
      title="Goals did not load"
      :description="loadError"
      class="min-h-0 flex-1"
    >
      <Button @click="load">Try again</Button>
    </EmptyState>

    <EmptyState
      v-else-if="!filtered.length"
      :icon="Target"
      title="No goals yet"
      description="Create an objective for this quarter, then add key results and link work."
      class="min-h-0 flex-1"
    >
      <Button @click="creating = true"><Plus /> New goal</Button>
    </EmptyState>

    <div v-else class="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain pb-2">
      <button
        v-for="goal in filtered"
        :key="goal.id"
        type="button"
        class="w-full rounded-xl border bg-card p-4 text-left shadow-soft transition hover:border-primary/30 hover:bg-muted/20"
        @click="router.push({ name: 'goal', params: { goalId: goal.id } })"
      >
        <div class="flex items-start gap-3">
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <h2 class="truncate text-sm font-semibold sm:text-base">{{ goal.title }}</h2>
              <span class="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {{ goal.status }}
              </span>
            </div>
            <p class="mt-1 line-clamp-2 text-xs text-muted-foreground sm:text-sm">
              {{ goal.description || periodLabel(goal) }}
            </p>
          </div>
          <UserAvatar v-if="goal.owner" :user="goal.owner" class="size-7 shrink-0" />
        </div>
        <div class="mt-3 space-y-1.5">
          <GoalProgressBar :progress="goal.progress" />
          <p class="text-[11px] text-muted-foreground">
            {{ goal.keyResults?.length ?? 0 }} key result{{ (goal.keyResults?.length ?? 0) === 1 ? '' : 's' }}
            <template v-if="goal.children?.length"> · {{ goal.children.length }} child goal{{ goal.children.length === 1 ? '' : 's' }}</template>
            <template v-if="goal.parent"> · under {{ goal.parent.title }}</template>
            · {{ periodLabel(goal) }}
          </p>
        </div>
      </button>
    </div>

    <Dialog :open="creating" @update:open="(open: boolean) => (creating = open)">
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New goal</DialogTitle>
          <DialogDescription>What should the organization achieve this period?</DialogDescription>
        </DialogHeader>
        <form class="space-y-3" @submit.prevent="createGoal">
          <Input v-model="form.title" placeholder="Objective title" aria-label="Goal title" required />
          <Textarea v-model="form.description" placeholder="Optional description" rows="3" aria-label="Description" />
          <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <DateField
              v-model="form.periodStart"
              placeholder="Period start"
              aria-label="Period start"
              :presets="false"
              period-presets
              :max="form.periodEnd || undefined"
            />
            <DateField
              v-model="form.periodEnd"
              placeholder="Period end"
              aria-label="Period end"
              :presets="false"
              period-presets
              :min="form.periodStart || undefined"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" @click="creating = false">Cancel</Button>
            <Button type="submit" :loading="isSaving" :disabled="!form.title.trim()">Create</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </PageFrame>
</template>

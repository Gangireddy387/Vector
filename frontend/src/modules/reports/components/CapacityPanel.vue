<script setup lang="ts">
import { Gauge } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import EmptyState from '@/components/common/EmptyState.vue'
import UserAvatar from '@/components/common/UserAvatar.vue'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { SelectField } from '@/components/forms'
import { Skeleton } from '@/components/ui/skeleton'
import { getErrorMessage } from '@/lib/http'
import { useAuthStore } from '@/modules/auth/auth.store'
import { useProjectsStore } from '@/modules/projects/projects.store'
import { useWorkspaceStore } from '@/stores/workspace.store'
import { type CapacityReport, type CapacityStatus, reportsApi } from '../reports.api'

const props = defineProps<{ lockedProjectId?: string }>()

const auth = useAuthStore()
const projects = useProjectsStore()
const workspace = useWorkspaceStore()

const HORIZONS = [
  { value: '1', label: '1 week' },
  { value: '2', label: '2 weeks' },
  { value: '4', label: '4 weeks' },
  { value: '8', label: '8 weeks' },
]

const report = ref<CapacityReport | null>(null)
const isLoading = ref(true)
const errorMessage = ref('')
const projectId = ref(props.lockedProjectId ?? '')
const horizonWeeks = ref('2')
const hoursPerWeek = ref(String(Math.round((workspace.settings.capacity?.minutesPerWeek ?? 2400) / 60)))
const isSavingCapacity = ref(false)

const projectOptions = computed(() => [
  { value: '', label: 'All projects' },
  ...projects.activeProjects.map((project) => ({ value: project.id, label: `${project.key} · ${project.name}` })),
])

const canSaveOrgCapacity = computed(() => auth.hasPermission('workspace.manage'))

watch(
  () => props.lockedProjectId,
  (id) => {
    if (id) projectId.value = id
  },
)

function formatHours(minutes: number) {
  const hours = minutes / 60
  return Number.isInteger(hours) ? `${hours}h` : `${hours.toFixed(1)}h`
}

function barClass(status: CapacityStatus) {
  if (status === 'over') return 'bg-destructive'
  if (status === 'full') return 'bg-amber-500'
  if (status === 'healthy') return 'bg-primary'
  if (status === 'light') return 'bg-emerald-500/80'
  return 'bg-muted-foreground/40'
}

function statusLabel(status: CapacityStatus) {
  if (status === 'over') return 'Overloaded'
  if (status === 'full') return 'Near capacity'
  if (status === 'healthy') return 'Healthy'
  if (status === 'light') return 'Has room'
  return 'Unassigned'
}

async function load() {
  isLoading.value = true
  errorMessage.value = ''
  try {
    if (!projects.isLoaded) await projects.fetchProjects()
    const minutes = Math.max(60, Math.min(10080, Math.round(Number(hoursPerWeek.value || 40) * 60)))
    report.value = await reportsApi.capacity({
      projectId: props.lockedProjectId || projectId.value || undefined,
      horizonWeeks: Number(horizonWeeks.value) || 2,
      minutesPerWeek: minutes,
    })
  } catch (error) {
    report.value = null
    errorMessage.value = getErrorMessage(error)
  } finally {
    isLoading.value = false
  }
}

async function saveOrgDefault() {
  if (!canSaveOrgCapacity.value) return
  isSavingCapacity.value = true
  try {
    const minutesPerWeek = Math.max(60, Math.min(10080, Math.round(Number(hoursPerWeek.value || 40) * 60)))
    await workspace.update({ capacity: { minutesPerWeek } })
    hoursPerWeek.value = String(Math.round(minutesPerWeek / 60))
    toast.success('Default weekly capacity saved')
    await load()
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    isSavingCapacity.value = false
  }
}

watch([projectId, horizonWeeks], load, { immediate: true })
</script>

<template>
  <div class="space-y-4">
    <Card>
      <CardHeader class="pb-3">
        <CardTitle class="flex items-center gap-2"><Gauge class="size-4" /> Capacity</CardTitle>
        <CardDescription>
          Open work vs weekly capacity. Effort uses task estimates, otherwise story points (4h each), otherwise 1 day.
        </CardDescription>
      </CardHeader>
      <CardContent class="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <div v-if="!lockedProjectId" class="min-w-[12rem] flex-1 space-y-1.5">
          <p class="text-xs font-medium text-muted-foreground">Project</p>
          <SelectField v-model="projectId" :options="projectOptions" aria-label="Project" />
        </div>
        <div class="w-full space-y-1.5 sm:w-36">
          <p class="text-xs font-medium text-muted-foreground">Horizon</p>
          <SelectField v-model="horizonWeeks" :options="HORIZONS" aria-label="Capacity horizon" />
        </div>
        <div class="w-full space-y-1.5 sm:w-36">
          <p class="text-xs font-medium text-muted-foreground">Hours / week</p>
          <Input v-model="hoursPerWeek" type="number" min="1" max="168" aria-label="Hours per week" @change="load" />
        </div>
        <Button v-if="canSaveOrgCapacity" variant="outline" :loading="isSavingCapacity" @click="saveOrgDefault">Save as org default</Button>
        <Button variant="ghost" :disabled="isLoading" @click="load">Refresh</Button>
      </CardContent>
    </Card>

    <div v-if="isLoading" class="space-y-3">
      <Skeleton class="h-24 w-full" />
      <Skeleton class="h-64 w-full" />
    </div>
    <EmptyState v-else-if="errorMessage" title="Could not load capacity" :description="errorMessage" />
    <template v-else-if="report">
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card class="gap-1 p-4">
          <p class="text-xs text-muted-foreground">Open load</p>
          <p class="text-2xl font-semibold tabular-nums">{{ formatHours(report.totals.loadMinutes) }}</p>
          <p class="text-xs text-muted-foreground">{{ report.totals.open }} open tasks · {{ report.totals.openPoints || '—' }} pts</p>
        </Card>
        <Card class="gap-1 p-4">
          <p class="text-xs text-muted-foreground">Capacity window</p>
          <p class="text-2xl font-semibold tabular-nums">{{ formatHours(report.capacityMinutes) }}</p>
          <p class="text-xs text-muted-foreground">{{ report.horizonWeeks }} wk · {{ Math.round(report.minutesPerWeek / 60) }}h/person</p>
        </Card>
        <Card class="gap-1 p-4">
          <p class="text-xs text-muted-foreground">Overloaded</p>
          <p class="text-2xl font-semibold tabular-nums" :class="report.totals.overloaded ? 'text-destructive' : ''">{{ report.totals.overloaded }}</p>
          <p class="text-xs text-muted-foreground">Above 110% of capacity</p>
        </Card>
        <Card class="gap-1 p-4">
          <p class="text-xs text-muted-foreground">Has room</p>
          <p class="text-2xl font-semibold tabular-nums">{{ report.totals.light }}</p>
          <p class="text-xs text-muted-foreground">Under 40% · {{ report.totals.unassigned }} unassigned</p>
        </Card>
      </div>

      <Card class="gap-0 pb-0">
        <CardHeader class="pb-3">
          <CardTitle>People</CardTitle>
          <CardDescription>Who is overbooked for the next {{ report.horizonWeeks }} {{ report.horizonWeeks === 1 ? 'week' : 'weeks' }}.</CardDescription>
        </CardHeader>
        <CardContent class="px-0">
          <p v-if="!report.people.length" class="px-4 py-8 text-center text-sm text-muted-foreground">No people or open work in this scope.</p>
          <ul v-else class="divide-y xl:hidden">
            <li v-for="row in report.people" :key="row.user?.id ?? 'unassigned'" class="space-y-2 px-4 py-3">
              <span class="flex min-w-0 items-center gap-2.5">
                <UserAvatar :user="row.user" size="sm" />
                <span class="min-w-0 flex-1 truncate" :class="!row.user && 'text-muted-foreground italic'">{{ row.user?.name ?? 'Unassigned' }}</span>
                <span class="shrink-0 text-xs font-medium" :class="row.status === 'over' ? 'text-destructive' : 'text-muted-foreground'">{{ statusLabel(row.status) }}</span>
              </span>
              <span v-if="row.user" class="block h-1.5 bg-muted">
                <span class="block h-full transition-[width]" :class="barClass(row.status)" :style="{ width: `${Math.min(100, row.utilization ?? 0)}%` }" />
              </span>
              <span class="grid grid-cols-3 gap-2 text-xs">
                <span><span class="block text-muted-foreground">Load</span><span class="font-medium tabular-nums">{{ formatHours(row.loadMinutes) }}</span></span>
                <span><span class="block text-muted-foreground">Open</span><span class="font-medium tabular-nums">{{ row.open }}</span></span>
                <span><span class="block text-muted-foreground">Weeks</span><span class="font-medium tabular-nums">{{ row.weeksOfWork ?? '—' }}</span></span>
              </span>
            </li>
          </ul>
          <div v-if="report.people.length" class="hidden overflow-x-auto xl:block">
            <table class="w-full text-sm">
              <thead>
                <tr class="border-y bg-muted/40 text-left text-xs font-medium text-muted-foreground">
                  <th class="px-4 py-2 font-semibold">Person</th>
                  <th class="w-1/3 px-3 py-2 font-semibold">Utilization</th>
                  <th class="px-3 py-2 text-right font-semibold">Load</th>
                  <th class="px-3 py-2 text-right font-semibold">Open</th>
                  <th class="px-3 py-2 text-right font-semibold">Points</th>
                  <th class="px-3 py-2 text-right font-semibold">Overdue</th>
                  <th class="px-4 py-2 text-right font-semibold">Weeks of work</th>
                </tr>
              </thead>
              <tbody class="divide-y">
                <tr v-for="row in report.people" :key="row.user?.id ?? 'unassigned'">
                  <td class="px-4 py-2.5">
                    <span class="flex items-center gap-2.5">
                      <UserAvatar :user="row.user" size="sm" />
                      <span class="min-w-0">
                        <span class="block truncate" :class="!row.user && 'text-muted-foreground italic'">{{ row.user?.name ?? 'Unassigned' }}</span>
                        <span class="text-[11px] text-muted-foreground">{{ statusLabel(row.status) }}</span>
                      </span>
                    </span>
                  </td>
                  <td class="px-3 py-2.5">
                    <span v-if="row.user" class="flex items-center gap-2">
                      <span class="h-2 flex-1 bg-muted">
                        <span class="block h-full transition-[width]" :class="barClass(row.status)" :style="{ width: `${Math.min(100, row.utilization ?? 0)}%` }" />
                      </span>
                      <span class="w-10 text-right tabular-nums">{{ row.utilization }}%</span>
                    </span>
                    <span v-else class="text-muted-foreground">—</span>
                  </td>
                  <td class="px-3 py-2.5 text-right tabular-nums">{{ formatHours(row.loadMinutes) }}</td>
                  <td class="px-3 py-2.5 text-right tabular-nums">{{ row.open }}</td>
                  <td class="px-3 py-2.5 text-right text-muted-foreground tabular-nums">{{ row.openPoints || '—' }}</td>
                  <td class="px-3 py-2.5 text-right tabular-nums" :class="row.overdue ? 'font-semibold text-destructive' : 'text-muted-foreground'">{{ row.overdue }}</td>
                  <td class="px-4 py-2.5 text-right tabular-nums">{{ row.weeksOfWork ?? '—' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </template>
  </div>
</template>

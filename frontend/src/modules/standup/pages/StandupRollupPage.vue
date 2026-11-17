<script setup lang="ts">
import { AlertTriangle, ArrowRight, CheckCircle2, ClipboardList, RefreshCw, Users } from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import EmptyState from '@/components/common/EmptyState.vue'
import PageHeader from '@/components/common/PageHeader.vue'
import UserAvatar from '@/components/common/UserAvatar.vue'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { useDevice } from '@/composables/useDevice'
import { formatDate, timeAgo } from '@/lib/format'
import { getErrorMessage } from '@/lib/http'
import { useAuthStore } from '@/modules/auth/auth.store'
import { type DashboardData, type StandupRollupItem, dashboardApi } from '@/modules/dashboard/dashboard.api'
import BlockerPersonActions from '../components/BlockerPersonActions.vue'

const auth = useAuthStore()
const { isDesktop } = useDevice()
const rows = ref<StandupRollupItem[]>([])
const isLoading = ref(true)
const error = ref<string | null>(null)

const needsAttention = computed(() => rows.value.filter((row) => row.missing.length || row.blockers.length))
const complete = computed(() => rows.value.filter((row) => !row.missing.length && !row.blockers.length))
const rollupDate = computed(() => rows.value[0]?.date ?? null)
const lastLoadedAt = ref<Date | null>(null)
const totals = computed(() => ({
  projects: rows.value.length,
  posted: rows.value.reduce((sum, row) => sum + row.posted, 0),
  expected: rows.value.reduce((sum, row) => sum + row.expected, 0),
  blockers: rows.value.reduce((sum, row) => sum + row.blockers.length, 0),
  missing: rows.value.reduce((sum, row) => sum + row.missing.length, 0),
}))

/** Flat manager morning list — act before scanning project cards. */
const flatBlockers = computed(() =>
  rows.value.flatMap((row) =>
    row.blockers.map((item, index) => ({
      key: `${row.projectId}-${item.user.id}-${index}`,
      projectId: row.projectId,
      projectName: row.projectName,
      projectColor: row.projectColor,
      date: row.date,
      user: item.user,
      blockers: item.blockers,
    })),
  ),
)

async function load() {
  isLoading.value = true
  error.value = null
  try {
    const data: DashboardData = await dashboardApi.get()
    rows.value = data.standupRollup ?? []
    lastLoadedAt.value = new Date()
  } catch (problem) {
    error.value = getErrorMessage(problem)
  } finally {
    isLoading.value = false
  }
}

onMounted(() => void load())

const percent = (row: StandupRollupItem) => (row.expected ? Math.round((row.posted / row.expected) * 100) : 0)
</script>

<template>
  <div class="min-h-0 w-full flex-1 space-y-4 overflow-y-auto sm:space-y-5" :class="isDesktop ? 'p-4 sm:p-5 lg:p-6' : 'p-3 pb-2'">
    <PageHeader
      v-if="isDesktop"
      title="Standup rollup"
      :description="
        rollupDate
          ? `For ${formatDate(rollupDate, 'EEE d MMM')}${lastLoadedAt ? ` · updated ${timeAgo(lastLoadedAt)}` : ''} — clear blockers first, then chase missing posts.`
          : 'Manager morning view — clear blockers first, then chase missing posts across projects you lead.'
      "
    >
      <template #actions>
        <Button variant="outline" size="sm" :loading="isLoading" @click="load"><RefreshCw /> Refresh</Button>
      </template>
    </PageHeader>
    <div v-else class="flex items-center justify-between gap-2 px-1">
      <p class="text-sm text-muted-foreground">
        <template v-if="rollupDate">{{ formatDate(rollupDate, 'EEE d MMM') }}</template>
        <template v-else>Projects you lead or admin</template>
        <template v-if="lastLoadedAt"> · {{ timeAgo(lastLoadedAt) }}</template>
      </p>
      <Button variant="ghost" size="icon-sm" aria-label="Refresh" @click="load"><RefreshCw /></Button>
    </div>

    <div v-if="isLoading && !rows.length" class="space-y-3">
      <Skeleton v-for="index in 3" :key="index" class="h-28 w-full rounded-xl" />
    </div>
    <EmptyState v-else-if="error && !rows.length" :icon="RefreshCw" title="Rollup did not load" :description="error">
      <Button variant="outline" @click="load">Try again</Button>
    </EmptyState>
    <EmptyState
      v-else-if="!rows.length"
      :icon="ClipboardList"
      title="No standup projects to roll up"
      description="You need to be a project admin or lead on a project with standups enabled."
    />

    <template v-else>
      <section
        v-if="flatBlockers.length"
        class="overflow-hidden rounded-xl border border-destructive/30 bg-destructive/[0.04] shadow-soft"
      >
        <header class="flex flex-wrap items-center gap-2 border-b border-destructive/20 px-4 py-3">
          <AlertTriangle class="size-4 text-destructive" />
          <h2 class="text-sm font-semibold">Clear blockers first</h2>
          <span class="rounded-full bg-destructive/15 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-destructive">
            {{ flatBlockers.length }}
          </span>
          <p class="w-full text-xs text-muted-foreground sm:ml-auto sm:w-auto">Assign a task, message, or start a quick meet</p>
        </header>
        <ul class="divide-y divide-destructive/15">
          <li v-for="item in flatBlockers" :key="item.key" class="space-y-2 px-4 py-3">
            <div class="flex flex-wrap items-start gap-2">
              <UserAvatar :user="item.user" size="sm" />
              <div class="min-w-0 flex-1">
                <p class="text-[13px] font-semibold">
                  {{ item.user.name }}
                  <span class="font-normal text-muted-foreground"> · {{ item.projectName }}</span>
                </p>
                <p class="mt-1 whitespace-pre-wrap text-[13px] text-muted-foreground">{{ item.blockers }}</p>
              </div>
              <Button size="sm" variant="ghost" class="shrink-0 text-muted-foreground" as-child>
                <RouterLink :to="{ name: 'project-standup', params: { projectId: item.projectId }, query: { date: item.date } }">
                  Standup <ArrowRight />
                </RouterLink>
              </Button>
            </div>
            <BlockerPersonActions
              v-if="item.user.id !== auth.user?.id"
              :user="item.user"
              :project-id="item.projectId"
              :blocker-text="item.blockers"
            />
          </li>
        </ul>
      </section>

      <div class="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <div class="rounded-xl border border-border bg-card px-3 py-2.5 shadow-soft">
          <p class="text-[11px] text-muted-foreground">Projects</p>
          <p class="text-lg font-semibold tabular-nums">{{ totals.projects }}</p>
        </div>
        <div class="rounded-xl border border-border bg-card px-3 py-2.5 shadow-soft">
          <p class="text-[11px] text-muted-foreground">Posted</p>
          <p class="text-lg font-semibold tabular-nums">{{ totals.posted }}/{{ totals.expected }}</p>
        </div>
        <div class="rounded-xl border border-border bg-card px-3 py-2.5 shadow-soft">
          <p class="text-[11px] text-muted-foreground">Missing</p>
          <p class="text-lg font-semibold tabular-nums" :class="totals.missing && 'text-amber-700 dark:text-amber-300'">{{ totals.missing }}</p>
        </div>
        <div class="rounded-xl border border-border bg-card px-3 py-2.5 shadow-soft">
          <p class="text-[11px] text-muted-foreground">Blockers</p>
          <p class="text-lg font-semibold tabular-nums" :class="totals.blockers && 'text-destructive'">{{ totals.blockers }}</p>
        </div>
      </div>

      <section v-if="needsAttention.length" class="space-y-2.5">
        <h2 class="flex items-center gap-1.5 text-sm font-semibold"><AlertTriangle class="size-4 text-amber-600 dark:text-amber-400" /> By project</h2>
        <article
          v-for="row in needsAttention"
          :key="row.projectId"
          class="overflow-hidden rounded-xl border border-border bg-card shadow-soft"
        >
          <header class="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
            <span class="size-2.5 shrink-0 rounded-[3px]" :style="{ backgroundColor: row.projectColor }" />
            <div class="min-w-0 flex-1">
              <p class="truncate text-[14px] font-semibold">{{ row.projectName }}</p>
              <p class="text-[12px] text-muted-foreground tabular-nums">{{ row.posted }}/{{ row.expected }} posted · {{ percent(row) }}%</p>
            </div>
            <Button size="sm" variant="outline" as-child>
              <RouterLink :to="{ name: 'project-standup', params: { projectId: row.projectId }, query: { date: row.date } }">
                Open standup <ArrowRight />
              </RouterLink>
            </Button>
          </header>
          <div class="space-y-3 px-4 py-3">
            <Progress :model-value="percent(row)" class="h-1.5" :indicator-class="row.blockers.length ? 'bg-destructive' : 'bg-amber-500'" />
            <div v-if="row.missing.length">
              <p class="mb-1.5 flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground"><Users class="size-3.5" /> Still waiting</p>
              <ul class="flex flex-wrap gap-2">
                <li v-for="person in row.missing" :key="person.id" class="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 py-0.5 pr-2.5 pl-0.5 text-[12px]">
                  <UserAvatar :user="person" size="xs" /> {{ person.name.split(' ')[0] }}
                </li>
              </ul>
            </div>
            <div v-if="row.blockers.length">
              <p class="mb-1.5 flex items-center gap-1.5 text-[12px] font-medium text-destructive"><AlertTriangle class="size-3.5" /> Blockers</p>
              <ul class="space-y-2">
                <li v-for="(item, index) in row.blockers" :key="`${row.projectId}-${index}`" class="space-y-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2">
                  <p class="flex items-center gap-2 text-[12.5px] font-medium"><UserAvatar :user="item.user" size="xs" /> {{ item.user.name }}</p>
                  <p class="whitespace-pre-wrap text-[12.5px] text-muted-foreground">{{ item.blockers }}</p>
                  <BlockerPersonActions
                    v-if="item.user.id !== auth.user?.id"
                    :user="item.user"
                    :project-id="row.projectId"
                    :blocker-text="item.blockers"
                  />
                </li>
              </ul>
            </div>
          </div>
        </article>
      </section>

      <section v-if="complete.length" class="space-y-2.5">
        <h2 class="flex items-center gap-1.5 text-sm font-semibold"><CheckCircle2 class="size-4 text-success" /> Complete</h2>
        <ul class="divide-y divide-border/70 overflow-hidden rounded-xl border border-border bg-card shadow-soft">
          <li v-for="row in complete" :key="row.projectId">
            <RouterLink
              :to="{ name: 'project-standup', params: { projectId: row.projectId }, query: { date: row.date } }"
              class="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-accent/50"
            >
              <span class="size-2.5 shrink-0 rounded-[3px]" :style="{ backgroundColor: row.projectColor }" />
              <span class="min-w-0 flex-1 truncate text-[13px] font-medium">{{ row.projectName }}</span>
              <span class="text-[12px] text-muted-foreground tabular-nums">{{ row.posted }}/{{ row.expected }}</span>
              <ArrowRight class="size-3.5 text-muted-foreground" />
            </RouterLink>
          </li>
        </ul>
      </section>

      <p v-if="!auth.hasFeature('chat')" class="text-xs text-muted-foreground">Standups need Team chat & standups on your plan.</p>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ArrowRight, Building2, Crown, FolderKanban, Plus, Search, UserRoundX, Users, UsersRound } from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'
import { toast } from 'vue-sonner'
import EmptyState from '@/components/common/EmptyState.vue'
import PageHeader from '@/components/common/PageHeader.vue'
import StatCard from '@/components/common/StatCard.vue'
import UserAvatar from '@/components/common/UserAvatar.vue'
import UserAvatarStack from '@/components/common/UserAvatarStack.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { useDevice } from '@/composables/useDevice'
import { getErrorMessage } from '@/lib/http'
import { useAuthStore } from '@/modules/auth/auth.store'
import { departmentPeople, useStructureStore } from '../departments.store'

const structure = useStructureStore()
const auth = useAuthStore()
const isAdmin = computed(() => auth.isOrganizationAdmin)
const { isDesktop } = useDevice()
const search = ref('')
const loadError = ref('')

async function load() {
  loadError.value = ''
  try {
    await structure.load()
  } catch (error) {
    loadError.value = getErrorMessage(error)
    toast.error(loadError.value)
  }
}
onMounted(load)

const matches = (value: string | null | undefined, term: string) => Boolean(value?.toLowerCase().includes(term))

const visible = computed(() => {
  const term = search.value.trim().toLowerCase()
  if (!term) return structure.departments ?? []
  return (structure.departments ?? []).filter(
    (department) =>
      matches(department.name, term) ||
      matches(department.description, term) ||
      matches(department.head?.name, term) ||
      department.teams.some(
        (team) =>
          matches(team.name, term) ||
          matches(team.description, term) ||
          matches(team.lead?.name, term) ||
          team.members.some((member) => matches(member.name, term) || matches(member.email, term)),
      ),
  )
})

const STATS = computed(() => [
  { label: 'Departments', value: structure.totals.departments, icon: Building2, tone: 'default' as const, hint: 'Across the organization' },
  { label: 'Teams', value: structure.totals.teams, icon: UsersRound, tone: 'info' as const, hint: 'Inside departments' },
  { label: 'People in teams', value: structure.totals.placed, icon: Users, tone: 'success' as const, hint: 'Placed in a team' },
  {
    label: 'Not in a team yet',
    value: structure.totals.unplaced,
    icon: UserRoundX,
    tone: structure.totals.unplaced ? ('warning' as const) : ('default' as const),
    hint: structure.totals.unplaced ? 'Add them to a team' : 'Everyone is placed',
  },
])
</script>

<template>
  <div class="w-full space-y-4 sm:space-y-5" :class="isDesktop ? 'p-4 sm:p-5 lg:p-6' : 'p-3'">
    <PageHeader
      title="Departments"
      :description="
        isAdmin
          ? 'How your organization is organized: departments, their teams and the people in them.'
          : 'The departments and teams you belong to.'
      "
    >
      <template v-if="isAdmin" #actions>
        <Button variant="brand" class="max-sm:w-full" as-child>
          <RouterLink :to="{ name: 'department-create' }"><Plus /> New department</RouterLink>
        </Button>
      </template>
    </PageHeader>

    <div v-if="isAdmin" class="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
      <StatCard
        v-for="stat in STATS"
        :key="stat.label"
        variant="card"
        :label="stat.label"
        :value="structure.departments ? stat.value : '–'"
        :icon="stat.icon"
        :tone="stat.tone"
        :hint="stat.hint"
      />
    </div>

    <div v-if="structure.departments?.length" class="relative w-full max-w-md">
      <Search class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input v-model="search" class="pl-9" placeholder="Search departments or teams…" aria-label="Search departments or teams" />
    </div>

    <EmptyState
      v-if="loadError && structure.departments === null"
      :icon="Building2"
      title="Couldn’t load departments"
      :description="loadError"
      class="border border-dashed bg-card/60 py-12 sm:py-16"
    >
      <Button variant="outline" @click="load">Retry</Button>
    </EmptyState>

    <div v-else-if="structure.departments === null" class="grid gap-3 sm:gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <Skeleton v-for="index in 3" :key="index" class="h-52 w-full sm:h-56" />
    </div>

    <EmptyState
      v-else-if="!structure.departments.length"
      :icon="Building2"
      :title="isAdmin ? 'No departments yet' : 'You are not in a department yet'"
      :description="
        isAdmin
          ? 'Start with a department such as Engineering or Sales, choose its head, then add teams inside it.'
          : 'When an organization admin adds you to a team, its department shows up here.'
      "
      class="border border-dashed bg-card/60 py-12 sm:py-16"
    >
      <Button v-if="isAdmin" variant="brand" as-child><RouterLink :to="{ name: 'department-create' }"><Plus /> Create the first department</RouterLink></Button>
    </EmptyState>

    <EmptyState v-else-if="!visible.length" :icon="Search" :title="`Nothing matches “${search}”`" class="border border-dashed py-12" />

    <div v-else class="grid gap-3 sm:gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <RouterLink
        v-for="department in visible"
        :key="department.id"
        :to="{ name: 'department', params: { departmentId: department.id } }"
        class="group flex min-w-0 flex-col rounded-xl border border-border bg-card shadow-soft transition-[border-color,box-shadow] hover:border-input hover:shadow-elevated focus-visible:ring-[3px] focus-visible:ring-ring/30 focus-visible:outline-none"
      >
        <div class="flex items-start gap-3 p-4 sm:p-5">
          <span class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary sm:size-10">
            <Building2 class="size-4 sm:size-5" />
          </span>
          <div class="min-w-0 flex-1">
            <h2 class="truncate text-[15px] font-semibold tracking-tight sm:text-base">{{ department.name }}</h2>
            <p class="mt-0.5 line-clamp-2 text-[13px] text-muted-foreground sm:min-h-10 sm:text-sm">{{ department.description || 'No description yet.' }}</p>
          </div>
          <ArrowRight class="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
        </div>

        <div class="mx-4 flex items-center gap-2.5 rounded-lg bg-muted/60 px-3 py-2.5 sm:mx-5">
          <Crown class="size-4 shrink-0 text-amber-500" />
          <template v-if="department.head">
            <UserAvatar :user="department.head" size="sm" />
            <span class="min-w-0 flex-1">
              <span class="block truncate text-sm font-medium">{{ department.head.name }}</span>
              <span class="block text-[11px] text-muted-foreground">Department head</span>
            </span>
          </template>
          <span v-else class="text-sm text-muted-foreground">No department head yet</span>
        </div>

        <div class="mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 pt-3 pb-4 text-xs text-muted-foreground sm:px-5 sm:pt-4 sm:pb-5">
          <span class="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span class="inline-flex items-center gap-1"><FolderKanban class="size-3.5" /> {{ department.projectCount }}</span>
            <span class="inline-flex items-center gap-1"><UsersRound class="size-3.5" /> {{ department.teams.length }}</span>
            <span class="inline-flex items-center gap-1"><Users class="size-3.5" /> {{ departmentPeople(department).length }}</span>
          </span>
          <UserAvatarStack v-if="departmentPeople(department).length" :users="departmentPeople(department)" :max="4" />
        </div>
      </RouterLink>
    </div>
  </div>
</template>

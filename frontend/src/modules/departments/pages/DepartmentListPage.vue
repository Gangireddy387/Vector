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

onMounted(() => structure.load().catch((error) => toast.error(getErrorMessage(error))))

const visible = computed(() => {
  const term = search.value.trim().toLowerCase()
  return (structure.departments ?? []).filter(
    (department) => !term || department.name.toLowerCase().includes(term) || department.teams.some((team) => team.name.toLowerCase().includes(term)),
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
  <div class="w-full space-y-5" :class="isDesktop ? 'p-5' : 'p-3'">
    <PageHeader
      title="Departments"
      :description="
        isAdmin
          ? 'How your organization is organized: departments, their teams and the people in them.'
          : 'The departments and teams you belong to.'
      "
    >
      <template v-if="isAdmin" #actions>
        <Button variant="brand" as-child><RouterLink :to="{ name: 'department-create' }"><Plus /> New department</RouterLink></Button>
      </template>
    </PageHeader>

    <div v-if="isAdmin" class="grid grid-cols-2 divide-x divide-border overflow-hidden rounded-xl border border-border bg-card shadow-soft lg:grid-cols-4">
      <StatCard
        v-for="stat in STATS"
        :key="stat.label"
        :label="stat.label"
        :value="structure.departments ? stat.value : '–'"
        :icon="stat.icon"
        :tone="stat.tone"
        :hint="stat.hint"
      />
    </div>

    <div v-if="structure.departments?.length" class="relative max-w-sm">
      <Search class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input v-model="search" class="pl-9" placeholder="Search departments or teams…" aria-label="Search departments or teams" />
    </div>

    <div v-if="structure.departments === null" class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <Skeleton v-for="index in 3" :key="index" class="h-56 w-full" />
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
      class="border border-dashed bg-card/60 py-16"
    >
      <Button v-if="isAdmin" variant="brand" as-child><RouterLink :to="{ name: 'department-create' }"><Plus /> Create the first department</RouterLink></Button>
    </EmptyState>

    <EmptyState v-else-if="!visible.length" :icon="Search" :title="`Nothing matches “${search}”`" class="border border-dashed py-12" />

    <div v-else class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <RouterLink
        v-for="department in visible"
        :key="department.id"
        :to="{ name: 'department', params: { departmentId: department.id } }"
        class="group flex flex-col rounded-xl border border-border bg-card shadow-soft transition-[border-color,box-shadow] hover:border-input hover:shadow-elevated focus-visible:ring-[3px] focus-visible:ring-ring/30 focus-visible:outline-none"
      >
        <div class="flex items-start gap-3 p-5">
          <span class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary"><Building2 class="size-5" /></span>
          <div class="min-w-0 flex-1">
            <h2 class="truncate text-base font-semibold tracking-tight">{{ department.name }}</h2>
            <p class="line-clamp-2 min-h-10 text-sm text-muted-foreground">{{ department.description || 'No description yet.' }}</p>
          </div>
          <ArrowRight class="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
        </div>

        <div class="mx-5 flex items-center gap-2.5 rounded-lg bg-muted/60 px-3 py-2.5">
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

        <div class="mt-auto flex items-center justify-between gap-3 px-5 pt-4 pb-5 text-xs text-muted-foreground">
          <span class="flex items-center gap-3">
            <span class="inline-flex items-center gap-1"><FolderKanban class="size-3.5" /> {{ department.projectCount }} project{{ department.projectCount === 1 ? '' : 's' }}</span>
            <span class="inline-flex items-center gap-1"><UsersRound class="size-3.5" /> {{ department.teams.length }} team{{ department.teams.length === 1 ? '' : 's' }}</span>
            <span class="inline-flex items-center gap-1"><Users class="size-3.5" /> {{ departmentPeople(department).length }} people</span>
          </span>
          <UserAvatarStack v-if="departmentPeople(department).length" :users="departmentPeople(department)" :max="4" />
        </div>
      </RouterLink>
    </div>
  </div>
</template>

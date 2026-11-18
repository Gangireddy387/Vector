<script setup lang="ts">
import { Archive, FolderKanban, Plus, Search, Star, Users } from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { toast } from 'vue-sonner'
import EmptyState from '@/components/common/EmptyState.vue'
import PageHeader from '@/components/common/PageHeader.vue'
import UserAvatar from '@/components/common/UserAvatar.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { useDevice } from '@/composables/useDevice'
import { formatDate } from '@/lib/format'
import { getErrorMessage } from '@/lib/http'
import { useAuthStore } from '@/modules/auth/auth.store'
import CreateProjectDialog from '../components/CreateProjectDialog.vue'
import { useProjectsStore } from '../projects.store'

const projects = useProjectsStore()
const auth = useAuthStore()
const route = useRoute()
const { isDesktop } = useDevice()
const isLoading = ref(!projects.projects.length)
const loadError = ref<string | null>(null)
const isCreateOpen = ref(route.query.welcome === '1')
const search = ref('')
const typeFilter = ref<'all' | 'scrum' | 'kanban'>('all')
const showArchived = ref(false)
const pendingFavorite = ref<string | null>(null)

const orgId = computed(() => auth.organization?.id ?? null)
const favoriteIds = computed(() => new Set(orgId.value ? (auth.user?.preferences?.favoriteProjectIds?.[orgId.value] ?? []) : []))

async function load() {
  isLoading.value = true
  loadError.value = null
  try {
    await projects.fetchProjects(true, showArchived.value)
  } catch (error) {
    loadError.value = getErrorMessage(error)
  } finally {
    isLoading.value = false
  }
}

onMounted(() => void load())

const completion = (summary?: { total: number; done: number }) => (summary?.total ? Math.round((summary.done / summary.total) * 100) : 0)

const visible = computed(() => {
  const term = search.value.trim().toLowerCase()
  const base = showArchived.value ? projects.projects : projects.activeProjects
  return base
    .filter((project) => {
      if (typeFilter.value !== 'all' && project.type !== typeFilter.value) return false
      if (!term) return true
      return `${project.name} ${project.key} ${project.description ?? ''}`.toLowerCase().includes(term)
    })
    .slice()
    .sort((a, b) => {
      const aFav = favoriteIds.value.has(a.id) ? 0 : 1
      const bFav = favoriteIds.value.has(b.id) ? 0 : 1
      if (aFav !== bFav) return aFav - bFav
      return a.name.localeCompare(b.name)
    })
})

async function toggleFavorite(projectId: string, event: Event) {
  event.preventDefault()
  event.stopPropagation()
  const organizationId = orgId.value
  if (!organizationId || !auth.user || pendingFavorite.value) return

  const previous = auth.user.preferences?.favoriteProjectIds?.[organizationId] ?? []
  const next = previous.includes(projectId) ? previous.filter((id) => id !== projectId) : [...previous, projectId]
  const previousPrefs = auth.user.preferences
  // Optimistic: update the star before the request finishes.
  auth.user = {
    ...auth.user,
    preferences: {
      ...previousPrefs,
      favoriteProjectIds: { ...(previousPrefs.favoriteProjectIds ?? {}), [organizationId]: next },
    },
  }
  pendingFavorite.value = projectId
  try {
    await auth.updateProfile({ preferences: { favoriteProjectIds: { [organizationId]: next } } })
  } catch (error) {
    if (auth.user) {
      auth.user = { ...auth.user, preferences: previousPrefs }
    }
    toast.error(getErrorMessage(error))
  } finally {
    pendingFavorite.value = null
  }
}

async function onShowArchived(value: boolean) {
  showArchived.value = value
  await load()
}
</script>

<template>
  <div class="min-h-full w-full space-y-4 sm:space-y-5" :class="isDesktop ? 'p-4 sm:p-5 lg:p-6' : 'p-3'">
    <PageHeader
      title="Projects"
      :description="auth.isOrganizationAdmin ? 'Every project in the organization. As an admin you can open all of them.' : 'Every project you are a member of.'"
    >
      <template #actions>
        <Button class="max-sm:w-full" @click="isCreateOpen = true"><Plus /> New project</Button>
      </template>
    </PageHeader>

    <div class="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      <div class="relative min-w-0 flex-1 sm:max-w-sm">
        <Search class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input v-model="search" class="pl-9" placeholder="Search projects" aria-label="Search projects" />
      </div>
      <div class="flex h-9 items-center rounded-md bg-muted p-0.5" role="tablist" aria-label="Project type">
        <button
          v-for="option in [
            { value: 'all', label: 'All' },
            { value: 'scrum', label: 'Scrum' },
            { value: 'kanban', label: 'Kanban' },
          ] as const"
          :key="option.value"
          type="button"
          role="tab"
          class="h-8 rounded-[5px] px-2.5 text-xs font-medium transition-colors"
          :class="typeFilter === option.value ? 'bg-card text-foreground shadow-[0_0_0_1px_var(--border)]' : 'text-muted-foreground'"
          :aria-selected="typeFilter === option.value"
          @click="typeFilter = option.value"
        >
          {{ option.label }}
        </button>
      </div>
      <label class="flex items-center gap-2 text-xs text-muted-foreground">
        <Switch :model-value="showArchived" aria-label="Show archived projects" @update:model-value="onShowArchived" />
        Show archived
      </label>
    </div>

    <div v-if="isLoading" class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true" aria-label="Loading projects">
      <Skeleton v-for="index in 3" :key="index" class="h-40 rounded-2xl" />
    </div>

    <EmptyState
      v-else-if="loadError"
      :icon="FolderKanban"
      title="Projects did not load"
      :description="loadError"
    >
      <Button variant="outline" @click="load">Try again</Button>
    </EmptyState>

    <EmptyState
      v-else-if="!visible.length"
      :icon="FolderKanban"
      :title="search || typeFilter !== 'all' || showArchived ? 'No projects match' : 'Create your first project'"
      :description="
        search || typeFilter !== 'all' || showArchived
          ? 'Try another search or clear filters.'
          : 'Projects hold your board, backlog, automation rules and reports.'
      "
    >
      <Button v-if="search || typeFilter !== 'all'" variant="outline" @click=";(search = ''), (typeFilter = 'all')">Clear filters</Button>
      <Button v-else @click="isCreateOpen = true"><Plus /> New project</Button>
    </EmptyState>

    <div v-else class="stagger-in grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      <RouterLink
        v-for="project in visible"
        :key="project.id"
        :to="{ name: 'project-board', params: { projectId: project.id } }"
        class="surface-hover card-modern group flex min-w-0 flex-col gap-4 rounded-2xl p-4 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:p-5"
        :class="project.archivedAt && 'opacity-80'"
      >
        <div class="flex items-start gap-3">
          <span class="flex size-9 shrink-0 items-center justify-center rounded-lg text-[13px] font-bold text-white shadow-glow" :style="{ backgroundColor: project.color }">
            {{ project.key.slice(0, 2) }}
          </span>
          <div class="min-w-0 flex-1">
            <p class="truncate font-semibold group-hover:text-primary">{{ project.name }}</p>
            <p class="text-xs text-muted-foreground">{{ project.key }} · {{ project.type === 'scrum' ? 'Scrum' : 'Kanban' }}</p>
          </div>
          <button
            type="button"
            class="rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-60"
            :aria-label="favoriteIds.has(project.id) ? 'Remove from favorites' : 'Add to favorites'"
            :disabled="pendingFavorite === project.id"
            @click="toggleFavorite(project.id, $event)"
          >
            <Star class="size-4" :class="favoriteIds.has(project.id) && 'fill-warning text-warning'" />
          </button>
          <Badge v-if="project.archivedAt" variant="outline"><Archive class="size-3" /> Archived</Badge>
          <Badge v-else variant="secondary" class="capitalize">{{ project.myRole }}</Badge>
        </div>
        <p v-if="project.description" class="line-clamp-2 text-sm text-muted-foreground">{{ project.description }}</p>
        <div class="mt-auto space-y-2">
          <div class="flex justify-between text-xs text-muted-foreground">
            <span>{{ project.issueSummary?.open ?? 0 }} open · {{ project.issueSummary?.done ?? 0 }} done</span>
            <span>{{ completion(project.issueSummary) }}%</span>
          </div>
          <Progress :model-value="completion(project.issueSummary)" class="h-1.5" />
          <div class="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span class="flex items-center gap-1.5"><UserAvatar :user="project.lead" size="xs" /> {{ project.lead?.name ?? 'No lead' }}</span>
            <span class="flex items-center gap-1"><Users class="size-3.5" /> {{ project.memberCount }}</span>
          </div>
          <p v-if="project.activeSprint" class="text-xs text-success">
            {{ project.activeSprint.name }} · ends {{ formatDate(project.activeSprint.endDate, 'd MMM') }}
          </p>
        </div>
      </RouterLink>
    </div>

    <CreateProjectDialog v-model:open="isCreateOpen" />
  </div>
</template>

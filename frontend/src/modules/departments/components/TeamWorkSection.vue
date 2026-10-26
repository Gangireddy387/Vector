<script setup lang="ts">
import { FolderKanban, FolderPlus, Link2, Search, X } from 'lucide-vue-next'
import { computed, onMounted, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import EmptyState from '@/components/common/EmptyState.vue'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useConfirm } from '@/composables/useConfirm'
import { getErrorMessage } from '@/lib/http'
import { useAuthStore } from '@/modules/auth/auth.store'
import CreateProjectDialog from '@/modules/projects/components/CreateProjectDialog.vue'
import type { TeamWork } from '@/types/models'
import { structureApi } from '../departments.api'
import ProjectRow from './ProjectRow.vue'

/** The Projects tab of a team: the projects it owns (with their tasks), creating new ones and bringing in existing ones. */
const props = defineProps<{ teamId: string; teamName: string }>()
const emit = defineEmits<{ changed: [] }>()
const confirm = useConfirm()
const auth = useAuthStore()
const isAdmin = computed(() => auth.isOrganizationAdmin)

const work = ref<TeamWork | null>(null)
const busyId = ref<string | null>(null)
const isCreateOpen = ref(false)
const isAdding = ref(false)
const search = ref('')

async function load() {
  try {
    work.value = await structureApi.teamWork(props.teamId)
  } catch (error) {
    toast.error(getErrorMessage(error))
  }
}
onMounted(load)
watch(() => props.teamId, load)

const summary = computed(() => {
  const totals = work.value?.totals
  const count = work.value?.projects.length ?? 0
  if (!totals) return ''
  const parts = [`${count} project${count === 1 ? '' : 's'}`, `${totals.done} of ${totals.total} tasks done`]
  if (totals.overdue) parts.push(`${totals.overdue} overdue`)
  return parts.join(' · ')
})

const candidates = computed(() => {
  const term = search.value.trim().toLowerCase()
  return (work.value?.otherProjects ?? []).filter((project) => !term || project.name.toLowerCase().includes(term) || project.key.toLowerCase().includes(term))
})

const describeOwner = (project: TeamWork['otherProjects'][number]) =>
  project.team ? `In ${project.team.name}${project.team.departmentName ? ` · ${project.team.departmentName}` : ''}` : 'Not in a team yet'

function changed() {
  void load()
  emit('changed')
}

async function add(project: TeamWork['otherProjects'][number]) {
  if (
    project.team &&
    !(await confirm({
      title: `Move ${project.name} to ${props.teamName}?`,
      description: `It currently belongs to ${project.team.name}. Its tasks will count towards ${props.teamName} instead.`,
      confirmLabel: 'Move project',
    }))
  )
    return
  busyId.value = project.id
  try {
    work.value = await structureApi.addProject(props.teamId, project.id)
    toast.success(`${project.name} added to ${props.teamName}`)
    isAdding.value = false
    emit('changed')
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    busyId.value = null
  }
}

async function remove(project: TeamWork['projects'][number]) {
  if (!(await confirm({ title: `Remove ${project.name} from ${props.teamName}?`, description: 'The project and its tasks stay as they are; it just no longer belongs to this team.', confirmLabel: 'Remove', destructive: true }))) return
  busyId.value = project.id
  try {
    work.value = await structureApi.removeProject(props.teamId, project.id)
    toast.success(`${project.name} removed from ${props.teamName}`)
    emit('changed')
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    busyId.value = null
  }
}

const openCreate = () => (isCreateOpen.value = true)
function openAdd() {
  search.value = ''
  isAdding.value = true
}
defineExpose({ openCreate, openAdd })
</script>

<template>
  <section class="space-y-3">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <p class="text-sm text-muted-foreground">{{ summary }}</p>
      <div v-if="isAdmin" class="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" @click="isAdding ? (isAdding = false) : openAdd()">
          <component :is="isAdding ? X : Link2" /> {{ isAdding ? 'Close' : 'Add existing project' }}
        </Button>
        <Button variant="brand" size="sm" @click="openCreate"><FolderPlus /> New project</Button>
      </div>
    </div>

    <div v-if="isAdding" class="border border-primary/30 bg-card shadow-soft">
      <div class="relative border-b border-border/60">
        <Search class="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          v-model="search"
          class="h-11 w-full bg-transparent pr-4 pl-10 text-sm outline-none placeholder:text-muted-foreground"
          placeholder="Search the organization's projects…"
          aria-label="Search projects"
          autofocus
        />
      </div>
      <ul class="max-h-72 overflow-y-auto">
        <li v-for="project in candidates" :key="project.id" class="flex items-center gap-3 px-4 py-2.5 hover:bg-accent/30">
          <span class="size-2.5 shrink-0 rounded-full" :style="{ backgroundColor: project.color }" />
          <span class="min-w-0 flex-1">
            <span class="block truncate text-sm font-medium">{{ project.name }} <span class="text-xs font-normal text-muted-foreground">{{ project.key }}</span></span>
            <span class="block text-xs text-muted-foreground">{{ describeOwner(project) }}</span>
          </span>
          <Button size="sm" :variant="project.team ? 'outline' : 'default'" :loading="busyId === project.id" :disabled="busyId !== null" @click="add(project)">
            {{ project.team ? 'Move here' : 'Add' }}
          </Button>
        </li>
        <li v-if="!candidates.length" class="px-4 py-8 text-center text-sm text-muted-foreground">
          {{ search ? `No project matches “${search}”` : 'Every project in the organization already belongs to this team.' }}
        </li>
      </ul>
    </div>

    <Skeleton v-if="!work" class="h-40 w-full" />

    <EmptyState
      v-else-if="!work.projects.length"
      :icon="FolderKanban"
      title="No projects yet"
      :description="isAdmin ? `Projects hold ${teamName}'s tasks. Create one, or bring in a project that already exists.` : `${teamName} has no projects yet.`"
      class="border border-dashed bg-card/60 py-14"
    >
      <div v-if="isAdmin" class="flex flex-wrap justify-center gap-2">
        <Button variant="brand" @click="openCreate"><FolderPlus /> New project</Button>
        <Button variant="outline" @click="openAdd"><Link2 /> Add existing project</Button>
      </div>
    </EmptyState>

    <ul v-else class="divide-y divide-border/60 overflow-hidden border border-border/80 bg-card shadow-soft">
      <ProjectRow v-for="project in work.projects" :key="project.id" :project="project">
        <template v-if="isAdmin" #actions>
          <Button
            variant="ghost"
            size="icon-sm"
            class="text-muted-foreground hover:text-destructive"
            :loading="busyId === project.id"
            :disabled="busyId !== null"
            :title="`Remove ${project.name} from ${teamName}`"
            :aria-label="`Remove ${project.name} from ${teamName}`"
            @click="remove(project)"
          >
            <X />
          </Button>
        </template>
      </ProjectRow>
    </ul>

    <CreateProjectDialog v-model:open="isCreateOpen" :team-id="teamId" :team-name="teamName" @created="changed" />
  </section>
</template>

<script setup lang="ts">
import { ArrowRight, Building2, CheckCircle2, Crown, Ellipsis, FolderKanban, Pencil, Plus, Trash2, Users, UsersRound } from 'lucide-vue-next'
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import EmptyState from '@/components/common/EmptyState.vue'
import UserAvatar from '@/components/common/UserAvatar.vue'
import UserAvatarStack from '@/components/common/UserAvatarStack.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useConfirm } from '@/composables/useConfirm'
import { useDevice } from '@/composables/useDevice'
import { getErrorMessage } from '@/lib/http'
import type { TeamWork, UserSummary, WorkCounts } from '@/types/models'
import ProjectRow from '../components/ProjectRow.vue'
import SetupGuide from '../components/SetupGuide.vue'
import StructureBreadcrumb from '../components/StructureBreadcrumb.vue'
import { structureApi } from '../departments.api'
import { departmentPeople, useStructureStore } from '../departments.store'

/** Department home: who leads it and its numbers (header), what to set up next, then its Teams, Projects and People tabs. */
const props = defineProps<{ departmentId: string }>()
const structure = useStructureStore()
const route = useRoute()
const router = useRouter()
const confirm = useConfirm()
const { isDesktop } = useDevice()

onMounted(() => structure.load().catch((error) => toast.error(getErrorMessage(error))))

const department = computed(() => structure.department(props.departmentId))
const people = computed(() => (department.value ? departmentPeople(department.value) : []))
const percent = (counts: WorkCounts) => (counts.total ? Math.round((counts.done / counts.total) * 100) : 0)

const TABS = ['teams', 'projects', 'people'] as const
const tab = computed({
  get: () => (TABS.includes(route.query.tab as (typeof TABS)[number]) ? (route.query.tab as string) : 'teams'),
  set: (value: string) => void router.replace({ query: { ...route.query, tab: value === 'teams' ? undefined : value } }),
})

// --- Projects tab: every project, grouped by the team that owns it -----------------------
const projectGroups = ref<Array<{ id: string; name: string; projects: TeamWork['projects'] }> | null>(null)
async function loadProjects() {
  try {
    projectGroups.value = await structureApi.departmentProjects(props.departmentId)
  } catch (error) {
    toast.error(getErrorMessage(error))
  }
}
watch(
  () => [tab.value, props.departmentId] as const,
  ([current]) => {
    if (current === 'projects') void loadProjects()
  },
  { immediate: true },
)

// --- People tab: everyone with their roles -------------------------------------------------
const roster = computed(() => {
  const current = department.value
  if (!current) return []
  const byId = new Map<string, { person: UserSummary; isHead: boolean; leads: string[]; memberOf: string[] }>()
  const entry = (person: UserSummary) => {
    if (!byId.has(person.id)) byId.set(person.id, { person, isHead: false, leads: [], memberOf: [] })
    return byId.get(person.id)!
  }
  if (current.head) entry(current.head).isHead = true
  for (const team of current.teams) {
    for (const member of team.members) {
      const item = entry(member)
      if (member.id === team.leadId) item.leads.push(team.name)
      else item.memberOf.push(team.name)
    }
  }
  return [...byId.values()].sort((a, b) => Number(b.isHead) - Number(a.isHead) || b.leads.length - a.leads.length || a.person.name.localeCompare(b.person.name))
})

// --- Next steps --------------------------------------------------------------------------
const steps = computed(() => {
  const current = department.value
  if (!current) return []
  const firstTeam = current.teams[0]
  return [
    {
      label: 'Choose a department head',
      description: 'The person who oversees every team here.',
      done: Boolean(current.headId),
      actionLabel: 'Choose head',
      action: () => router.push({ name: 'department-edit', params: { departmentId: current.id } }),
    },
    {
      label: 'Add a team',
      description: 'Teams group the people who work together.',
      done: current.teams.length > 0,
      actionLabel: 'New team',
      action: () => router.push({ name: 'team-create', params: { departmentId: current.id } }),
    },
    {
      label: 'Give a team a project',
      description: 'Projects hold the tasks; each belongs to a team.',
      done: current.projectCount > 0,
      actionLabel: firstTeam ? `Open ${firstTeam.name}` : 'New team',
      action: () =>
        firstTeam
          ? router.push({ name: 'team', params: { teamId: firstTeam.id } })
          : router.push({ name: 'team-create', params: { departmentId: current.id } }),
    },
  ]
})

async function remove() {
  const current = department.value
  if (!current) return
  const teams = current.teams.length ? ` and its ${current.teams.length} team${current.teams.length === 1 ? '' : 's'}` : ''
  if (!(await confirm({ title: `Delete ${current.name}?`, description: `This removes the department${teams}. People and projects stay in the organization.`, confirmLabel: 'Delete department', destructive: true }))) return
  try {
    structure.set(await structureApi.removeDepartment(current.id))
    toast.success(`${current.name} deleted`)
    await router.replace({ name: 'departments' })
  } catch (error) {
    toast.error(getErrorMessage(error))
  }
}
</script>

<template>
  <div class="w-full space-y-5" :class="isDesktop ? 'p-5' : 'p-3'">
    <div v-if="structure.departments === null" class="space-y-4">
      <Skeleton class="h-36 w-full" />
      <Skeleton class="h-64 w-full" />
    </div>

    <EmptyState v-else-if="!department" :icon="Building2" title="Department not found" description="It may have been deleted." class="border border-dashed py-16">
      <Button variant="outline" as-child><RouterLink :to="{ name: 'departments' }">All departments</RouterLink></Button>
    </EmptyState>

    <template v-else>
      <!-- Header: identity and key facts -->
      <section class="relative overflow-hidden border border-border/80 bg-card shadow-soft">
        <div
          class="pointer-events-none absolute inset-0 opacity-80"
          style="background: radial-gradient(40rem 14rem at 0% 0%, color-mix(in oklch, var(--brand-from) 12%, transparent), transparent 70%)"
        />
        <div class="relative space-y-4 p-5 sm:p-6">
          <div class="flex items-start gap-4">
            <span class="flex size-14 shrink-0 items-center justify-center bg-brand text-white shadow-glow"><Building2 class="size-6" /></span>
            <div class="min-w-0 flex-1 space-y-1.5">
              <StructureBreadcrumb :items="[{ label: 'Departments', to: { name: 'departments' } }, { label: department.name }]" />
              <h1 class="truncate text-2xl font-bold tracking-tight sm:text-3xl">{{ department.name }}</h1>
              <p class="max-w-2xl text-sm text-muted-foreground">{{ department.description || 'No description yet.' }}</p>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger as-child>
                <Button variant="outline" size="icon" aria-label="Department actions"><Ellipsis /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem @select="router.push({ name: 'department-edit', params: { departmentId: department.id } })"><Pencil /> Edit department</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" @select="remove"><Trash2 /> Delete department</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <dl class="flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-border/60 pt-4 text-sm">
            <div class="flex items-center gap-2">
              <dt class="sr-only">Department head</dt>
              <Crown class="size-4 text-amber-500" />
              <dd v-if="department.head" class="flex items-center gap-2">
                <UserAvatar :user="department.head" size="sm" />
                <span><span class="font-medium">{{ department.head.name }}</span> <span class="text-muted-foreground">· Department head</span></span>
              </dd>
              <dd v-else class="text-muted-foreground">No department head yet</dd>
            </div>
            <div class="flex items-center gap-2 text-muted-foreground">
              <dt class="sr-only">Teams</dt>
              <UsersRound class="size-4" />
              <dd>{{ department.teams.length }} team{{ department.teams.length === 1 ? '' : 's' }}</dd>
            </div>
            <div class="flex items-center gap-2 text-muted-foreground">
              <dt class="sr-only">Projects</dt>
              <FolderKanban class="size-4" />
              <dd>{{ department.projectCount }} project{{ department.projectCount === 1 ? '' : 's' }}</dd>
            </div>
            <div class="flex items-center gap-2 text-muted-foreground">
              <dt class="sr-only">People</dt>
              <Users class="size-4" />
              <dd>{{ people.length }} {{ people.length === 1 ? 'person' : 'people' }}</dd>
            </div>
            <div class="flex items-center gap-2 text-muted-foreground">
              <dt class="sr-only">Tasks</dt>
              <CheckCircle2 class="size-4 text-success" />
              <dd>{{ percent(department.work) }}% of tasks done<template v-if="department.work.overdue"> · <span class="font-medium text-destructive">{{ department.work.overdue }} overdue</span></template></dd>
            </div>
          </dl>
        </div>
      </section>

      <SetupGuide :title="`Set up ${department.name}`" :steps="steps" />

      <Tabs v-model="tab" class="gap-4">
        <TabsList>
          <TabsTrigger value="teams"><UsersRound /> Teams <span class="ml-1 bg-muted px-1.5 text-xs tabular-nums">{{ department.teams.length }}</span></TabsTrigger>
          <TabsTrigger value="projects"><FolderKanban /> Projects <span class="ml-1 bg-muted px-1.5 text-xs tabular-nums">{{ department.projectCount }}</span></TabsTrigger>
          <TabsTrigger value="people"><Users /> People <span class="ml-1 bg-muted px-1.5 text-xs tabular-nums">{{ roster.length }}</span></TabsTrigger>
        </TabsList>

        <!-- Teams -->
        <TabsContent value="teams" class="space-y-3">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <p class="text-sm text-muted-foreground">Open a team to manage its projects, tasks and members.</p>
            <Button variant="brand" size="sm" as-child>
              <RouterLink :to="{ name: 'team-create', params: { departmentId: department.id } }"><Plus /> New team</RouterLink>
            </Button>
          </div>

          <EmptyState
            v-if="!department.teams.length"
            :icon="UsersRound"
            title="No teams yet"
            description="Add a team, choose its lead and the people in it. Projects and tasks are then created inside the team."
            class="border border-dashed bg-card/60 py-14"
          >
            <Button variant="brand" as-child>
              <RouterLink :to="{ name: 'team-create', params: { departmentId: department.id } }"><Plus /> Add the first team</RouterLink>
            </Button>
          </EmptyState>

          <div v-else class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <RouterLink
              v-for="team in department.teams"
              :key="team.id"
              :to="{ name: 'team', params: { teamId: team.id } }"
              class="group flex flex-col gap-4 border border-border/80 bg-card p-4 shadow-soft transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md focus-visible:ring-4 focus-visible:ring-ring/20 focus-visible:outline-none"
            >
              <div class="flex items-start gap-3">
                <span class="flex size-10 shrink-0 items-center justify-center bg-primary/10 text-primary"><UsersRound class="size-5" /></span>
                <div class="min-w-0 flex-1">
                  <h3 class="truncate font-semibold transition-colors group-hover:text-primary">{{ team.name }}</h3>
                  <p class="line-clamp-2 text-xs text-muted-foreground">{{ team.description || 'No description yet.' }}</p>
                </div>
                <ArrowRight class="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
              </div>
              <div class="flex items-center justify-between gap-2">
                <span v-if="team.lead" class="flex min-w-0 items-center gap-2">
                  <UserAvatar :user="team.lead" size="sm" />
                  <span class="min-w-0">
                    <span class="block truncate text-sm font-medium">{{ team.lead.name }}</span>
                    <span class="block text-[11px] text-muted-foreground">Team lead</span>
                  </span>
                </span>
                <span v-else class="text-xs text-muted-foreground">No lead yet</span>
                <span class="flex items-center gap-2">
                  <UserAvatarStack v-if="team.members.length" :users="team.members" :max="3" />
                  <span class="text-xs text-muted-foreground tabular-nums">{{ team.members.length }}</span>
                </span>
              </div>
              <div class="space-y-1.5 border-t border-border/60 pt-3">
                <div class="flex items-center justify-between text-xs text-muted-foreground tabular-nums">
                  <span class="inline-flex items-center gap-1"><FolderKanban class="size-3.5" /> {{ team.projectCount }} project{{ team.projectCount === 1 ? '' : 's' }}</span>
                  <span>
                    {{ team.work.done }}/{{ team.work.total }} tasks done
                    <span v-if="team.work.overdue" class="ml-1 font-medium text-destructive">· {{ team.work.overdue }} overdue</span>
                  </span>
                </div>
                <Progress :model-value="percent(team.work)" class="h-1.5" indicator-class="bg-success" />
              </div>
            </RouterLink>
          </div>
        </TabsContent>

        <!-- Projects -->
        <TabsContent value="projects" class="space-y-3">
          <p class="text-sm text-muted-foreground">Every project in {{ department.name }}, grouped by the team that owns it. Create projects from a team's page.</p>
          <Skeleton v-if="projectGroups === null" class="h-40 w-full" />
          <EmptyState
            v-else-if="!projectGroups.some((group) => group.projects.length)"
            :icon="FolderKanban"
            title="No projects yet"
            :description="department.teams.length ? 'Open a team and create its first project.' : 'Add a team first; projects are created inside teams.'"
            class="border border-dashed bg-card/60 py-14"
          >
            <div class="flex flex-wrap justify-center gap-2">
              <Button v-for="team in department.teams.slice(0, 3)" :key="team.id" variant="outline" as-child>
                <RouterLink :to="{ name: 'team', params: { teamId: team.id } }">Open {{ team.name }}</RouterLink>
              </Button>
              <Button v-if="!department.teams.length" variant="brand" as-child>
                <RouterLink :to="{ name: 'team-create', params: { departmentId: department.id } }"><Plus /> New team</RouterLink>
              </Button>
            </div>
          </EmptyState>
          <template v-else>
            <section v-for="group in projectGroups.filter((item) => item.projects.length)" :key="group.id" class="space-y-2">
              <RouterLink :to="{ name: 'team', params: { teamId: group.id } }" class="inline-flex items-center gap-1.5 text-sm font-semibold transition-colors hover:text-primary">
                <UsersRound class="size-4 text-primary" /> {{ group.name }}
                <span class="font-normal text-muted-foreground">· {{ group.projects.length }}</span>
                <ArrowRight class="size-3.5 text-muted-foreground" />
              </RouterLink>
              <ul class="divide-y divide-border/60 overflow-hidden border border-border/80 bg-card shadow-soft">
                <ProjectRow v-for="project in group.projects" :key="project.id" :project="project" />
              </ul>
            </section>
          </template>
        </TabsContent>

        <!-- People -->
        <TabsContent value="people" class="space-y-3">
          <p class="text-sm text-muted-foreground">Everyone in {{ department.name }} and their role. Add or remove people from a team's Members tab.</p>
          <EmptyState
            v-if="!roster.length"
            :icon="Users"
            title="No people yet"
            description="Choose a department head, or add people to its teams."
            class="border border-dashed bg-card/60 py-14"
          />
          <div v-else class="overflow-hidden border border-border/80 bg-card shadow-soft">
            <div class="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-3 border-b border-border/60 bg-muted/30 px-4 py-2 text-xs font-medium text-muted-foreground">
              <span>Person</span>
              <span>Role</span>
            </div>
            <ul class="divide-y divide-border/60">
              <li v-for="item in roster" :key="item.person.id" class="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] items-center gap-3 px-4 py-3">
                <div class="flex min-w-0 items-center gap-3">
                  <UserAvatar :user="item.person" size="md" />
                  <div class="min-w-0">
                    <p class="truncate text-sm font-medium">{{ item.person.name }}</p>
                    <p class="truncate text-xs text-muted-foreground">{{ item.person.title || item.person.email }}</p>
                  </div>
                </div>
                <div class="flex flex-wrap gap-1.5">
                  <Badge v-if="item.isHead" variant="soft"><Crown /> Department head</Badge>
                  <Badge v-for="name in item.leads" :key="`lead-${name}`" variant="outline"><Crown class="text-amber-500" /> Lead · {{ name }}</Badge>
                  <Badge v-for="name in item.memberOf" :key="`member-${name}`" variant="secondary">{{ name }}</Badge>
                  <span v-if="!item.isHead && !item.leads.length && !item.memberOf.length" class="text-xs text-muted-foreground">—</span>
                </div>
              </li>
            </ul>
          </div>
        </TabsContent>
      </Tabs>
    </template>
  </div>
</template>

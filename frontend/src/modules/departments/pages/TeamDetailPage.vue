<script setup lang="ts">
import { CheckCircle2, Crown, Ellipsis, FolderKanban, Pencil, Trash2, Users, UsersRound } from 'lucide-vue-next'
import { computed, nextTick, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import EmptyState from '@/components/common/EmptyState.vue'
import UserAvatar from '@/components/common/UserAvatar.vue'
import UserAvatarStack from '@/components/common/UserAvatarStack.vue'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useConfirm } from '@/composables/useConfirm'
import { useDevice } from '@/composables/useDevice'
import { getErrorMessage } from '@/lib/http'
import SetupGuide from '../components/SetupGuide.vue'
import StructureBreadcrumb from '../components/StructureBreadcrumb.vue'
import TeamMembersPanel from '../components/TeamMembersPanel.vue'
import TeamWorkSection from '../components/TeamWorkSection.vue'
import { structureApi } from '../departments.api'
import { useStructureStore } from '../departments.store'

/** Team home: who leads it and who is in it (header), what to set up next, then its Projects and Members tabs. */
const props = defineProps<{ teamId: string }>()
const structure = useStructureStore()
const route = useRoute()
const router = useRouter()
const confirm = useConfirm()
const { isDesktop } = useDevice()

onMounted(() => structure.load().catch((error) => toast.error(getErrorMessage(error))))

const team = computed(() => structure.team(props.teamId))
const department = computed(() => (team.value ? structure.department(team.value.departmentId) : null))
const percentDone = computed(() => (team.value?.work.total ? Math.round((team.value.work.done / team.value.work.total) * 100) : 0))

/** The open tab lives in the URL, so links and the back button keep it. */
const tab = computed({
  get: () => (route.query.tab === 'members' ? 'members' : 'projects'),
  set: (value: string) => void router.replace({ query: { ...route.query, tab: value === 'projects' ? undefined : value } }),
})

const workSection = ref<InstanceType<typeof TeamWorkSection> | null>(null)
const membersPanel = ref<InstanceType<typeof TeamMembersPanel> | null>(null)

async function goTo(next: 'projects' | 'members', then?: () => void) {
  tab.value = next
  await nextTick()
  then?.()
}

const steps = computed(() => {
  const current = team.value
  if (!current) return []
  return [
    {
      label: 'Add people',
      description: 'Who works in this team?',
      done: current.members.length > 0,
      actionLabel: 'Add people',
      action: () => goTo('members', () => membersPanel.value?.openAdd()),
    },
    {
      label: 'Choose a team lead',
      description: 'One member who leads the team.',
      done: Boolean(current.leadId),
      actionLabel: 'Choose lead',
      action: () => goTo('members'),
    },
    {
      label: 'Create the first project',
      description: 'Projects hold the team’s tasks.',
      done: current.projectCount > 0,
      actionLabel: 'New project',
      action: () => goTo('projects', () => workSection.value?.openCreate()),
    },
  ]
})

async function remove() {
  const current = team.value
  if (!current) return
  if (!(await confirm({ title: `Delete ${current.name}?`, description: 'Its members stay in the organization and its projects stay, without a team.', confirmLabel: 'Delete team', destructive: true }))) return
  try {
    structure.set(await structureApi.removeTeam(current.id))
    toast.success(`${current.name} deleted`)
    await router.replace({ name: 'department', params: { departmentId: current.departmentId } })
  } catch (error) {
    toast.error(getErrorMessage(error))
  }
}
</script>

<template>
  <div class="w-full space-y-5" :class="isDesktop ? 'p-5' : 'p-3'">
    <div v-if="structure.departments === null" class="space-y-4">
      <Skeleton class="h-36 w-full" />
      <Skeleton class="h-72 w-full" />
    </div>

    <EmptyState v-else-if="!team" :icon="UsersRound" title="Team not found" description="It may have been deleted." class="border border-dashed py-16">
      <Button variant="outline" as-child><RouterLink :to="{ name: 'departments' }">All departments</RouterLink></Button>
    </EmptyState>

    <template v-else>
      <!-- Header: identity and key facts -->
      <section class="relative overflow-hidden border border-border/80 bg-card shadow-soft">
        <div
          class="pointer-events-none absolute inset-0 opacity-80"
          style="background: radial-gradient(40rem 14rem at 0% 0%, color-mix(in oklch, var(--brand-to) 12%, transparent), transparent 70%)"
        />
        <div class="relative space-y-4 p-5 sm:p-6">
          <div class="flex items-start gap-4">
            <span class="flex size-14 shrink-0 items-center justify-center bg-primary/10 text-primary ring-4 ring-primary/5"><UsersRound class="size-6" /></span>
            <div class="min-w-0 flex-1 space-y-1.5">
              <StructureBreadcrumb
                :items="[
                  { label: 'Departments', to: { name: 'departments' } },
                  { label: department?.name ?? 'Department', to: { name: 'department', params: { departmentId: team.departmentId } } },
                  { label: team.name },
                ]"
              />
              <h1 class="truncate text-2xl font-bold tracking-tight sm:text-3xl">{{ team.name }}</h1>
              <p class="max-w-2xl text-sm text-muted-foreground">{{ team.description || 'No description yet.' }}</p>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger as-child>
                <Button variant="outline" size="icon" aria-label="Team actions"><Ellipsis /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem @select="router.push({ name: 'team-edit', params: { teamId: team.id } })"><Pencil /> Edit team</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" @select="remove"><Trash2 /> Delete team</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <dl class="flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-border/60 pt-4 text-sm">
            <div class="flex items-center gap-2">
              <dt class="sr-only">Team lead</dt>
              <Crown class="size-4 text-amber-500" />
              <dd v-if="team.lead" class="flex items-center gap-2">
                <UserAvatar :user="team.lead" size="sm" />
                <span><span class="font-medium">{{ team.lead.name }}</span> <span class="text-muted-foreground">· Team lead</span></span>
              </dd>
              <dd v-else class="text-muted-foreground">No team lead yet</dd>
            </div>
            <div class="flex items-center gap-2">
              <dt class="sr-only">Members</dt>
              <UserAvatarStack v-if="team.members.length" :users="team.members" :max="5" />
              <Users v-else class="size-4 text-muted-foreground" />
              <dd class="text-muted-foreground">{{ team.members.length }} member{{ team.members.length === 1 ? '' : 's' }}</dd>
            </div>
            <div class="flex items-center gap-2 text-muted-foreground">
              <dt class="sr-only">Projects</dt>
              <FolderKanban class="size-4" />
              <dd>{{ team.projectCount }} project{{ team.projectCount === 1 ? '' : 's' }}</dd>
            </div>
            <div class="flex items-center gap-2 text-muted-foreground">
              <dt class="sr-only">Tasks</dt>
              <CheckCircle2 class="size-4 text-success" />
              <dd>{{ percentDone }}% of tasks done<template v-if="team.work.overdue"> · <span class="font-medium text-destructive">{{ team.work.overdue }} overdue</span></template></dd>
            </div>
          </dl>
        </div>
      </section>

      <SetupGuide :title="`Set up ${team.name}`" :steps="steps" />

      <Tabs v-model="tab" class="gap-4">
        <TabsList>
          <TabsTrigger value="projects"><FolderKanban /> Projects <span class="ml-1 bg-muted px-1.5 text-xs tabular-nums">{{ team.projectCount }}</span></TabsTrigger>
          <TabsTrigger value="members"><Users /> Members <span class="ml-1 bg-muted px-1.5 text-xs tabular-nums">{{ team.members.length }}</span></TabsTrigger>
        </TabsList>
        <TabsContent value="projects">
          <TeamWorkSection ref="workSection" :team-id="team.id" :team-name="team.name" @changed="structure.load()" />
        </TabsContent>
        <TabsContent value="members">
          <TeamMembersPanel ref="membersPanel" :team="team" />
        </TabsContent>
      </Tabs>
    </template>
  </div>
</template>

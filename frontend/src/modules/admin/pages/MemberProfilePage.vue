<script setup lang="ts">
import { useClipboard } from '@vueuse/core'
import {
  ArrowLeft,
  Building2,
  CalendarDays,
  CheckCircle2,
  Clock,
  Copy,
  Crown,
  FolderKanban,
  History,
  ListTodo,
  Mail,
  MapPin,
  MessageSquare,
  Pencil,
  Phone,
  Sparkles,
  Timer,
  TriangleAlert,
  UserRound,
  UsersRound,
} from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import EmptyState from '@/components/common/EmptyState.vue'
import UserAvatar from '@/components/common/UserAvatar.vue'
import { SelectField, type SelectFieldOption } from '@/components/forms'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useConfirm } from '@/composables/useConfirm'
import { useDevice } from '@/composables/useDevice'
import { formatDate, timeAgo } from '@/lib/format'
import { getErrorMessage } from '@/lib/http'
import { cityOf, localTime } from '@/lib/timezone'
import { useAuthStore } from '@/modules/auth/auth.store'
import { describeActivity } from '@/modules/issues/activity-format'
import type { WorkspaceRole } from '@/types/models'
import { type MemberProfile, workspaceApi } from '../admin.api'

const props = defineProps<{ userId: string }>()

const auth = useAuthStore()
const confirm = useConfirm()
const { isDesktop } = useDevice()
const { copy } = useClipboard()

const profile = ref<MemberProfile | null>(null)
const notFound = ref(false)

async function load() {
  try {
    profile.value = await workspaceApi.memberProfile(props.userId)
  } catch (error) {
    notFound.value = true
    toast.error(getErrorMessage(error))
  }
}
watch(() => props.userId, () => ((profile.value = null), (notFound.value = false), load()), { immediate: true })

const person = computed(() => profile.value?.person ?? null)
const isSelf = computed(() => person.value?.id === auth.user?.id)
const status = computed(() => (person.value?.status === 'invited' ? 'invited' : (person.value?.membershipStatus ?? 'active')))
const STATUS = {
  active: { label: 'Active', variant: 'success' },
  invited: { label: 'Invitation sent', variant: 'warning' },
  disabled: { label: 'Deactivated', variant: 'outline' },
} as const

/** A soft banner in the person's own colour, so every profile looks a little different. */
const coverStyle = computed(() => {
  const color = person.value?.avatarColor ?? '#6366f1'
  return {
    backgroundImage: `radial-gradient(circle at 85% 20%, rgb(255 255 255 / 0.25), transparent 45%), linear-gradient(120deg, ${color}, color-mix(in oklab, ${color} 45%, #0ea5e9))`,
  }
})

const headline = computed(() => {
  const p = profile.value
  if (!p) return ''
  const lead = p.structure.teams.find((team) => team.isLead)
  const head = p.structure.headOf[0]
  if (head) return `Head of ${head.name}`
  if (lead) return `Team lead · ${lead.name}`
  return p.structure.teams[0] ? `${p.structure.teams[0].name} team` : ''
})

const STATS = computed(() => {
  const stats = profile.value?.stats
  if (!stats) return []
  const hours = Math.round((stats.minutesLoggedRecently / 60) * 10) / 10
  return [
    { label: 'Open tasks', value: stats.openTasks, icon: ListTodo, tone: 'bg-primary/10 text-primary' },
    { label: 'Overdue', value: stats.overdueTasks, icon: TriangleAlert, tone: stats.overdueTasks ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground' },
    { label: `Done · ${stats.recentDays} days`, value: stats.completedRecently, icon: CheckCircle2, tone: 'bg-success/15 text-success' },
    { label: 'Done · all time', value: stats.completedTotal, icon: Sparkles, tone: 'bg-violet-500/15 text-violet-600' },
    { label: `Hours logged · ${stats.recentDays} days`, value: `${hours}h`, icon: Timer, tone: 'bg-amber-500/15 text-amber-600' },
    { label: `Comments · ${stats.recentDays} days`, value: stats.commentsRecently, icon: MessageSquare, tone: 'bg-sky-500/15 text-sky-600' },
  ]
})

const ROLE_OPTIONS: SelectFieldOption[] = [
  { value: 'admin', label: 'Admin', description: 'Organization settings and people' },
  { value: 'member', label: 'Member', description: 'Works in the projects they join' },
]
const PROJECT_ROLE = { admin: 'Project admin', member: 'Member', viewer: 'Viewer' } as const

async function run(task: () => Promise<unknown>, message: string) {
  try {
    await task()
    toast.success(message)
    await load()
  } catch (error) {
    toast.error(getErrorMessage(error))
  }
}
const changeRole = (role: WorkspaceRole) =>
  person.value && run(() => workspaceApi.updateMember(person.value!.id, { workspaceRole: role }), `${person.value.name} is now ${role === 'admin' ? 'an admin' : 'a member'}`)

async function toggleStatus() {
  const target = person.value
  if (!target) return
  const disabling = status.value === 'active'
  if (disabling) {
    const ok = await confirm({
      title: `Deactivate ${target.name}?`,
      description: `They lose access to ${auth.organization?.name ?? 'this organization'} until reactivated. Their work stays intact.`,
      confirmLabel: 'Deactivate',
      destructive: true,
    })
    if (!ok) return
  }
  await run(() => workspaceApi.updateMember(target.id, { status: disabling ? 'disabled' : 'active' }), disabling ? `${target.name} deactivated` : `${target.name} reactivated`)
}

async function copyEmail() {
  if (!person.value) return
  await copy(person.value.email)
  toast.success('Email copied')
}
</script>

<template>
  <div class="w-full" :class="isDesktop ? 'p-5' : 'p-3'">
    <RouterLink
      :to="{ name: 'workspace-admin', query: { tab: 'people' } }"
      class="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft class="size-4" /> People
    </RouterLink>

    <EmptyState v-if="notFound" :icon="UserRound" title="This person is not in the organization" description="They may have been removed. Go back to People to see everyone." class="border border-dashed py-16" />

    <div v-else-if="!profile || !person" class="space-y-4">
      <Skeleton class="h-64 w-full" />
      <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]"><Skeleton class="h-80" /><Skeleton class="h-80" /></div>
    </div>

    <div v-else class="space-y-4">
      <!-- Header card -->
      <section class="overflow-hidden border border-border/80 bg-card shadow-soft">
        <div class="h-32 sm:h-40" :style="coverStyle" />
        <div class="relative px-5 pb-5">
          <div class="-mt-14 flex flex-wrap items-end justify-between gap-4 sm:-mt-16">
            <UserAvatar :user="person" size="xl" class="size-28 text-4xl ring-4 ring-card shadow-lg sm:size-32" />
            <div class="flex flex-wrap items-center gap-2 pb-1">
              <Button variant="outline" size="sm" as-child>
                <a :href="`mailto:${person.email}`"><Mail /> Email</a>
              </Button>
              <template v-if="isSelf">
                <Button variant="soft" size="sm" as-child>
                  <RouterLink :to="{ name: 'settings' }"><Pencil /> Edit my profile</RouterLink>
                </Button>
              </template>
              <template v-else>
                <SelectField
                  :model-value="person.workspaceRole"
                  :options="ROLE_OPTIONS"
                  size="sm"
                  class="w-32"
                  content-class="w-72"
                  align="end"
                  :aria-label="`Organization role of ${person.name}`"
                  @update:model-value="(value) => value && value !== person!.workspaceRole && changeRole(value as WorkspaceRole)"
                />
                <Button
                  v-if="status !== 'invited'"
                  variant="ghost"
                  size="sm"
                  :class="status === 'active' && 'text-destructive hover:text-destructive'"
                  @click="toggleStatus"
                >
                  {{ status === 'active' ? 'Deactivate' : 'Reactivate' }}
                </Button>
              </template>
            </div>
          </div>

          <div class="mt-3 space-y-1.5">
            <div class="flex flex-wrap items-center gap-2">
              <h1 class="text-2xl font-bold tracking-tight">{{ person.name }}</h1>
              <Badge v-if="isSelf" variant="soft">You</Badge>
              <Badge :variant="person.workspaceRole === 'admin' ? 'default' : 'secondary'">
                <Crown v-if="person.workspaceRole === 'admin'" /> {{ person.workspaceRole === 'admin' ? 'Admin' : 'Member' }}
              </Badge>
              <Badge :variant="STATUS[status].variant">{{ STATUS[status].label }}</Badge>
            </div>
            <p class="text-base text-foreground/80">
              {{ person.title || 'No job title yet' }}<template v-if="headline"> · <span class="text-muted-foreground">{{ headline }}</span></template>
            </p>
            <p class="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span v-if="person.location" class="inline-flex items-center gap-1.5"><MapPin class="size-4" /> {{ person.location }}</span>
              <span class="inline-flex items-center gap-1.5"><Clock class="size-4" /> {{ localTime(person.timezone) }} local time · {{ cityOf(person.timezone) }}</span>
              <span class="inline-flex items-center gap-1.5"><CalendarDays class="size-4" /> Joined {{ auth.organization?.name }} {{ formatDate(person.joinedAt, 'MMM yyyy') }}</span>
              <span class="inline-flex items-center gap-1.5">
                <span class="size-2 rounded-full" :class="person.lastSeenAt && Date.now() - new Date(person.lastSeenAt).getTime() < 15 * 60_000 ? 'bg-success' : 'bg-muted-foreground/40'" />
                {{ person.lastSeenAt ? `Active ${timeAgo(person.lastSeenAt)}` : 'Not signed in yet' }}
              </span>
            </p>
          </div>
        </div>
      </section>

      <div class="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div class="min-w-0 space-y-4">
          <!-- About -->
          <section class="border border-border/80 bg-card p-5 shadow-soft">
            <h2 class="mb-2 text-base font-semibold">About</h2>
            <p v-if="person.about" class="text-sm leading-relaxed whitespace-pre-line text-foreground/85">{{ person.about }}</p>
            <p v-else class="text-sm text-muted-foreground">
              {{ isSelf ? 'Tell your team what you work on. Add an about section in Settings.' : `${person.name.split(' ')[0]} has not written an about section yet.` }}
            </p>
          </section>

          <!-- Organization -->
          <section class="border border-border/80 bg-card p-5 shadow-soft">
            <h2 class="mb-3 text-base font-semibold">In {{ auth.organization?.name }}</h2>
            <ul v-if="profile.structure.headOf.length || profile.structure.teams.length" class="space-y-0">
              <li v-for="department in profile.structure.headOf" :key="department.id" class="flex gap-3 border-b border-border/60 py-3 first:pt-0 last:border-b-0 last:pb-0">
                <span class="flex size-11 shrink-0 items-center justify-center bg-amber-500/15 text-amber-600"><Crown class="size-5" /></span>
                <div class="min-w-0">
                  <p class="text-sm font-semibold">Department head</p>
                  <RouterLink :to="{ name: 'department', params: { departmentId: department.id } }" class="text-sm text-foreground/80 transition-colors hover:text-primary">
                    {{ department.name }}
                  </RouterLink>
                  <p class="text-xs text-muted-foreground">Sees every team and project in the department</p>
                </div>
              </li>
              <li v-for="team in profile.structure.teams" :key="team.id" class="flex gap-3 border-b border-border/60 py-3 first:pt-0 last:border-b-0 last:pb-0">
                <span class="flex size-11 shrink-0 items-center justify-center bg-primary/10 text-primary"><UsersRound class="size-5" /></span>
                <div class="min-w-0">
                  <p class="text-sm font-semibold">{{ team.isLead ? 'Team lead' : 'Team member' }}</p>
                  <RouterLink :to="{ name: 'team', params: { teamId: team.id } }" class="text-sm text-foreground/80 transition-colors hover:text-primary">{{ team.name }}</RouterLink>
                  <p v-if="team.department" class="flex items-center gap-1 text-xs text-muted-foreground"><Building2 class="size-3" /> {{ team.department.name }}</p>
                </div>
              </li>
            </ul>
            <p v-else class="text-sm text-muted-foreground">Not in a department or team yet. Add them from Departments.</p>
          </section>

          <!-- Projects -->
          <section class="border border-border/80 bg-card p-5 shadow-soft">
            <div class="mb-3 flex items-center justify-between">
              <h2 class="text-base font-semibold">Projects</h2>
              <span class="text-xs text-muted-foreground">{{ profile.projects.length }}</span>
            </div>
            <div v-if="profile.projects.length" class="grid gap-3 sm:grid-cols-2">
              <RouterLink
                v-for="project in profile.projects"
                :key="project.id"
                :to="{ name: 'project-board', params: { projectId: project.id } }"
                class="group flex items-center gap-3 border border-border/70 p-3 transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md"
              >
                <span class="flex size-10 shrink-0 items-center justify-center text-xs font-bold text-white" :style="{ backgroundColor: project.color }">{{ project.key.slice(0, 3) }}</span>
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-sm font-medium group-hover:text-primary">{{ project.name }}</span>
                  <span class="block truncate text-xs text-muted-foreground">
                    {{ PROJECT_ROLE[project.role] }}<template v-if="project.viaTeam"> · through their team</template>
                  </span>
                </span>
                <span class="shrink-0 text-right text-[11px] leading-tight text-muted-foreground tabular-nums">
                  <span class="block"><b class="text-foreground">{{ project.openTasks }}</b> open</span>
                  <span class="block">{{ project.doneTasks }} done</span>
                </span>
              </RouterLink>
            </div>
            <p v-else class="text-sm text-muted-foreground">Not in any project yet.</p>
          </section>

          <!-- Activity -->
          <section class="border border-border/80 bg-card p-5 shadow-soft">
            <h2 class="mb-3 flex items-center gap-2 text-base font-semibold"><History class="size-4 text-muted-foreground" /> Recent activity</h2>
            <ol v-if="profile.activity.length" class="relative space-y-4 border-l border-border/70 pl-5">
              <li v-for="item in profile.activity" :key="item.id" class="relative">
                <span class="absolute top-1.5 -left-[1.6rem] size-2.5 rounded-full ring-4 ring-card" :style="{ backgroundColor: item.project?.color ?? 'var(--color-primary)' }" />
                <p class="text-sm">
                  <span class="text-foreground/85">{{ describeActivity(item).text }}</span>
                  <template v-if="item.issue">
                    on
                    <RouterLink :to="{ query: { issue: item.issue.key } }" class="font-medium hover:text-primary">{{ item.issue.key }} {{ item.issue.title }}</RouterLink>
                  </template>
                </p>
                <p class="text-xs text-muted-foreground">{{ item.project?.name }} · {{ timeAgo(item.createdAt) }}</p>
              </li>
            </ol>
            <p v-else class="text-sm text-muted-foreground">No activity yet.</p>
          </section>
        </div>

        <aside class="space-y-4">
          <section class="border border-border/80 bg-card p-4 shadow-soft">
            <h2 class="mb-3 text-sm font-semibold">Work at a glance</h2>
            <div class="grid grid-cols-2 gap-2">
              <div v-for="stat in STATS" :key="stat.label" class="border border-border/60 p-3">
                <span class="mb-2 flex size-8 items-center justify-center" :class="stat.tone"><component :is="stat.icon" class="size-4" /></span>
                <span class="block text-xl leading-none font-semibold tabular-nums">{{ stat.value }}</span>
                <span class="mt-1 block text-[11px] leading-tight text-muted-foreground">{{ stat.label }}</span>
              </div>
            </div>
          </section>

          <section class="border border-border/80 bg-card p-4 shadow-soft">
            <h2 class="mb-3 text-sm font-semibold">Contact</h2>
            <ul class="space-y-3 text-sm">
              <li class="flex items-center gap-3">
                <Mail class="size-4 shrink-0 text-muted-foreground" />
                <a :href="`mailto:${person.email}`" class="min-w-0 flex-1 truncate hover:text-primary">{{ person.email }}</a>
                <button type="button" class="text-muted-foreground hover:text-foreground" aria-label="Copy email" @click="copyEmail"><Copy class="size-3.5" /></button>
              </li>
              <li class="flex items-center gap-3">
                <Phone class="size-4 shrink-0 text-muted-foreground" />
                <a v-if="person.phone" :href="`tel:${person.phone.replace(/[^\d+]/g, '')}`" class="hover:text-primary">{{ person.phone }}</a>
                <span v-else class="text-muted-foreground">No phone number</span>
              </li>
              <li class="flex items-center gap-3">
                <MapPin class="size-4 shrink-0 text-muted-foreground" />
                <span :class="!person.location && 'text-muted-foreground'">{{ person.location || 'No location' }}</span>
              </li>
              <li class="flex items-center gap-3">
                <Clock class="size-4 shrink-0 text-muted-foreground" />
                <span>{{ person.timezone }}</span>
              </li>
            </ul>
          </section>

          <section class="border border-border/80 bg-card p-4 shadow-soft">
            <h2 class="mb-3 text-sm font-semibold">Skills</h2>
            <div v-if="person.skills.length" class="flex flex-wrap gap-1.5">
              <span v-for="skill in person.skills" :key="skill" class="border border-primary/20 bg-primary/5 px-2.5 py-1 text-xs font-medium text-primary">{{ skill }}</span>
            </div>
            <p v-else class="text-sm text-muted-foreground">No skills added yet.</p>
          </section>

          <section class="border border-border/80 bg-card p-4 shadow-soft">
            <h2 class="mb-3 text-sm font-semibold">Recently completed</h2>
            <ul v-if="profile.recentlyCompleted.length" class="space-y-2.5">
              <li v-for="task in profile.recentlyCompleted" :key="task.id">
                <RouterLink :to="{ query: { issue: task.key } }" class="group flex items-start gap-2">
                  <CheckCircle2 class="mt-0.5 size-4 shrink-0 text-success" />
                  <span class="min-w-0">
                    <span class="block truncate text-sm group-hover:text-primary">{{ task.title }}</span>
                    <span class="block text-xs text-muted-foreground">{{ task.key }} · {{ timeAgo(task.completedAt) }}</span>
                  </span>
                </RouterLink>
              </li>
            </ul>
            <p v-else class="flex items-center gap-2 text-sm text-muted-foreground"><FolderKanban class="size-4" /> Nothing completed yet.</p>
          </section>
        </aside>
      </div>
    </div>
  </div>
</template>

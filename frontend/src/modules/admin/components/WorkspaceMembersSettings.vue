<script setup lang="ts">
import { useStorage } from '@vueuse/core'
import { Crown, Ellipsis, FolderKanban, LayoutGrid, List, MailPlus, MessageCircle, Search, ShieldCheck, UserCheck, UserMinus, UserPlus, UserRound, UserX } from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'
import EmptyState from '@/components/common/EmptyState.vue'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { toast } from 'vue-sonner'
import PresenceBadge from '@/components/common/PresenceBadge.vue'
import UserAvatar from '@/components/common/UserAvatar.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { SelectField, type SelectFieldOption } from '@/components/forms'
import { Skeleton } from '@/components/ui/skeleton'
import { useConfirm } from '@/composables/useConfirm'
import { timeAgo } from '@/lib/format'
import { getErrorMessage, getFieldErrors } from '@/lib/http'
import { getPlanLimitKind } from '@/lib/plan-limit'
import { shareInviteLink } from '@/lib/invite-link'
import { useAuthStore } from '@/modules/auth/auth.store'
import RequestUpgradeButton from './RequestUpgradeButton.vue'
import MeetButton from '@/modules/meetings/components/MeetButton.vue'
import { useDirectMessage } from '@/modules/messages/useDirectMessage'
import { usePresenceStore } from '@/stores/presence.store'
import type { WorkspaceMember, WorkspaceRole } from '@/types/models'
import { workspaceApi } from '../admin.api'
import { profileCoverStyle } from '../profile-cover'

const auth = useAuthStore()
const confirm = useConfirm()
const { canMessage, messagePerson, openingId } = useDirectMessage()
const members = ref<WorkspaceMember[] | null>(null)
const search = ref('')
const organizationName = computed(() => auth.organization?.name ?? 'this organization')

const load = async () => (members.value = await workspaceApi.members())
onMounted(load)

type PeopleFilter = 'all' | 'admin' | 'member' | 'invited' | 'disabled'
const filter = ref<PeopleFilter>('all')
const layout = useStorage<'cards' | 'list'>('vector.people.layout', 'cards')

const matchesFilter = (member: WorkspaceMember, value: PeopleFilter) =>
  value === 'all' || (value === 'admin' || value === 'member' ? member.workspaceRole === value : member.status === value)
const filtered = computed(() => {
  const term = search.value.trim().toLowerCase()
  return (members.value ?? []).filter(
    (member) =>
      matchesFilter(member, filter.value) &&
      (!term || [member.name, member.email, member.title ?? ''].some((value) => value.toLowerCase().includes(term))),
  )
})
const adminCount = computed(() => (members.value ?? []).filter((member) => member.workspaceRole === 'admin').length)
const FILTERS = computed(() =>
  (
    [
      { value: 'all', label: 'Everyone' },
      { value: 'admin', label: 'Admins' },
      { value: 'member', label: 'Members' },
      { value: 'invited', label: 'Invited' },
      { value: 'disabled', label: 'Deactivated' },
    ] as const
  )
    .map((option) => ({ ...option, count: (members.value ?? []).filter((member) => matchesFilter(member, option.value)).length }))
    .filter((option) => option.value === 'all' || option.value === 'admin' || option.value === 'member' || option.count > 0),
)

const STATUS_BADGE = { active: 'success', invited: 'warning', disabled: 'outline' } as const
const STATUS_LABEL = { active: 'Active', invited: 'Invited', disabled: 'Deactivated' } as const
const presence = usePresenceStore()
/** Live status ("Available", "In a call", "Offline · last seen 2 hours ago"), or when they last used Vector. */
const activity = (member: WorkspaceMember) =>
  (member.status === 'active' && presence.describe(member.id)) || (member.lastSeenAt ? `Active ${timeAgo(member.lastSeenAt)}` : 'Not signed in yet')
const ROLE_OPTIONS: SelectFieldOption[] = [
  { value: 'admin', label: 'Admin', description: 'Organization settings and people' },
  { value: 'member', label: 'Member', description: 'Works in the projects they join' },
]

async function run(task: () => Promise<unknown>, message: string) {
  try {
    await task()
    toast.success(message)
    await load()
  } catch (error) {
    toast.error(getErrorMessage(error))
  }
}

const changeRole = (member: WorkspaceMember, role: WorkspaceRole) =>
  run(() => workspaceApi.updateMember(member.id, { workspaceRole: role }), `${member.name} is now ${role === 'admin' ? 'an admin' : 'a member'}`)

async function toggleStatus(member: WorkspaceMember) {
  const disabling = member.status === 'active'
  if (disabling) {
    const confirmed = await confirm({
      title: `Deactivate ${member.name}?`,
      description: `They lose access to ${organizationName.value} until reactivated. Their work stays intact, and their other organizations are not affected.`,
      confirmLabel: 'Deactivate',
      destructive: true,
    })
    if (!confirmed) return
  }
  await run(
    () => workspaceApi.updateMember(member.id, { status: disabling ? 'disabled' : 'active' }),
    disabling ? `${member.name} deactivated` : `${member.name} reactivated`,
  )
}

async function remove(member: WorkspaceMember) {
  const confirmed = await confirm({
    title: `Remove ${member.name} from ${organizationName.value}?`,
    description: 'They are taken out of every project here and their open work becomes unassigned. You can invite them again later.',
    confirmLabel: 'Remove',
    destructive: true,
  })
  if (confirmed) await run(() => workspaceApi.removeMember(member.id), `${member.name} removed`)
}

/** A new invitation email (or link to share) for someone who has not accepted yet; earlier links stop working. */
const resendingId = ref<string | null>(null)
async function resend(member: WorkspaceMember) {
  resendingId.value = member.id
  try {
    const result = await workspaceApi.resendInvitation(member.id)
    if (result.inviteLink) {
      const slug = auth.organization?.slug
      await shareInviteLink(member.email, result.inviteLink, {
        previewUrl: slug ? `${window.location.origin}/invite/${slug}` : `${window.location.origin}/workday`,
      })
    }
    else toast.success(`New invitation sent to ${member.email}`, { description: 'Earlier invitation links no longer work; they should use the newest email.' })
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    resendingId.value = null
  }
}

// --- Invite -----------------------------------------------------------------
const invite = ref({ email: '', role: 'member' as WorkspaceRole })
const inviteError = ref('')
const isInviting = ref(false)
const seatLimitHit = ref(false)

async function sendInvite() {
  inviteError.value = ''
  seatLimitHit.value = false
  isInviting.value = true
  try {
    const member = await workspaceApi.invite({ email: invite.value.email.trim(), role: invite.value.role })
    if (member.inviteLink) {
      const slug = auth.organization?.slug
      await shareInviteLink(member.email, member.inviteLink, {
        previewUrl: slug ? `${window.location.origin}/invite/${slug}` : `${window.location.origin}/workday`,
      })
    }
    else
      toast.success(member.invited ? `Invitation sent to ${member.email}` : `${member.name} added to ${organizationName.value}`, {
        description: member.invited
          ? 'They land on Home to Start my day after accepting.'
          : 'They already had a Vector account and can switch to this organization now.',
      })
    invite.value = { email: '', role: 'member' }
    await load()
  } catch (error) {
    seatLimitHit.value = Boolean(getPlanLimitKind(error))
    inviteError.value = getFieldErrors(error).email ?? getErrorMessage(error)
  } finally {
    isInviting.value = false
  }
}
</script>

<template>
  <div class="space-y-3.5 sm:space-y-4">
    <Card>
      <CardHeader>
        <CardTitle>Invite people</CardTitle>
        <CardDescription>
          They join {{ organizationName }} and land on Start my day. New people get an email to set up their account.
        </CardDescription>
      </CardHeader>
      <CardContent class="space-y-3">
        <div
          v-if="seatLimitHit"
          class="flex flex-col gap-2 rounded-lg border border-dashed border-amber-500/30 bg-amber-500/10 px-3 py-2.5 sm:flex-row sm:items-center"
        >
          <p class="min-w-0 flex-1 text-xs text-amber-900 dark:text-amber-200">People limit reached. Request more seats from the portal admin.</p>
          <RequestUpgradeButton target="seats" size="sm" variant="outline" />
        </div>
        <form class="flex flex-col gap-2 sm:flex-row sm:items-start" @submit.prevent="sendInvite">
          <div class="flex-1 space-y-1">
            <Input v-model="invite.email" type="email" placeholder="colleague@company.com" aria-label="Email address" autocomplete="off" required />
            <p v-if="inviteError" class="text-xs text-destructive" role="alert">{{ inviteError }}</p>
          </div>
          <SelectField v-model="invite.role" :options="ROLE_OPTIONS" class="w-full sm:w-36" content-class="w-72" align="end" aria-label="Role" />
          <Button type="submit" class="max-sm:w-full" :loading="isInviting" :disabled="!invite.email.trim()"><UserPlus /> Invite</Button>
        </form>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>People</CardTitle>
        <CardDescription>
          {{ members?.length ?? 0 }} people in {{ organizationName }} · {{ adminCount }} admin{{ adminCount === 1 ? '' : 's' }}. Admins manage the organization's
          settings and people.
        </CardDescription>
      </CardHeader>
      <CardContent class="space-y-4">
        <div class="flex flex-wrap items-center gap-2">
          <div class="relative w-full sm:max-w-xs">
            <Search class="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input v-model="search" placeholder="Search by name, title or email" class="pl-9" aria-label="Search people" />
          </div>
          <div class="flex flex-wrap gap-1.5" role="group" aria-label="Filter people">
            <button
              v-for="option in FILTERS"
              :key="option.value"
              type="button"
              class="inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium transition-colors"
              :class="filter === option.value ? 'bg-accent text-foreground shadow-[0_0_0_1px_var(--border)]' : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'"
              :aria-pressed="filter === option.value"
              @click="filter = option.value"
            >
              {{ option.label }}
              <span class="tabular-nums opacity-70">{{ option.count }}</span>
            </button>
          </div>
          <div class="ml-auto flex h-8 items-center rounded-md bg-muted p-0.5" role="group" aria-label="Layout">
            <button
              v-for="option in [{ value: 'cards', icon: LayoutGrid, label: 'Cards' }, { value: 'list', icon: List, label: 'List' }] as const"
              :key="option.value"
              type="button"
              class="flex h-7 items-center gap-1.5 rounded-[5px] px-2.5 text-xs font-medium transition-colors"
              :class="layout === option.value ? 'bg-card text-foreground shadow-[0_0_0_1px_var(--border)]' : 'text-muted-foreground hover:text-foreground'"
              :aria-pressed="layout === option.value"
              @click="layout = option.value"
            >
              <component :is="option.icon" class="size-3.5" /> {{ option.label }}
            </button>
          </div>
        </div>

        <div v-if="!members" class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          <Skeleton v-for="index in 8" :key="index" class="h-64 w-full" />
        </div>

        <EmptyState v-else-if="!filtered.length" :icon="Search" title="Nobody matches" description="Try another name or filter." class="border border-dashed py-12" />

        <div v-else-if="layout === 'cards'" class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          <article
            v-for="member in filtered"
            :key="member.id"
            class="group relative flex flex-col overflow-hidden border border-border/80 bg-card shadow-soft transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md"
            :class="member.status === 'disabled' && 'opacity-70'"
          >
            <div class="h-20" :style="profileCoverStyle(member.avatarColor)" />

            <DropdownMenu v-if="member.id !== auth.user?.id">
              <DropdownMenuTrigger as-child>
                <button
                  type="button"
                  class="absolute top-2 right-2 flex size-7 items-center justify-center rounded-md bg-black/20 text-white backdrop-blur-sm transition-colors hover:bg-black/35"
                  :aria-label="`Actions for ${member.name}`"
                >
                  <Ellipsis class="size-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" class="w-52">
                <DropdownMenuItem @select="$router.push({ name: 'member-profile', params: { userId: member.id } })"><UserRound /> View profile</DropdownMenuItem>
                <DropdownMenuItem @select="changeRole(member, member.workspaceRole === 'admin' ? 'member' : 'admin')">
                  <ShieldCheck /> {{ member.workspaceRole === 'admin' ? 'Make member' : 'Make admin' }}
                </DropdownMenuItem>
                <DropdownMenuItem v-if="member.status !== 'invited'" @select="toggleStatus(member)">
                  <component :is="member.status === 'active' ? UserX : UserCheck" /> {{ member.status === 'active' ? 'Deactivate' : 'Reactivate' }}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" @select="remove(member)"><UserMinus /> Remove from organization</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <RouterLink
              :to="{ name: 'member-profile', params: { userId: member.id } }"
              class="-mt-10 flex flex-1 flex-col items-center px-4 pb-4 text-center"
              :title="`View ${member.name}'s profile`"
            >
              <span class="relative">
                <UserAvatar :user="member" size="xl" class="ring-4 ring-card shadow-md" />
                <PresenceBadge
                  v-if="member.status === 'active' && presence.statusOf(member.id)"
                  :status="presence.statusOf(member.id)!"
                  size="lg"
                  class="absolute right-1 bottom-1"
                />
              </span>
              <span class="mt-2 flex items-center gap-1.5">
                <span class="text-base font-semibold tracking-tight transition-colors group-hover:text-primary">{{ member.name }}</span>
                <Badge v-if="member.id === auth.user?.id" variant="soft" class="px-1.5 py-0 text-[10px]">You</Badge>
              </span>
              <span class="line-clamp-2 min-h-10 text-sm text-muted-foreground">{{ member.title || 'No job title yet' }}</span>
              <span class="mt-2 flex flex-wrap justify-center gap-1.5">
                <Badge :variant="member.workspaceRole === 'admin' ? 'default' : 'secondary'">
                  <Crown v-if="member.workspaceRole === 'admin'" /> {{ member.workspaceRole === 'admin' ? 'Admin' : 'Member' }}
                </Badge>
                <Badge :variant="STATUS_BADGE[member.status]">{{ STATUS_LABEL[member.status] }}</Badge>
              </span>
              <span class="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
                <span class="inline-flex items-center gap-1"><FolderKanban class="size-3.5" /> {{ member.projectCount }} project{{ member.projectCount === 1 ? '' : 's' }}</span>
                <span>{{ activity(member) }}</span>
              </span>
            </RouterLink>

            <div class="flex items-center gap-1.5 border-t border-border p-2.5">
              <Button variant="outline" size="sm" class="min-w-0 flex-1" as-child>
                <RouterLink :to="{ name: 'member-profile', params: { userId: member.id } }"><UserRound /> Profile</RouterLink>
              </Button>
              <Button
                v-if="canMessage(member.id) && member.status === 'active'"
                variant="outline"
                size="icon-sm"
                :title="`Message ${member.name}`"
                :aria-label="`Message ${member.name}`"
                :loading="openingId === member.id"
                @click="messagePerson(member.id)"
              >
                <MessageCircle />
              </Button>
              <MeetButton v-if="member.status === 'active'" compact :preset="{ title: `Call with ${member.name}`, people: [member] }" />
              <Button
                v-if="member.status === 'invited'"
                variant="outline"
                size="icon-sm"
                :title="`Send ${member.email} a new invitation`"
                :aria-label="`Resend invitation to ${member.email}`"
                :loading="resendingId === member.id"
                @click="resend(member)"
              >
                <MailPlus />
              </Button>
            </div>
          </article>
        </div>

        <ul v-else class="divide-y divide-border/60 overflow-hidden border border-border/70">
          <li v-for="member in filtered" :key="member.id" class="flex flex-wrap items-center gap-3 p-3 transition-colors hover:bg-accent/30">
            <RouterLink
              :to="{ name: 'member-profile', params: { userId: member.id } }"
              class="group flex min-w-0 flex-1 items-center gap-3"
              :title="`View ${member.name}'s profile`"
            >
              <UserAvatar :user="member" size="md" :presence="member.status === 'active'" />
              <div class="min-w-0 flex-1">
                <p class="flex flex-wrap items-center gap-2 text-sm font-medium">
                  <span class="transition-colors group-hover:text-primary">{{ member.name }}</span>
                  <Badge v-if="member.id === auth.user?.id" variant="soft">You</Badge>
                  <Badge :variant="STATUS_BADGE[member.status]">{{ STATUS_LABEL[member.status] }}</Badge>
                </p>
                <p class="truncate text-xs text-muted-foreground">
                  <template v-if="member.title">{{ member.title }} · </template>{{ member.email }} · {{ member.projectCount }} project{{ member.projectCount === 1 ? '' : 's' }}
                  <template v-if="member.lastSeenAt || presence.statusOf(member.id)"> · {{ activity(member) }}</template>
                </p>
              </div>
            </RouterLink>
            <SelectField
              :model-value="member.workspaceRole"
              :options="ROLE_OPTIONS"
              :disabled="member.id === auth.user?.id"
              size="sm"
              class="w-36"
              content-class="w-72"
              align="end"
              :aria-label="`Organization role of ${member.name}`"
              @update:model-value="(value) => value && value !== member.workspaceRole && changeRole(member, value as WorkspaceRole)"
            />
            <Button
              v-if="member.status !== 'invited'"
              variant="ghost"
              size="sm"
              :class="member.status === 'active' && 'text-destructive hover:text-destructive'"
              :disabled="member.id === auth.user?.id"
              @click="toggleStatus(member)"
            >
              {{ member.status === 'active' ? 'Deactivate' : 'Reactivate' }}
            </Button>
            <Button v-else variant="ghost" size="sm" :loading="resendingId === member.id" :title="`Send ${member.email} a new invitation`" @click="resend(member)">
              <MailPlus /> Resend invitation
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              class="text-muted-foreground hover:text-destructive"
              :disabled="member.id === auth.user?.id"
              :aria-label="`Remove ${member.name} from the organization`"
              @click="remove(member)"
            >
              <UserMinus />
            </Button>
          </li>
        </ul>
      </CardContent>
    </Card>
  </div>
</template>

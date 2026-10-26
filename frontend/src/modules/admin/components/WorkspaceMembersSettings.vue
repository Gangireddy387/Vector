<script setup lang="ts">
import { Search, UserMinus, UserPlus } from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'
import { toast } from 'vue-sonner'
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
import { useAuthStore } from '@/modules/auth/auth.store'
import type { WorkspaceMember, WorkspaceRole } from '@/types/models'
import { workspaceApi } from '../admin.api'

const auth = useAuthStore()
const confirm = useConfirm()
const members = ref<WorkspaceMember[] | null>(null)
const search = ref('')
const organizationName = computed(() => auth.organization?.name ?? 'this organization')

const load = async () => (members.value = await workspaceApi.members())
onMounted(load)

const filtered = computed(() => {
  const term = search.value.trim().toLowerCase()
  return (members.value ?? []).filter((member) => !term || member.name.toLowerCase().includes(term) || member.email.toLowerCase().includes(term))
})
const adminCount = computed(() => (members.value ?? []).filter((member) => member.workspaceRole === 'admin').length)

const STATUS_BADGE = { active: 'success', invited: 'warning', disabled: 'outline' } as const
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

// --- Invite -----------------------------------------------------------------
const invite = ref({ email: '', role: 'member' as WorkspaceRole })
const inviteError = ref('')
const isInviting = ref(false)

async function sendInvite() {
  inviteError.value = ''
  isInviting.value = true
  try {
    const member = await workspaceApi.invite({ email: invite.value.email.trim(), role: invite.value.role })
    toast.success(member.invited ? `Invitation sent to ${member.email}` : `${member.name} added to ${organizationName.value}`, {
      description: member.invited ? 'They can join once they accept the email.' : 'They already had a Vector account and can switch to this organization now.',
    })
    invite.value = { email: '', role: 'member' }
    await load()
  } catch (error) {
    inviteError.value = getFieldErrors(error).email ?? getErrorMessage(error)
  } finally {
    isInviting.value = false
  }
}
</script>

<template>
  <div class="space-y-4">
    <Card>
      <CardHeader>
        <CardTitle>Invite people</CardTitle>
        <CardDescription>They join {{ organizationName }} and can then be added to projects. New people get an email to set up their account.</CardDescription>
      </CardHeader>
      <CardContent>
        <form class="flex flex-col gap-2 sm:flex-row sm:items-start" @submit.prevent="sendInvite">
          <div class="flex-1 space-y-1">
            <Input v-model="invite.email" type="email" placeholder="colleague@company.com" aria-label="Email address" autocomplete="off" required />
            <p v-if="inviteError" class="text-xs text-destructive" role="alert">{{ inviteError }}</p>
          </div>
          <SelectField v-model="invite.role" :options="ROLE_OPTIONS" class="sm:w-36" content-class="w-72" align="end" aria-label="Role" />
          <Button type="submit" :loading="isInviting" :disabled="!invite.email.trim()"><UserPlus /> Invite</Button>
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
        <div class="relative max-w-sm">
          <Search class="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input v-model="search" placeholder="Search people" class="pl-9" aria-label="Search people" />
        </div>

        <div v-if="!members" class="space-y-2">
          <Skeleton v-for="index in 4" :key="index" class="h-14 w-full" />
        </div>
        <ul v-else class="divide-y divide-border/60 overflow-hidden border border-border/70">
          <li v-for="member in filtered" :key="member.id" class="flex flex-wrap items-center gap-3 p-3 transition-colors hover:bg-accent/30">
            <RouterLink
              :to="{ name: 'member-profile', params: { userId: member.id } }"
              class="group flex min-w-0 flex-1 items-center gap-3"
              :title="`View ${member.name}'s profile`"
            >
              <UserAvatar :user="member" size="md" />
              <div class="min-w-0 flex-1">
                <p class="flex flex-wrap items-center gap-2 text-sm font-medium">
                  <span class="transition-colors group-hover:text-primary">{{ member.name }}</span>
                  <Badge v-if="member.id === auth.user?.id" variant="soft">You</Badge>
                  <Badge :variant="STATUS_BADGE[member.status]" class="capitalize">{{ member.status }}</Badge>
                </p>
                <p class="truncate text-xs text-muted-foreground">
                  <template v-if="member.title">{{ member.title }} · </template>{{ member.email }} · {{ member.projectCount }} project{{ member.projectCount === 1 ? '' : 's' }}
                  <template v-if="member.lastSeenAt"> · active {{ timeAgo(member.lastSeenAt) }}</template>
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

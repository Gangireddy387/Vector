<script setup lang="ts">
import { Mail, Trash2 } from 'lucide-vue-next'
import { ref } from 'vue'
import { toast } from 'vue-sonner'
import UserAvatar from '@/components/common/UserAvatar.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { SelectField } from '@/components/forms'
import { useConfirm } from '@/composables/useConfirm'
import { getErrorMessage } from '@/lib/http'
import { shareInviteLink } from '@/lib/invite-link'
import { useAuthStore } from '@/modules/auth/auth.store'
import type { ProjectDetail, ProjectMember, ProjectRole } from '@/types/models'
import { projectsApi } from '../../projects.api'
import { useProjectsStore } from '../../projects.store'

const props = defineProps<{ project: ProjectDetail }>()

const ROLES: Array<{ value: ProjectRole; label: string; description: string }> = [
  { value: 'admin', label: 'Admin', description: 'Manage settings, members and automation' },
  { value: 'member', label: 'Member', description: 'Create and edit tasks' },
  { value: 'viewer', label: 'Viewer', description: 'Read-only access' },
]

const auth = useAuthStore()
const projects = useProjectsStore()
const confirm = useConfirm()
const email = ref('')
const role = ref<ProjectRole>('member')
const isInviting = ref(false)

const refresh = () => projects.fetchProject(props.project.id, true)

async function invite() {
  isInviting.value = true
  try {
    const member = await projectsApi.addMember(props.project.id, { email: email.value.trim(), role: role.value })
    if (member.inviteLink) await shareInviteLink(member.email, member.inviteLink)
    else toast.success(member.invited ? `Invitation sent to ${member.email}` : `${member.name} added to the project`)
    email.value = ''
    await refresh()
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    isInviting.value = false
  }
}

async function changeRole(member: ProjectMember, newRole: ProjectRole) {
  try {
    await projectsApi.updateMember(props.project.id, member.id, newRole)
    await refresh()
  } catch (error) {
    toast.error(getErrorMessage(error))
  }
}

async function remove(member: ProjectMember) {
  const confirmed = await confirm({
    title: `Remove ${member.name}?`,
    description: 'Their tasks become unassigned. They can be invited again later.',
    confirmLabel: 'Remove',
    destructive: true,
  })
  if (!confirmed) return
  try {
    await projectsApi.removeMember(props.project.id, member.id)
    await refresh()
  } catch (error) {
    toast.error(getErrorMessage(error))
  }
}
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle>Members</CardTitle>
      <CardDescription>Invite people by email. New users receive an invitation link.</CardDescription>
    </CardHeader>
    <CardContent class="space-y-5">
      <form class="flex flex-col gap-2 sm:flex-row" @submit.prevent="invite">
        <Input v-model="email" type="email" placeholder="name@company.com" class="flex-1" required aria-label="Email address" />
        <SelectField
          :model-value="role"
          :options="ROLES"
          class="sm:w-40"
          content-class="w-72"
          align="end"
          aria-label="Role"
          @update:model-value="(value) => value && (role = value as ProjectRole)"
        />
        <Button type="submit" :loading="isInviting"><Mail /> Invite</Button>
      </form>

      <ul class="divide-y border">
        <li v-for="member in project.members" :key="member.id" class="flex flex-wrap items-center gap-3 p-3">
          <UserAvatar :user="member" size="md" />
          <div class="min-w-0 flex-1">
            <p class="flex items-center gap-2 truncate text-sm font-medium">
              {{ member.name }}
              <Badge v-if="member.status === 'invited'" variant="warning">Invited</Badge>
              <Badge v-if="member.id === project.leadId" variant="secondary">Lead</Badge>            </p>
            <p class="truncate text-xs text-muted-foreground">{{ member.email }}</p>
          </div>
          <SelectField
            :model-value="member.role"
            :options="ROLES"
            :disabled="member.id === auth.user?.id"
            size="sm"
            class="w-36"
            content-class="w-72"
            align="end"
            :aria-label="`Role of ${member.name}`"
            @update:model-value="(value) => value && changeRole(member, value as ProjectRole)"
          />
          <Button
            variant="ghost"
            size="icon-sm"
            :disabled="member.id === auth.user?.id"
            :aria-label="`Remove ${member.name}`"
            @click="remove(member)"
          >
            <Trash2 />
          </Button>
        </li>
      </ul>
    </CardContent>
  </Card>
</template>

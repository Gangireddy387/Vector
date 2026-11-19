<script setup lang="ts">
import { KeyRound, Plus, Trash2 } from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'
import { toast } from 'vue-sonner'
import EmptyState from '@/components/common/EmptyState.vue'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label as FormLabel } from '@/components/ui/label'
import { useConfirm } from '@/composables/useConfirm'
import { getErrorMessage } from '@/lib/http'
import { useAuthStore } from '@/modules/auth/auth.store'
import type { OrganizationRole, OrgPermission } from '@/types/models'
import { workspaceApi } from '../admin.api'

const auth = useAuthStore()
const confirm = useConfirm()
const canUse = computed(() => auth.hasFeature('customRoles'))
const canEdit = computed(() => canUse.value && auth.hasPermission('workspace.roles'))

const catalog = ref<Array<{ key: OrgPermission; label: string; description: string }>>([])
const roles = ref<OrganizationRole[]>([])
const name = ref('')
const description = ref('')
const selected = ref<OrgPermission[]>([])
const isSaving = ref(false)

async function load() {
  try {
    const [permissionList, roleList] = await Promise.all([workspaceApi.rolePermissions(), workspaceApi.roles()])
    catalog.value = permissionList
    roles.value = roleList
  } catch (error) {
    toast.error(getErrorMessage(error))
  }
}

onMounted(load)

function togglePermission(key: OrgPermission, on: boolean) {
  selected.value = on ? [...new Set([...selected.value, key])] : selected.value.filter((item) => item !== key)
}

async function create() {
  if (!name.value.trim() || !selected.value.length) return
  isSaving.value = true
  try {
    await workspaceApi.createRole({
      name: name.value.trim(),
      description: description.value.trim() || null,
      permissions: selected.value,
    })
    name.value = ''
    description.value = ''
    selected.value = []
    await load()
    toast.success('Role created')
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    isSaving.value = false
  }
}

async function toggleRolePermission(role: OrganizationRole, key: OrgPermission, on: boolean) {
  if (!canEdit.value) return
  const permissions = on
    ? [...new Set([...role.permissions, key])]
    : role.permissions.filter((item) => item !== key)
  if (!permissions.length) {
    toast.error('A role needs at least one permission')
    return
  }
  try {
    await workspaceApi.updateRole(role.id, { permissions })
    await load()
  } catch (error) {
    toast.error(getErrorMessage(error))
  }
}

async function remove(role: OrganizationRole) {
  if (
    !(await confirm({
      title: `Delete role “${role.name}”?`,
      description: 'People using this role must be reassigned first.',
      confirmLabel: 'Delete',
      destructive: true,
    }))
  ) {
    return
  }
  try {
    await workspaceApi.removeRole(role.id)
    await load()
    toast.success('Role deleted')
  } catch (error) {
    toast.error(getErrorMessage(error))
  }
}
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle class="flex items-center gap-2"><KeyRound class="size-4" /> Custom roles</CardTitle>
      <CardDescription>
        Delegate workspace work — people, billing, departments — without making someone a full admin.
      </CardDescription>
    </CardHeader>
    <CardContent class="space-y-5">
      <EmptyState
        v-if="!canUse"
        title="Pro feature"
        description="Custom roles are included on Pro and Enterprise. Ask an organization admin to upgrade."
      />

      <template v-else>
        <ul class="space-y-3">
          <li v-for="role in roles" :key="role.id" class="rounded-md border p-3">
            <div class="mb-2 flex items-start gap-2">
              <div class="min-w-0 flex-1">
                <p class="font-medium">{{ role.name }}</p>
                <p v-if="role.description" class="text-xs text-muted-foreground">{{ role.description }}</p>
                <p class="font-mono text-[10px] text-muted-foreground">{{ role.key }}</p>
              </div>
              <Button
                v-if="canEdit"
                variant="ghost"
                size="icon-sm"
                :aria-label="`Delete ${role.name}`"
                @click="remove(role)"
              >
                <Trash2 />
              </Button>
            </div>
            <div class="grid gap-2 sm:grid-cols-2">
              <label v-for="item in catalog" :key="`${role.id}-${item.key}`" class="flex items-start gap-2 text-sm">
                <Checkbox
                  class="mt-0.5"
                  :model-value="role.permissions.includes(item.key)"
                  :disabled="!canEdit"
                  @update:model-value="(value) => toggleRolePermission(role, item.key, value === true)"
                />
                <span>
                  <span class="font-medium">{{ item.label }}</span>
                  <span class="block text-xs text-muted-foreground">{{ item.description }}</span>
                </span>
              </label>
            </div>
          </li>
          <li v-if="!roles.length" class="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
            No custom roles yet
          </li>
        </ul>

        <form v-if="canEdit" class="space-y-3 border-t pt-4" @submit.prevent="create">
          <div class="grid gap-3 sm:grid-cols-2">
            <div class="space-y-1.5">
              <FormLabel for="role-name">Name</FormLabel>
              <Input id="role-name" v-model="name" placeholder="e.g. People manager" />
            </div>
            <div class="space-y-1.5">
              <FormLabel for="role-description">Description</FormLabel>
              <Input id="role-description" v-model="description" placeholder="Optional" />
            </div>
          </div>
          <div class="space-y-2">
            <FormLabel>Permissions</FormLabel>
            <div class="grid gap-2 sm:grid-cols-2">
              <label v-for="item in catalog" :key="item.key" class="flex items-start gap-2 text-sm">
                <Checkbox
                  class="mt-0.5"
                  :model-value="selected.includes(item.key)"
                  @update:model-value="(value) => togglePermission(item.key, value === true)"
                />
                <span>
                  <span class="font-medium">{{ item.label }}</span>
                  <span class="block text-xs text-muted-foreground">{{ item.description }}</span>
                </span>
              </label>
            </div>
          </div>
          <Button type="submit" :disabled="isSaving || !name.trim() || !selected.length">
            <Plus /> Add role
          </Button>
        </form>
        <p v-else class="text-sm text-muted-foreground">Ask an admin with the “Manage roles” permission to edit roles.</p>
      </template>
    </CardContent>
  </Card>
</template>

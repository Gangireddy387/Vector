<script setup lang="ts">
import { Gem, History, KeyRound, MessageCircle, Settings2, Users } from 'lucide-vue-next'
import { computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PageHeader from '@/components/common/PageHeader.vue'
import SettingsLayout, { type SettingsSection } from '@/components/common/SettingsLayout.vue'
import { useDevice } from '@/composables/useDevice'
import { useAuthStore } from '@/modules/auth/auth.store'
import { useWorkspaceStore } from '@/stores/workspace.store'
import type { OrgPermission } from '@/types/models'
import WorkspaceAuditSettings from '../components/WorkspaceAuditSettings.vue'
import WorkspaceGeneralSettings from '../components/WorkspaceGeneralSettings.vue'
import WorkspaceMembersSettings from '../components/WorkspaceMembersSettings.vue'
import WorkspacePlanSettings from '../components/WorkspacePlanSettings.vue'
import WorkspaceRolesSettings from '../components/WorkspaceRolesSettings.vue'
import WorkspaceSupportSettings from '../components/WorkspaceSupportSettings.vue'

const { isDesktop } = useDevice()
const auth = useAuthStore()
const workspace = useWorkspaceStore()

type AdminTab = {
  value: string
  label: string
  icon: SettingsSection['icon']
  permission?: OrgPermission | OrgPermission[]
  /** Full admin only (e.g. destructive org settings stay visible to admins). */
  adminOnly?: boolean
}

const ALL_SECTIONS: AdminTab[] = [
  { value: 'general', label: 'General', icon: Settings2, permission: 'workspace.manage' },
  { value: 'people', label: 'People', icon: Users, permission: 'workspace.people' },
  { value: 'roles', label: 'Roles', icon: KeyRound, permission: ['workspace.roles', 'workspace.people'] },
  { value: 'plan', label: 'Plan', icon: Gem, permission: 'workspace.billing' },
  { value: 'activity', label: 'Activity', icon: History, permission: 'workspace.audit' },
  { value: 'support', label: 'Vector support', icon: MessageCircle, permission: 'workspace.support' },
]

function canSee(section: AdminTab) {
  if (auth.isOrganizationAdmin) return true
  if (section.adminOnly) return false
  if (!section.permission) return true
  const needed = Array.isArray(section.permission) ? section.permission : [section.permission]
  return needed.some((permission) => auth.hasPermission(permission))
}

const SECTIONS = computed(() => ALL_SECTIONS.filter(canSee).map(({ value, label, icon }) => ({ value, label, icon })))

/** The open tab lives in the address (?tab=people) so links, like the one back from a profile, land on it. */
const route = useRoute()
const router = useRouter()
const activeSection = computed({
  get: () => {
    const tab = String(route.query.tab || 'general')
    if (SECTIONS.value.some((section) => section.value === tab)) return tab
    return SECTIONS.value[0]?.value ?? 'general'
  },
  set: (tab: string) => router.replace({ query: { ...route.query, tab: tab === 'general' ? undefined : tab } }),
})

watch(
  SECTIONS,
  (sections) => {
    if (!sections.some((section) => section.value === activeSection.value) && sections[0]) {
      activeSection.value = sections[0].value
    }
  },
  { immediate: true },
)
</script>

<template>
  <div class="w-full space-y-3.5 sm:space-y-5" :class="isDesktop ? 'p-4 sm:p-5 lg:p-6' : 'p-3'">
    <PageHeader v-if="isDesktop" title="Organization settings" :description="`Name, address, people, plan and support for ${workspace.settings.name}.`" />

    <SettingsLayout v-if="SECTIONS.length" v-model="activeSection" :sections="SECTIONS" aria-label="Organization settings">
      <template #general><WorkspaceGeneralSettings /></template>
      <template #people><WorkspaceMembersSettings /></template>
      <template #roles><WorkspaceRolesSettings /></template>
      <template #plan><WorkspacePlanSettings /></template>
      <template #activity><WorkspaceAuditSettings /></template>
      <template #support><WorkspaceSupportSettings /></template>
    </SettingsLayout>
  </div>
</template>

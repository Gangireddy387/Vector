<script setup lang="ts">
import { Gem, MessageCircle, Settings2, Users } from 'lucide-vue-next'
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PageHeader from '@/components/common/PageHeader.vue'
import SettingsLayout, { type SettingsSection } from '@/components/common/SettingsLayout.vue'
import { useDevice } from '@/composables/useDevice'
import { useWorkspaceStore } from '@/stores/workspace.store'
import WorkspaceGeneralSettings from '../components/WorkspaceGeneralSettings.vue'
import WorkspaceMembersSettings from '../components/WorkspaceMembersSettings.vue'
import WorkspacePlanSettings from '../components/WorkspacePlanSettings.vue'
import WorkspaceSupportSettings from '../components/WorkspaceSupportSettings.vue'

const { isDesktop } = useDevice()
const workspace = useWorkspaceStore()
const SECTIONS: SettingsSection[] = [
  { value: 'general', label: 'General', icon: Settings2 },
  { value: 'people', label: 'People', icon: Users },
  { value: 'plan', label: 'Plan', icon: Gem },
  { value: 'support', label: 'Vector support', icon: MessageCircle },
]
/** The open tab lives in the address (?tab=people) so links, like the one back from a profile, land on it. */
const route = useRoute()
const router = useRouter()
const activeSection = computed({
  get: () => (SECTIONS.some((section) => section.value === route.query.tab) ? String(route.query.tab) : 'general'),
  set: (tab: string) => router.replace({ query: { ...route.query, tab: tab === 'general' ? undefined : tab } }),
})
</script>

<template>
  <div class="w-full space-y-4 sm:space-y-5" :class="isDesktop ? 'p-4 sm:p-5 lg:p-6' : 'p-3 pb-2'">
    <PageHeader v-if="isDesktop" title="Organization settings" :description="`Name, address, people, plan and support for ${workspace.settings.name}.`" />

    <SettingsLayout v-model="activeSection" :sections="SECTIONS" aria-label="Organization settings">
      <template #general><WorkspaceGeneralSettings /></template>
      <template #people><WorkspaceMembersSettings /></template>
      <template #plan><WorkspacePlanSettings /></template>
      <template #support><WorkspaceSupportSettings /></template>
    </SettingsLayout>
  </div>
</template>

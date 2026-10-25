<script setup lang="ts">
import { Settings2, Users } from 'lucide-vue-next'
import { ref } from 'vue'
import PageHeader from '@/components/common/PageHeader.vue'
import SettingsLayout, { type SettingsSection } from '@/components/common/SettingsLayout.vue'
import { useDevice } from '@/composables/useDevice'
import { useWorkspaceStore } from '@/stores/workspace.store'
import WorkspaceGeneralSettings from '../components/WorkspaceGeneralSettings.vue'
import WorkspaceMembersSettings from '../components/WorkspaceMembersSettings.vue'

const { isDesktop } = useDevice()
const workspace = useWorkspaceStore()
const SECTIONS: SettingsSection[] = [
  { value: 'general', label: 'General', icon: Settings2 },
  { value: 'people', label: 'People', icon: Users },
]
const activeSection = ref('general')
</script>

<template>
  <div class="w-full space-y-4" :class="isDesktop ? 'p-5' : 'p-3'">
    <PageHeader v-if="isDesktop" :title="workspace.settings.name" description="Name, address, defaults and people of your organization.">
      <template #eyebrow>
        <span class="text-brand text-xs font-semibold tracking-wider uppercase">Organization settings</span>
      </template>
    </PageHeader>

    <SettingsLayout v-model="activeSection" :sections="SECTIONS" aria-label="Organization settings">
      <template #general><WorkspaceGeneralSettings /></template>
      <template #people><WorkspaceMembersSettings /></template>
    </SettingsLayout>
  </div>
</template>

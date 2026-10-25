<script setup lang="ts">
import { Columns3, Settings2, Tags, Users, Wand2 } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import EmptyState from '@/components/common/EmptyState.vue'
import SettingsLayout, { type SettingsSection } from '@/components/common/SettingsLayout.vue'
import { useDevice } from '@/composables/useDevice'
import GeneralSettings from '../components/settings/GeneralSettings.vue'
import LabelsSettings from '../components/settings/LabelsSettings.vue'
import MembersSettings from '../components/settings/MembersSettings.vue'
import SmartDefaultsSettings from '../components/settings/SmartDefaultsSettings.vue'
import WorkflowSettings from '../components/settings/WorkflowSettings.vue'
import { useProjectsStore } from '../projects.store'

const route = useRoute()
const projects = useProjectsStore()
const { isDesktop } = useDevice()

const project = computed(() => projects.details[route.params.projectId as string])
const SECTIONS: SettingsSection[] = [
  { value: 'general', label: 'General', icon: Settings2 },
  { value: 'members', label: 'Members', icon: Users },
  { value: 'workflow', label: 'Workflow', icon: Columns3 },
  { value: 'labels', label: 'Labels', icon: Tags },
  { value: 'smart-defaults', label: 'Smart defaults', icon: Wand2 },
]
const activeSection = ref('general')
</script>

<template>
  <div class="w-full" :class="isDesktop ? 'px-5 py-4' : 'p-3'">
    <EmptyState v-if="project && project.myRole !== 'admin'" title="Admins only" description="Ask a project admin to change these settings." />
    <SettingsLayout v-else-if="project" v-model="activeSection" :sections="SECTIONS" aria-label="Project settings">
      <template #general><GeneralSettings :project="project" /></template>
      <template #members><MembersSettings :project="project" /></template>
      <template #workflow><WorkflowSettings :project="project" /></template>
      <template #labels><LabelsSettings :project="project" /></template>
      <template #smart-defaults><SmartDefaultsSettings :project="project" /></template>
    </SettingsLayout>
  </div>
</template>

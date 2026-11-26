<script setup lang="ts">
import { Boxes, Columns3, ListTree, Settings2, Shield, Tags, Users, Wand2 } from 'lucide-vue-next'
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import EmptyState from '@/components/common/EmptyState.vue'
import PageFrame from '@/components/common/PageFrame.vue'
import SettingsLayout, { type SettingsSection } from '@/components/common/SettingsLayout.vue'
import ComponentsSettings from '../components/settings/ComponentsSettings.vue'
import CustomFieldsSettings from '../components/settings/CustomFieldsSettings.vue'
import FieldPermissionsSettings from '../components/settings/FieldPermissionsSettings.vue'
import GeneralSettings from '../components/settings/GeneralSettings.vue'
import LabelsSettings from '../components/settings/LabelsSettings.vue'
import MembersSettings from '../components/settings/MembersSettings.vue'
import SmartDefaultsSettings from '../components/settings/SmartDefaultsSettings.vue'
import WorkflowSettings from '../components/settings/WorkflowSettings.vue'
import { useProjectsStore } from '../projects.store'

const route = useRoute()
const router = useRouter()
const projects = useProjectsStore()

const project = computed(() => projects.details[route.params.projectId as string])
const SECTIONS: SettingsSection[] = [
  { value: 'general', label: 'General', icon: Settings2 },
  { value: 'members', label: 'Members', icon: Users },
  { value: 'workflow', label: 'Workflow', icon: Columns3 },
  { value: 'permissions', label: 'Permissions', icon: Shield },
  { value: 'labels', label: 'Labels', icon: Tags },
  { value: 'components', label: 'Components', icon: Boxes },
  { value: 'custom-fields', label: 'Custom fields', icon: ListTree },
  { value: 'smart-defaults', label: 'Smart defaults', icon: Wand2 },
]
const activeSection = computed({
  get: () => (SECTIONS.some((section) => section.value === route.query.tab) ? String(route.query.tab) : 'general'),
  set: (tab: string) => {
    void router.replace({ query: { ...route.query, tab: tab === 'general' ? undefined : tab } })
  },
})
</script>

<template>
  <PageFrame pad="compact">
    <EmptyState v-if="project && project.myRole !== 'admin'" title="Admins only" description="Ask a project admin to change these settings." />
    <SettingsLayout v-else-if="project" v-model="activeSection" :sections="SECTIONS" aria-label="Project settings">
      <template #general><GeneralSettings :project="project" /></template>
      <template #members><MembersSettings :project="project" /></template>
      <template #workflow><WorkflowSettings :project="project" /></template>
      <template #permissions><FieldPermissionsSettings :project="project" /></template>
      <template #labels><LabelsSettings :project="project" /></template>
      <template #components><ComponentsSettings :project="project" /></template>
      <template #custom-fields><CustomFieldsSettings :project="project" /></template>
      <template #smart-defaults><SmartDefaultsSettings :project="project" /></template>
    </SettingsLayout>
  </PageFrame>
</template>

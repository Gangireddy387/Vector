<script setup lang="ts">
import { useDevice } from '@/composables/useDevice'
import IssueDetailView from '../components/detail/IssueDetailView.vue'

defineProps<{ issueKey: string }>()
const { isDesktop } = useDevice()
</script>

<template>
  <div :class="isDesktop ? 'h-full' : ''">
    <IssueDetailView :issue-key="issueKey" mode="page" />
  </div>
</template>

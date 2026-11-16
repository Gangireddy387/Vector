<script setup lang="ts">
import { useDevice } from '@/composables/useDevice'
import IssueDetailView from '../components/detail/IssueDetailView.vue'

defineProps<{ issueKey: string }>()
const { isDesktop } = useDevice()
</script>

<template>
  <div
    class="min-h-0 w-full flex-1"
    :class="isDesktop ? 'flex h-full flex-col overflow-hidden' : 'overflow-y-auto'"
  >
    <IssueDetailView :issue-key="issueKey" mode="page" class="min-h-0 flex-1" />
  </div>
</template>

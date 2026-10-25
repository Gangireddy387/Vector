<script setup lang="ts">
import { ref, watch } from 'vue'
import { Skeleton } from '@/components/ui/skeleton'
import type { Activity } from '@/types/models'
import { issuesApi } from '../../api/issues.api'
import ActivityList from '../ActivityList.vue'

const props = withDefaults(defineProps<{ issueId: string; refreshKey?: number }>(), { refreshKey: 0 })

const activities = ref<Activity[] | null>(null)
watch(
  () => [props.issueId, props.refreshKey],
  async () => (activities.value = await issuesApi.activity(props.issueId)),
  { immediate: true },
)
</script>

<template>
  <div v-if="!activities" class="space-y-3">
    <Skeleton v-for="index in 4" :key="index" class="h-8 w-full" />
  </div>
  <ActivityList v-else :activities="activities" />
</template>

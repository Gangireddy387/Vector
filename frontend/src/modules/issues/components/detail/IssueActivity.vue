<script setup lang="ts">
import { ref, watch } from 'vue'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { getErrorMessage } from '@/lib/http'
import { latestRequest } from '@/lib/latest'
import type { Activity } from '@/types/models'
import { issuesApi } from '../../api/issues.api'
import ActivityList from '../ActivityList.vue'

const props = withDefaults(defineProps<{ issueId: string; refreshKey?: number }>(), { refreshKey: 0 })

const activities = ref<Activity[] | null>(null)
const loadError = ref<string | null>(null)
const latest = latestRequest()

async function load() {
  const ticket = latest.start()
  try {
    const loaded = await issuesApi.activity(props.issueId)
    if (!latest.isCurrent(ticket)) return
    activities.value = loaded
    loadError.value = null
  } catch (error) {
    if (latest.isCurrent(ticket)) loadError.value = getErrorMessage(error)
  }
}

watch(() => [props.issueId, props.refreshKey], load, { immediate: true })
</script>

<template>
  <div v-if="loadError && !activities" class="flex items-center justify-between gap-3 border border-dashed px-3 py-2 text-sm text-muted-foreground" role="alert">
    <span>The history did not load. {{ loadError }}</span>
    <Button variant="ghost" size="sm" @click="load">Try again</Button>
  </div>
  <div v-else-if="!activities" class="space-y-3">
    <Skeleton v-for="index in 4" :key="index" class="h-8 w-full" />
  </div>
  <ActivityList v-else :activities="activities" />
</template>

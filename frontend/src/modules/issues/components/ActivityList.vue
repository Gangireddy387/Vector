<script setup lang="ts">
import { Bot, History } from 'lucide-vue-next'
import EmptyState from '@/components/common/EmptyState.vue'
import UserAvatar from '@/components/common/UserAvatar.vue'
import { formatDateTime, timeAgo } from '@/lib/format'
import type { Activity } from '@/types/models'
import { describeActivity } from '../activity-format'

withDefaults(defineProps<{ activities: Activity[]; showIssue?: boolean; dense?: boolean }>(), { showIssue: false, dense: false })
</script>

<template>
  <EmptyState v-if="!activities.length" :icon="History" title="No activity yet" class="py-6" />
  <ol v-else class="relative space-y-4 before:absolute before:top-2 before:bottom-2 before:left-3 before:w-px before:bg-border">
    <li v-for="activity in activities" :key="activity.id" class="relative flex gap-3">
      <UserAvatar v-if="activity.actor" :user="activity.actor" size="sm" class="ring-4 ring-background" />
      <span v-else class="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary ring-4 ring-background">
        <Bot class="size-3.5" />
      </span>
      <div class="min-w-0 flex-1 text-sm" :class="dense && 'text-[13px]'">
        <p class="leading-snug">
          <span class="font-medium">{{ describeActivity(activity).actorName }}</span>
          {{ ' ' }}
          <span class="text-muted-foreground">{{ describeActivity(activity).text }}</span>
          <template v-if="showIssue && activity.issue">
            {{ ' ' }}
            <RouterLink :to="{ name: 'issue', params: { issueKey: activity.issue.key } }" class="font-medium hover:underline">
              {{ activity.issue.key }}
            </RouterLink>
            <span class="ml-1 text-muted-foreground">{{ activity.issue.title }}</span>
          </template>
        </p>
        <p class="mt-0.5 text-xs text-muted-foreground">
          <time :datetime="activity.createdAt" :title="formatDateTime(activity.createdAt)">{{ timeAgo(activity.createdAt) }}</time>
          <template v-if="describeActivity(activity).reason"> · {{ describeActivity(activity).reason }}</template>
          <template v-if="showIssue && activity.project"> · {{ activity.project.name }}</template>
        </p>
      </div>
    </li>
  </ol>
</template>

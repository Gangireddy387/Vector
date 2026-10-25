<script setup lang="ts">
import { computed } from 'vue'
import type { UserSummary } from '@/types/models'
import UserAvatar from './UserAvatar.vue'

const props = withDefaults(defineProps<{ users: UserSummary[]; max?: number }>(), { max: 4 })

const visible = computed(() => props.users.slice(0, props.max))
const overflow = computed(() => Math.max(0, props.users.length - props.max))
</script>

<template>
  <div class="flex items-center -space-x-1.5">
    <UserAvatar v-for="user in visible" :key="user.id" :user="user" show-tooltip class="ring-2 ring-background" />
    <span
      v-if="overflow"
      class="flex size-6 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground ring-2 ring-background"
    >
      +{{ overflow }}
    </span>
  </div>
</template>

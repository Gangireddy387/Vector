<script setup lang="ts">
import { BarChart3 } from 'lucide-vue-next'
import { computed } from 'vue'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/modules/auth/auth.store'
import type { MessagePoll } from '../messages.api'

const props = defineProps<{ poll: MessagePoll }>()
const emit = defineEmits<{ vote: [optionIndex: number]; close: [] }>()
const auth = useAuthStore()

const canClose = computed(() => props.poll.status === 'open' && props.poll.createdById === auth.user?.id)
const share = (votes: number) => (props.poll.total ? Math.round((votes / props.poll.total) * 100) : 0)
</script>

<template>
  <div class="mt-2 rounded-lg border border-border bg-muted/30 p-3">
    <p class="flex items-center gap-1.5 text-[12px] font-semibold text-muted-foreground"><BarChart3 class="size-3.5" /> Poll · {{ poll.status === 'open' ? 'Open' : 'Closed' }}</p>
    <p class="mt-1 text-[14px] font-medium">{{ poll.question }}</p>
    <div class="mt-2 space-y-1.5">
      <button
        v-for="(option, index) in poll.options"
        :key="index"
        type="button"
        class="relative flex w-full overflow-hidden rounded-md border px-3 py-2 text-left text-[13px] transition-colors"
        :class="[
          poll.myVote === index ? 'border-primary bg-primary/10 font-semibold text-primary' : 'border-border bg-background hover:bg-accent/50',
          poll.status !== 'open' && 'cursor-default',
        ]"
        :disabled="poll.status !== 'open'"
        @click="emit('vote', index)"
      >
        <span
          class="absolute inset-y-0 left-0 bg-primary/15"
          :style="{ width: `${share(option.votes)}%` }"
        />
        <span class="relative min-w-0 flex-1 truncate">{{ option.text }}</span>
        <span class="relative shrink-0 tabular-nums text-muted-foreground">{{ option.votes }} · {{ share(option.votes) }}%</span>
      </button>
    </div>
    <div class="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
      <span>{{ poll.total }} {{ poll.total === 1 ? 'vote' : 'votes' }}</span>
      <Button v-if="canClose" size="sm" variant="ghost" class="ml-auto h-7" @click="emit('close')">Close poll</Button>
    </div>
  </div>
</template>

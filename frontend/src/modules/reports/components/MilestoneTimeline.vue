<script setup lang="ts">
import { Flag, Flame, PartyPopper, PlayCircle, Rocket, Sparkles, Target } from 'lucide-vue-next'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { formatDate, timeAgo } from '@/lib/format'
import type { ProjectProgress } from '../reports.api'

defineProps<{ milestones: ProjectProgress['milestones'] }>()

const KIND = {
  created: { icon: Rocket, class: 'bg-primary text-primary-foreground' },
  first_done: { icon: Sparkles, class: 'bg-success/15 text-success' },
  sprint_started: { icon: PlayCircle, class: 'bg-info/15 text-info' },
  sprint_completed: { icon: Flag, class: 'bg-info/15 text-info' },
  progress: { icon: Target, class: 'bg-success/15 text-success' },
  completed: { icon: PartyPopper, class: 'bg-success text-white' },
  today: { icon: Flame, class: 'bg-brand text-primary-foreground' },
}
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle>Project timeline</CardTitle>
      <CardDescription>Key moments from the start of the project until today.</CardDescription>
    </CardHeader>
    <CardContent>
      <ol class="relative space-y-4 before:absolute before:top-2 before:bottom-2 before:left-[13px] before:w-px before:bg-border">
        <li v-for="(milestone, index) in milestones" :key="`${milestone.kind}-${index}`" class="relative flex gap-3">
          <span class="relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full ring-4 ring-card" :class="KIND[milestone.kind].class">
            <component :is="KIND[milestone.kind].icon" class="size-3.5" />
          </span>
          <div class="min-w-0 pt-0.5">
            <p class="text-sm leading-tight font-medium" :class="milestone.kind === 'today' && 'text-primary'">{{ milestone.title }}</p>
            <p class="text-xs text-muted-foreground">
              {{ formatDate(milestone.date, 'd MMM yyyy') }}<template v-if="milestone.kind !== 'today'"> · {{ timeAgo(milestone.date) }}</template>
            </p>
            <p v-if="milestone.detail" class="mt-0.5 text-xs text-muted-foreground">{{ milestone.detail }}</p>
          </div>
        </li>
      </ol>
    </CardContent>
  </Card>
</template>

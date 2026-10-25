<script setup lang="ts">
import { CircleHelp } from 'lucide-vue-next'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

const TOKENS = [
  { token: '@priya', meaning: 'Assign (use @me for yourself)' },
  { token: '#backend', meaning: 'Add a label' },
  { token: '!high', meaning: 'Priority: !highest !high !low, !urgent' },
  { token: '^fri', meaning: 'Due: today, tomorrow, mon…sun, +3d, +2w' },
  { token: '~5', meaning: 'Story points' },
  { token: '/bug', meaning: 'Type: /bug /story /task /epic' },
]
</script>

<template>
  <Popover>
    <PopoverTrigger as-child>
      <button type="button" class=" p-1 text-muted-foreground hover:text-foreground" aria-label="Quick add syntax">
        <CircleHelp class="size-4" />
      </button>
    </PopoverTrigger>
    <PopoverContent align="end" class="w-80">
      <p class="mb-2 text-sm font-medium">Type it, don’t click it</p>
      <p class="mb-3 text-xs text-muted-foreground">Add these anywhere in the title. They are removed from the title and fill the fields for you.</p>
      <dl class="space-y-1.5 text-sm">
        <div v-for="item in TOKENS" :key="item.token" class="flex gap-3">
          <dt class="w-20 shrink-0"><code class=" bg-muted px-1.5 py-0.5 text-xs">{{ item.token }}</code></dt>
          <dd class="text-muted-foreground">{{ item.meaning }}</dd>
        </div>
      </dl>
    </PopoverContent>
  </Popover>
</template>

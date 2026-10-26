<script setup lang="ts">
import { Check, Sparkles } from 'lucide-vue-next'
import { computed } from 'vue'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'

/** A short "next steps" checklist shown until every step is done, so admins always know what to do next. */
const props = defineProps<{
  title: string
  steps: Array<{ label: string; description: string; done: boolean; actionLabel: string; action: () => void }>
}>()

const doneCount = computed(() => props.steps.filter((step) => step.done).length)
const nextIndex = computed(() => props.steps.findIndex((step) => !step.done))
</script>

<template>
  <section v-if="doneCount < steps.length" class="border border-primary/25 bg-card shadow-soft">
    <div class="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-5 py-3.5">
      <h2 class="flex items-center gap-2 text-sm font-semibold"><Sparkles class="size-4 text-primary" /> {{ title }}</h2>
      <div class="flex w-40 items-center gap-2">
        <Progress :model-value="(doneCount / steps.length) * 100" class="h-1.5" />
        <span class="shrink-0 text-xs text-muted-foreground tabular-nums">{{ doneCount }}/{{ steps.length }}</span>
      </div>
    </div>
    <ol class="grid gap-px bg-border/60 sm:grid-cols-3">
      <li v-for="(step, index) in steps" :key="step.label" class="flex gap-3 bg-card p-4" :class="index === nextIndex && 'bg-primary/5'">
        <span
          class="flex size-7 shrink-0 items-center justify-center text-xs font-semibold"
          :class="step.done ? 'bg-success text-white' : index === nextIndex ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'"
        >
          <Check v-if="step.done" class="size-4" />
          <template v-else>{{ index + 1 }}</template>
        </span>
        <div class="min-w-0 flex-1 space-y-1.5">
          <p class="text-sm font-medium" :class="step.done && 'text-muted-foreground line-through'">{{ step.label }}</p>
          <p class="text-xs text-muted-foreground">{{ step.description }}</p>
          <Button v-if="!step.done" size="sm" :variant="index === nextIndex ? 'brand' : 'outline'" class="mt-1" @click="step.action">{{ step.actionLabel }}</Button>
        </div>
      </li>
    </ol>
  </section>
</template>

<script setup lang="ts">
import { ArrowRight, BookMarked, ChevronRight, Lightbulb, ListOrdered, Quote, Sparkles } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import type { GuideTopic } from '../guide-content'

defineProps<{
  topic: GuideTopic
  next?: GuideTopic | null
  previous?: GuideTopic | null
}>()

const emit = defineEmits<{
  select: [id: string]
}>()
</script>

<template>
  <article class="w-full space-y-4 pb-4">
    <header class="flex items-start gap-3 border-b border-border/60 pb-3">
      <span class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <component :is="topic.icon" class="size-4" />
      </span>
      <div class="min-w-0 space-y-0.5">
        <p class="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">Topic {{ topic.order }}</p>
        <h2 class="text-lg font-semibold tracking-tight sm:text-xl">{{ topic.title }}</h2>
        <p class="text-sm leading-snug text-muted-foreground">{{ topic.summary }}</p>
      </div>
    </header>

    <section class="rounded-lg border border-primary/15 bg-primary/[0.04] px-3 py-2.5">
      <h3 class="mb-1 flex items-center gap-1.5 text-[10px] font-semibold tracking-wide text-primary uppercase">
        <Sparkles class="size-3" /> When to use
      </h3>
      <p class="text-sm leading-snug text-foreground/90">{{ topic.whenToUse }}</p>
    </section>

    <section class="space-y-2">
      <div class="flex items-center justify-between gap-2">
        <h3 class="flex items-center gap-1.5 text-sm font-semibold">
          <ListOrdered class="size-3.5 text-primary" /> How to do it
        </h3>
        <span class="text-[11px] text-muted-foreground tabular-nums">{{ topic.steps.length }} steps</span>
      </div>

      <ol>
        <li
          v-for="(step, index) in topic.steps"
          :key="step.title"
          class="relative flex gap-2.5 pb-2.5 last:pb-0"
        >
          <div class="flex w-7 shrink-0 flex-col items-center">
            <span
              class="z-10 flex size-7 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground tabular-nums"
            >
              {{ index + 1 }}
            </span>
            <span
              v-if="index < topic.steps.length - 1"
              class="mt-0.5 w-px flex-1 bg-border"
              aria-hidden="true"
            />
          </div>

          <div class="min-w-0 flex-1 rounded-lg border border-border/70 bg-card px-3 py-2.5">
            <p class="text-sm font-medium">{{ step.title }}</p>
            <p class="mt-1 text-sm leading-snug text-muted-foreground">{{ step.detail }}</p>
            <ul v-if="step.hints?.length" class="mt-2 space-y-1 border-t border-border/50 pt-2">
              <li
                v-for="hint in step.hints"
                :key="hint"
                class="flex gap-1.5 text-[13px] leading-snug text-foreground/85"
              >
                <ChevronRight class="mt-0.5 size-3 shrink-0 text-primary" />
                <span>{{ hint }}</span>
              </li>
            </ul>
          </div>
        </li>
      </ol>
    </section>

    <section class="overflow-hidden rounded-lg border border-border/70 bg-muted/20">
      <div class="flex items-center gap-2 border-b border-border/60 bg-muted/30 px-3 py-2">
        <Quote class="size-3.5 text-primary" />
        <div>
          <h3 class="text-sm font-semibold">Example · {{ topic.example.title }}</h3>
          <p class="text-[11px] text-muted-foreground">Walkthrough of the steps above</p>
        </div>
      </div>
      <div class="space-y-2 px-3 py-2.5 text-sm leading-snug">
        <p class="text-foreground/90">{{ topic.example.story }}</p>
        <div class="rounded-md border border-emerald-500/20 bg-emerald-500/8 px-2.5 py-2">
          <p class="text-[10px] font-semibold tracking-wide text-emerald-700 uppercase dark:text-emerald-300">Result</p>
          <p class="mt-0.5 text-sm text-foreground/90">{{ topic.example.outcome }}</p>
        </div>
      </div>
    </section>

    <section v-if="topic.tips?.length" class="space-y-1.5">
      <h3 class="flex items-center gap-1.5 text-sm font-semibold">
        <Lightbulb class="size-3.5 text-amber-600 dark:text-amber-400" /> Tips
      </h3>
      <ul class="space-y-1.5">
        <li
          v-for="tip in topic.tips"
          :key="tip"
          class="flex gap-2 rounded-lg border border-amber-500/20 bg-amber-500/[0.06] px-2.5 py-2 text-sm leading-snug text-foreground/90"
        >
          <BookMarked class="mt-0.5 size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
          <span>{{ tip }}</span>
        </li>
      </ul>
    </section>

    <footer
      v-if="previous || next"
      class="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3"
    >
      <Button
        v-if="previous"
        size="sm"
        variant="outline"
        class="gap-1"
        @click="emit('select', previous.id)"
      >
        <ArrowRight class="size-3.5 rotate-180" />
        {{ previous.title }}
      </Button>
      <span v-else />
      <Button v-if="next" size="sm" class="gap-1" @click="emit('select', next.id)">
        {{ next.title }}
        <ArrowRight class="size-3.5" />
      </Button>
    </footer>
  </article>
</template>

<script setup lang="ts">
import { Skeleton } from '@/components/ui/skeleton'

withDefaults(
  defineProps<{
    /** Wide boards show multiple columns; phone shows one status + cards. */
    variant?: 'desktop' | 'mobile'
  }>(),
  { variant: 'desktop' },
)
</script>

<template>
  <div aria-busy="true" aria-label="Loading board">
    <!-- Toolbar -->
    <div class="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2.5 sm:px-4">
      <Skeleton class="h-8 w-40 rounded-md sm:w-56" />
      <Skeleton class="h-8 w-24 rounded-md" :delay="1" />
      <Skeleton class="h-8 w-28 rounded-md" :delay="2" />
      <Skeleton class="ml-auto h-8 w-24 rounded-md" :delay="3" />
    </div>

    <template v-if="variant === 'mobile'">
      <div class="space-y-3 p-3">
        <div class="flex items-center justify-between gap-2">
          <Skeleton class="h-9 w-9 rounded-md" />
          <Skeleton class="h-5 w-28" />
          <Skeleton class="h-9 w-9 rounded-md" />
        </div>
        <div class="flex justify-center gap-1.5">
          <Skeleton v-for="index in 4" :key="`dot-${index}`" class="h-1.5 w-1.5 rounded-full" :delay="index" />
        </div>
        <Skeleton class="h-9 w-full rounded-lg" :delay="1" />
        <div class="space-y-2">
          <div
            v-for="index in 5"
            :key="`mcard-${index}`"
            class="rounded-xl border border-border/80 bg-card p-3 shadow-soft"
          >
            <div class="flex items-center gap-2">
              <Skeleton class="size-4 rounded" :delay="index" />
              <Skeleton class="h-3 w-16" :delay="index" />
              <Skeleton class="ml-auto size-3.5 rounded" :delay="index" />
            </div>
            <Skeleton class="mt-2 h-4 w-5/6" :delay="index + 1" />
            <div class="mt-3 flex items-center gap-2">
              <Skeleton class="h-5 w-16 rounded-full" :delay="index + 1" />
              <Skeleton class="ml-auto size-6 rounded-full" :delay="index + 2" />
            </div>
          </div>
        </div>
      </div>
    </template>

    <template v-else>
      <div class="grid min-h-0 flex-1 auto-cols-[minmax(17rem,1fr)] grid-flow-col gap-3 overflow-x-auto p-3 sm:p-4">
        <div
          v-for="col in 4"
          :key="`col-${col}`"
          class="flex min-w-[17rem] flex-col gap-1.5 rounded-xl bg-muted/45 p-1.5 dark:bg-muted/30"
        >
          <div class="flex h-11 items-center gap-2 rounded-xl bg-muted/60 px-3 dark:bg-muted/40">
            <Skeleton class="size-2.5 shrink-0 rounded-full" :delay="col" />
            <Skeleton class="h-3.5 w-20" :delay="col" />
            <Skeleton class="h-5 w-7 rounded-full" :delay="col + 1" />
          </div>
          <div
            v-for="card in col === 2 ? 4 : col === 4 ? 2 : 3"
            :key="`card-${col}-${card}`"
            class="rounded-[10px] border border-border/80 bg-card p-2.5 shadow-soft"
          >
            <div class="flex items-center gap-1.5">
              <Skeleton class="size-4 rounded" :delay="card" />
              <Skeleton class="h-3 w-14" :delay="card" />
              <Skeleton class="ml-auto size-3.5" :delay="card" />
            </div>
            <Skeleton class="mt-2 h-3.5 w-full" :delay="card + 1" />
            <Skeleton class="mt-1.5 h-3.5 w-4/5" :delay="card + 1" />
            <div class="mt-2.5 flex items-center gap-2">
              <Skeleton class="h-5 w-14 rounded-full" :delay="card + 2" />
              <Skeleton class="ml-auto size-6 rounded-full" :delay="card + 2" />
            </div>
          </div>
          <Skeleton class="mt-0.5 h-7 w-full rounded-lg" :delay="col + 2" />
        </div>
      </div>
    </template>
  </div>
</template>

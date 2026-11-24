<script setup lang="ts">
import { Skeleton } from '@/components/ui/skeleton'

defineProps<{
  /** Mobile my-tasks uses a tighter upper stack + list skeletons. */
  variant?: 'desktop' | 'mobile'
}>()
</script>

<template>
  <div class="space-y-3.5 sm:space-y-4" aria-busy="true" aria-label="Loading your workday">
    <!-- Focus / briefing strip -->
    <div class="grid gap-2.5 sm:grid-cols-3">
      <Skeleton v-for="index in 3" :key="`focus-${index}`" class="h-[4.5rem] rounded-xl" :delay="index" />
    </div>

    <!-- Day loop: header + four steps -->
    <div class="overflow-hidden rounded-xl border border-border bg-card p-4 shadow-soft">
      <Skeleton class="h-4 w-40" :delay="1" />
      <Skeleton class="mt-2 h-3 w-64 max-w-full" :delay="2" />
      <div class="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Skeleton v-for="index in 4" :key="`loop-${index}`" class="h-16 rounded-lg" :delay="index + 1" />
      </div>
    </div>

    <!-- Today panel -->
    <div class="overflow-hidden rounded-xl border border-border bg-card p-4 shadow-soft">
      <div class="flex items-center gap-2">
        <Skeleton class="h-4 w-28" :delay="2" />
        <Skeleton class="ml-auto h-7 w-20 rounded-md" :delay="3" />
      </div>
      <div class="mt-3 flex flex-wrap gap-2">
        <Skeleton class="h-7 w-20 rounded-md" :delay="3" />
        <Skeleton class="h-7 w-24 rounded-md" :delay="4" />
        <Skeleton class="h-7 w-16 rounded-md" :delay="5" />
      </div>
      <div class="mt-4 space-y-2">
        <Skeleton class="h-11 w-full rounded-lg" :delay="3" />
        <Skeleton class="h-11 w-full rounded-lg" :delay="4" />
        <Skeleton class="h-11 w-5/6 rounded-lg" :delay="5" />
      </div>
    </div>

    <template v-if="variant !== 'mobile'">
      <!-- Stats strip — matches DesktopDashboard (5 cols from xl) -->
      <div class="grid grid-cols-2 gap-2.5 sm:gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Skeleton v-for="index in 5" :key="`stat-${index}`" class="h-[86px] rounded-xl" :delay="index" />
      </div>

      <!-- My work + side — stacked until 2xl like the live layout -->
      <div class="flex flex-col gap-5 2xl:grid 2xl:grid-cols-[minmax(0,1fr)_minmax(22rem,28rem)] 2xl:items-start">
        <div class="overflow-hidden rounded-xl border border-border bg-card shadow-soft">
          <div class="flex h-12 items-center gap-3 border-b border-border px-4">
            <Skeleton class="h-4 w-20" />
            <Skeleton class="h-7 w-36 rounded-md" />
            <Skeleton class="ml-auto h-7 w-24 rounded-md" />
          </div>
          <div class="divide-y divide-border/60">
            <div v-for="index in 6" :key="`row-${index}`" class="flex items-center gap-3 px-4 py-2.5">
              <Skeleton class="size-4 shrink-0 rounded" :delay="index" />
              <Skeleton class="h-4 w-14 shrink-0" :delay="index" />
              <Skeleton class="h-4 min-w-0 flex-1" :delay="index + 1" />
              <Skeleton class="size-6 shrink-0 rounded-full" :delay="index + 1" />
            </div>
          </div>
        </div>
        <div class="overflow-hidden rounded-xl border border-border bg-card shadow-soft">
          <div class="flex h-12 items-center gap-2 border-b border-border px-4">
            <Skeleton class="h-7 w-24 rounded-md" />
            <Skeleton class="h-7 w-24 rounded-md" />
          </div>
          <div class="space-y-3 p-4">
            <Skeleton v-for="index in 3" :key="`side-${index}`" class="h-16 w-full rounded-lg" :delay="index + 2" />
          </div>
        </div>
      </div>
    </template>

    <template v-else>
      <div class="grid w-full grid-cols-4 gap-1 rounded-lg bg-muted p-1">
        <Skeleton v-for="index in 4" :key="`seg-${index}`" class="h-12 rounded-md" :delay="index" />
      </div>
      <div class="space-y-2">
        <div
          v-for="index in 5"
          :key="`card-${index}`"
          class="flex gap-3 rounded-xl border border-border bg-card p-3 shadow-soft"
        >
          <Skeleton class="size-5 shrink-0 rounded" :delay="index" />
          <div class="min-w-0 flex-1 space-y-2">
            <Skeleton class="h-4 w-4/5" :delay="index" />
            <Skeleton class="h-3 w-1/2" :delay="index + 1" />
          </div>
          <Skeleton class="size-7 shrink-0 rounded-full" :delay="index + 1" />
        </div>
      </div>
    </template>
  </div>
</template>

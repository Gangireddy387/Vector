<script setup lang="ts">
import { Skeleton } from '@/components/ui/skeleton'

defineProps<{
  /** Mobile my-tasks uses a tighter upper stack + list skeletons. */
  variant?: 'desktop' | 'mobile'
}>()
</script>

<template>
  <div class="space-y-3.5 sm:space-y-4" aria-busy="true" aria-label="Loading your workday">
    <!-- Day loop: header + four steps -->
    <div class="overflow-hidden rounded-xl border border-border bg-card p-4 shadow-soft">
      <Skeleton class="h-4 w-40" />
      <Skeleton class="mt-2 h-3 w-64 max-w-full" />
      <div class="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Skeleton v-for="index in 4" :key="index" class="h-16 rounded-lg" />
      </div>
    </div>

    <!-- Today panel -->
    <div class="overflow-hidden rounded-xl border border-border bg-card p-4 shadow-soft">
      <Skeleton class="h-4 w-28" />
      <div class="mt-3 flex flex-wrap gap-2">
        <Skeleton class="h-7 w-20 rounded-md" />
        <Skeleton class="h-7 w-24 rounded-md" />
        <Skeleton class="h-7 w-16 rounded-md" />
      </div>
      <div class="mt-4 space-y-2">
        <Skeleton class="h-10 w-full rounded-lg" />
        <Skeleton class="h-10 w-full rounded-lg" />
        <Skeleton class="h-10 w-5/6 rounded-lg" />
      </div>
    </div>

    <template v-if="variant !== 'mobile'">
      <!-- Stats strip -->
      <div class="grid grid-cols-2 gap-2.5 sm:gap-3 md:grid-cols-3 lg:grid-cols-5">
        <Skeleton v-for="index in 5" :key="index" class="h-[86px] rounded-xl" />
      </div>

      <!-- My work + side -->
      <div class="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)]">
        <div class="overflow-hidden rounded-xl border border-border bg-card shadow-soft">
          <div class="flex h-12 items-center gap-3 border-b border-border px-4">
            <Skeleton class="h-4 w-20" />
            <Skeleton class="ml-auto h-7 w-28 rounded-md" />
          </div>
          <div class="space-y-0 p-0">
            <Skeleton v-for="index in 5" :key="index" class="h-11 w-full rounded-none border-b border-border/60" />
          </div>
        </div>
        <div class="overflow-hidden rounded-xl border border-border bg-card shadow-soft">
          <div class="flex h-12 items-center border-b border-border px-4">
            <Skeleton class="h-7 w-48 rounded-md" />
          </div>
          <div class="space-y-3 p-4">
            <Skeleton class="h-14 w-full rounded-lg" />
            <Skeleton class="h-14 w-full rounded-lg" />
            <Skeleton class="h-14 w-full rounded-lg" />
          </div>
        </div>
      </div>
    </template>

    <template v-else>
      <div class="grid w-full grid-cols-4 gap-1 rounded-lg bg-muted p-1">
        <Skeleton v-for="index in 4" :key="index" class="h-12 rounded-md" />
      </div>
      <div class="space-y-2">
        <Skeleton v-for="index in 4" :key="index" class="h-20 w-full rounded-xl" />
      </div>
    </template>
  </div>
</template>

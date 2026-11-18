<script setup lang="ts">
import type { Component } from 'vue'
import { cn } from '@/lib/utils'

const props = defineProps<{ icon?: Component; title: string; description?: string; class?: string }>()
</script>

<template>
  <div :class="cn('rise-in flex flex-col items-center justify-center gap-3 px-4 py-10 text-center', props.class)">
    <div
      v-if="icon"
      class="pop-in relative flex size-11 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground shadow-soft"
    >
      <component :is="icon" class="size-5" />
    </div>
    <div class="space-y-1">
      <p class="text-sm font-medium">{{ title }}</p>
      <p v-if="description" class="mx-auto max-w-sm text-[13px] text-muted-foreground">{{ description }}</p>
    </div>
    <slot />
  </div>
</template>

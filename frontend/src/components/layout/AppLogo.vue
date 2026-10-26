<script setup lang="ts">
import { computed } from 'vue'
import { assetUrl } from '@/lib/http'
import { useWorkspaceStore } from '@/stores/workspace.store'
import BrandMark from './BrandMark.vue'

withDefaults(defineProps<{ compact?: boolean; inverted?: boolean }>(), { compact: false, inverted: false })
const workspace = useWorkspaceStore()
const logo = computed(() => assetUrl(workspace.settings.logoUrl))
</script>

<template>
  <RouterLink
    to="/"
    class="group inline-flex items-center gap-2.5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    :aria-label="`${workspace.settings.name} home`"
  >
    <span
      v-if="logo"
      class="flex size-8 shrink-0 items-center justify-center overflow-hidden border border-border bg-white transition-transform duration-200 group-hover:-rotate-3"
    >
      <img :src="logo" alt="" class="size-full object-contain p-0.5" />
    </span>
    <span
      v-else
      class="relative flex size-8 shrink-0 items-center justify-center overflow-hidden transition-transform duration-200 group-hover:-rotate-3"
      :class="inverted ? 'bg-white/20 text-white ring-1 ring-white/30' : 'bg-brand text-white shadow-glow'"
    >
      <span
        v-if="!inverted"
        class="pointer-events-none absolute inset-0"
        style="background: radial-gradient(circle at 15% 5%, rgb(255 255 255 / 0.25), transparent 60%)"
      />
      <BrandMark class="relative size-[22px]" />
    </span>
    <span v-if="!compact" class="truncate text-[17px] font-semibold tracking-tight">{{ workspace.settings.name }}</span>
  </RouterLink>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import OrganizationLogo from '@/components/common/OrganizationLogo.vue'
import { assetUrl } from '@/lib/http'
import { useWorkspaceStore } from '@/stores/workspace.store'
import BrandMark from './BrandMark.vue'

withDefaults(defineProps<{ compact?: boolean; inverted?: boolean }>(), { compact: false, inverted: false })
const workspace = useWorkspaceStore()
const logo = computed(() => assetUrl(workspace.settings.logoUrl))
/** A wordmark already shows the name, so the text next to it is left out. */
const logoIsWide = ref(false)
</script>

<template>
  <RouterLink
    to="/"
    class="group inline-flex items-center gap-2.5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    :aria-label="`${workspace.settings.name} home`"
  >
    <OrganizationLogo
      v-if="logo"
      v-model:wide="logoIsWide"
      :src="logo"
      :alt="workspace.settings.name"
      size="sm"
      :square="compact"
      bare
      :class="compact ? 'transition-transform duration-200 group-hover:-rotate-1' : 'h-10 transition-transform duration-200 group-hover:-rotate-1'"
    />
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
    <span v-if="!compact && !(logo && logoIsWide)" class="truncate text-[17px] font-semibold tracking-tight">{{ workspace.settings.name }}</span>
  </RouterLink>
</template>

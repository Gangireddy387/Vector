<script setup lang="ts">
import { ArrowRight } from 'lucide-vue-next'
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import BrandOrbitShell from '@/components/layout/BrandOrbitShell.vue'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/modules/auth/auth.store'

/** Public marketing home — same rich orbit stage as sign-in. */
const auth = useAuthStore()

const primaryCta = computed(() => {
  if (auth.isAuthenticated) return { name: 'home' as const, query: { startDay: '1' } }
  return { name: 'register' as const, query: { from: 'landing' } }
})
const primaryLabel = computed(() => (auth.isAuthenticated ? 'Open workspace' : 'Start free'))
</script>

<template>
  <BrandOrbitShell
    eyebrow="Workday OS · Standup · Meetings"
    headline="One place for"
    headline-accent="the workday."
    description="Standup, tasks, chat and meetings in one loop — mornings for shipping, not switching tools."
    header-hint="Work management for every team"
  >
    <template #header-actions>
      <Button variant="ghost" size="sm" class="hidden text-inherit hover:bg-white/10 sm:inline-flex lg:text-white lg:hover:bg-white/10" as-child>
        <RouterLink :to="{ name: 'pricing' }">Pricing</RouterLink>
      </Button>
    </template>

    <div class="space-y-5 text-center">
      <div class="space-y-2">
        <p class="text-xs font-semibold tracking-[0.16em] text-primary uppercase">Vector</p>
        <h1 class="text-2xl font-semibold tracking-tight sm:text-[1.65rem]">Start your workday</h1>
        <p class="text-sm leading-relaxed text-muted-foreground">
          Free includes standup, tasks, chat and meetings. No card needed.
        </p>
      </div>

      <div class="flex flex-col gap-2.5">
        <Button variant="brand" size="lg" class="w-full" as-child>
          <RouterLink :to="primaryCta">{{ primaryLabel }} <ArrowRight /></RouterLink>
        </Button>
        <Button variant="outline" size="lg" class="w-full" as-child>
          <RouterLink :to="{ name: 'pricing' }">See pricing</RouterLink>
        </Button>
        <Button v-if="!auth.isAuthenticated" variant="ghost" size="sm" class="w-full" as-child>
          <RouterLink :to="{ name: 'login' }">I already have an account</RouterLink>
        </Button>
        <Button v-else variant="ghost" size="sm" class="w-full" as-child>
          <RouterLink :to="{ name: 'home' }">Go to Home</RouterLink>
        </Button>
      </div>

      <nav class="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-muted-foreground" aria-label="Explore">
        <RouterLink :to="{ name: 'workday-preview' }" class="hover:text-foreground hover:underline">Workday preview</RouterLink>
        <span aria-hidden="true">·</span>
        <RouterLink :to="{ name: 'developers' }" class="hover:text-foreground hover:underline">Developers</RouterLink>
        <span aria-hidden="true">·</span>
        <RouterLink :to="{ name: 'privacy' }" class="hover:text-foreground hover:underline">Privacy</RouterLink>
      </nav>
    </div>

    <template #footer>
      <nav class="flex flex-wrap justify-end gap-x-3 gap-y-1">
        <RouterLink :to="{ name: 'pricing' }" class="hover:text-foreground hover:underline lg:hover:text-white">Pricing</RouterLink>
        <RouterLink :to="{ name: 'developers' }" class="hover:text-foreground hover:underline lg:hover:text-white">Developers</RouterLink>
        <RouterLink :to="{ name: 'workday-preview' }" class="hover:text-foreground hover:underline lg:hover:text-white">Workday</RouterLink>
        <RouterLink :to="{ name: 'privacy' }" class="hover:text-foreground hover:underline lg:hover:text-white">Privacy</RouterLink>
        <RouterLink :to="{ name: 'terms' }" class="hover:text-foreground hover:underline lg:hover:text-white">Terms</RouterLink>
      </nav>
    </template>
  </BrandOrbitShell>
</template>

<script setup lang="ts">
import { ArrowRight } from 'lucide-vue-next'
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import BrandMark from '@/components/layout/BrandMark.vue'
import ThemeSwitch from '@/components/layout/ThemeSwitch.vue'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/modules/auth/auth.store'
import WorkdayLoopDemo from '../components/WorkdayLoopDemo.vue'

/**
 * Public shareable surface: Vector’s workday loop without signup.
 * Linked from guest join, invite preview, and shareable /workday.
 */
const auth = useAuthStore()
const route = useRoute()

const orgSlug = computed(() => (typeof route.query.org === 'string' ? route.query.org : ''))
const ctaTo = computed(() => {
  if (auth.isAuthenticated) return { name: 'home' as const, query: { startDay: '1' } }
  return {
    name: 'register' as const,
    query: { from: 'workday', ...(orgSlug.value ? { org: orgSlug.value } : {}) },
  }
})
const ctaLabel = computed(() => (auth.isAuthenticated ? 'Start my day' : 'Start free workspace'))
</script>

<template>
  <div class="relative min-h-svh overflow-hidden bg-background text-foreground">
    <div
      class="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/12 via-background to-background"
      aria-hidden="true"
    />
    <div class="relative mx-auto flex min-h-svh w-full max-w-3xl flex-col px-4 py-6 sm:px-6 sm:py-10">
      <header class="flex items-center justify-between gap-3">
        <RouterLink to="/" class="inline-flex items-center gap-2.5" aria-label="Vector home">
          <BrandMark class="size-8" />
          <span class="text-lg font-semibold tracking-tight">Vector</span>
        </RouterLink>
        <div class="flex items-center gap-2">
          <ThemeSwitch />
          <Button v-if="!auth.isAuthenticated" variant="ghost" size="sm" as-child>
            <RouterLink :to="{ name: 'login' }">Sign in</RouterLink>
          </Button>
        </div>
      </header>

      <main class="flex flex-1 flex-col justify-center gap-8 py-10 sm:py-14">
        <div class="space-y-3 text-center sm:text-left">
          <p class="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Workday OS</p>
          <h1 class="text-3xl font-semibold tracking-tight sm:text-4xl">One loop every morning</h1>
          <p class="max-w-xl text-sm text-muted-foreground sm:text-base">
            Standup → tasks → meetings → messages. Managers unblock people in minutes; the team feels Vector working before noon.
          </p>
        </div>

        <WorkdayLoopDemo :cta-to="ctaTo" :cta-label="ctaLabel" />

        <div class="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button variant="brand" size="lg" class="sm:min-w-56" as-child>
            <RouterLink :to="ctaTo">{{ ctaLabel }} <ArrowRight /></RouterLink>
          </Button>
          <Button v-if="!auth.isAuthenticated" variant="outline" size="lg" as-child>
            <RouterLink :to="{ name: 'login' }">I already have an account</RouterLink>
          </Button>
        </div>
      </main>
    </div>
  </div>
</template>

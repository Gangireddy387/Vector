<script setup lang="ts">
import { ArrowRight, ClipboardList, ListTodo, MessageCircle, Video } from 'lucide-vue-next'
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import BrandOrbitShell from '@/components/layout/BrandOrbitShell.vue'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/modules/auth/auth.store'

/** Public shareable surface — same rich orbit as About / sign-in. */
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

const steps = [
  { icon: ClipboardList, label: 'Standup', detail: 'Post blockers and plans' },
  { icon: ListTodo, label: 'Tasks', detail: 'Clear overdue and due today' },
  { icon: Video, label: 'Meetings', detail: 'Turn actions into tasks' },
  { icon: MessageCircle, label: 'Messages', detail: 'Close the loop with people' },
]
</script>

<template>
  <BrandOrbitShell
    :show-radar="false"
    eyebrow="Workday OS · Standup · Meetings"
    headline="One loop"
    headline-accent="every morning."
    description="Standup → tasks → meetings → messages. Managers unblock people in minutes; the team feels Vector before noon."
    header-hint="Work management for every team"
  >
    <template #header-actions>
      <Button variant="ghost" size="sm" class="hidden text-inherit hover:bg-white/10 sm:inline-flex lg:text-white lg:hover:bg-white/10" as-child>
        <RouterLink :to="{ name: 'landing' }">About</RouterLink>
      </Button>
      <Button v-if="!auth.isAuthenticated" variant="ghost" size="sm" class="text-inherit hover:bg-white/10 lg:text-white lg:hover:bg-white/10" as-child>
        <RouterLink :to="{ name: 'login' }">Sign in</RouterLink>
      </Button>
    </template>

    <div class="space-y-4 text-center">
      <div class="space-y-2">
        <p class="text-xs font-semibold tracking-[0.16em] text-primary uppercase">Workday OS</p>
        <h1 class="text-2xl font-semibold tracking-tight sm:text-[1.65rem]">One loop every morning</h1>
        <p class="text-sm leading-relaxed text-muted-foreground">
          Free includes the full loop. No card needed.
        </p>
      </div>

      <ul class="grid grid-cols-2 gap-2 text-left">
        <li
          v-for="step in steps"
          :key="step.label"
          class="rounded-xl border border-border/70 bg-background/50 px-2.5 py-2"
        >
          <span class="flex items-center gap-1.5 text-xs font-semibold">
            <component :is="step.icon" class="size-3.5 text-primary" />
            {{ step.label }}
          </span>
          <span class="mt-0.5 block text-[11px] leading-snug text-muted-foreground">{{ step.detail }}</span>
        </li>
      </ul>

      <div class="flex flex-col gap-2.5">
        <Button variant="brand" size="lg" class="w-full" as-child>
          <RouterLink :to="ctaTo">{{ ctaLabel }} <ArrowRight /></RouterLink>
        </Button>
        <Button v-if="!auth.isAuthenticated" variant="outline" size="lg" class="w-full" as-child>
          <RouterLink :to="{ name: 'login' }">I already have an account</RouterLink>
        </Button>
        <Button variant="ghost" size="sm" class="w-full" as-child>
          <RouterLink :to="{ name: 'pricing' }">See pricing</RouterLink>
        </Button>
      </div>
    </div>

    <template #footer>
      <nav class="flex flex-wrap justify-end gap-x-3 gap-y-1">
        <RouterLink :to="{ name: 'landing' }" class="hover:text-foreground hover:underline lg:hover:text-white">About</RouterLink>
        <RouterLink :to="{ name: 'pricing' }" class="hover:text-foreground hover:underline lg:hover:text-white">Pricing</RouterLink>
        <RouterLink :to="{ name: 'developers' }" class="hover:text-foreground hover:underline lg:hover:text-white">Developers</RouterLink>
        <RouterLink :to="{ name: 'privacy' }" class="hover:text-foreground hover:underline lg:hover:text-white">Privacy</RouterLink>
      </nav>
    </template>
  </BrandOrbitShell>
</template>

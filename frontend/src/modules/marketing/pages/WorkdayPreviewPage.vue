<script setup lang="ts">
import { ArrowRight, ClipboardList, ListTodo, MessageCircle, Play, Video } from 'lucide-vue-next'
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import BrandMark from '@/components/layout/BrandMark.vue'
import ThemeSwitch from '@/components/layout/ThemeSwitch.vue'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/modules/auth/auth.store'

/**
 * Public shareable surface: Vector’s workday loop without signup.
 * Linked from guest join, invite preview, and shareable /workday.
 */
const auth = useAuthStore()
const route = useRoute()

const LOOP = [
  { icon: ClipboardList, label: 'Standup', detail: 'Post blockers and plans' },
  { icon: ListTodo, label: 'Tasks', detail: 'Clear overdue and due today' },
  { icon: Video, label: 'Meetings', detail: 'Turn actions into tasks' },
  { icon: MessageCircle, label: 'Messages', detail: 'Close the loop with people' },
]

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

        <section class="overflow-hidden rounded-2xl border border-border/80 bg-card/90 shadow-soft backdrop-blur" aria-label="Workday loop preview">
          <header class="flex flex-col gap-3 border-b border-border px-4 py-3.5 sm:flex-row sm:items-center">
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <h2 class="text-sm font-semibold">Start my day</h2>
                <span class="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">Preview</span>
              </div>
              <p class="mt-0.5 text-xs text-muted-foreground">No account needed to see the rhythm — sign up when you’re ready.</p>
            </div>
            <Button size="sm" class="shrink-0 self-start sm:self-center" as-child>
              <RouterLink :to="ctaTo"><Play /> {{ ctaLabel }}</RouterLink>
            </Button>
          </header>

          <ol class="grid sm:grid-cols-2 lg:grid-cols-4 lg:divide-x lg:divide-border/70">
            <li
              v-for="(step, index) in LOOP"
              :key="step.label"
              class="border-b border-border/70 last:border-b-0 sm:[&:nth-last-child(-n+2)]:border-b-0 lg:border-b-0"
            >
              <div class="flex h-full flex-col gap-1.5 px-4 py-3.5">
                <span class="flex items-center gap-2">
                  <span class="flex size-7 items-center justify-center rounded-md bg-primary/15 text-primary">
                    <component :is="step.icon" class="size-3.5" />
                  </span>
                  <span class="text-[11px] font-medium tabular-nums text-muted-foreground">{{ index + 1 }}</span>
                  <span class="text-[13px] font-semibold">{{ step.label }}</span>
                </span>
                <span class="pl-9 text-[12px] text-muted-foreground">{{ step.detail }}</span>
              </div>
            </li>
          </ol>
        </section>

        <div class="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button variant="brand" size="lg" class="sm:min-w-56" as-child>
            <RouterLink :to="ctaTo">{{ ctaLabel }} <ArrowRight /></RouterLink>
          </Button>
          <p class="text-xs text-muted-foreground sm:max-w-sm">
            Free for small teams. Invite people later — they’ll land on Start my day, not a blank board.
          </p>
        </div>
      </main>

      <footer class="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-4 text-xs text-muted-foreground">
        <span class="inline-flex items-center gap-1.5"><BrandMark class="size-4" /> Work management that runs the day</span>
        <div class="flex gap-3">
          <RouterLink class="hover:text-foreground" :to="{ name: 'privacy' }">Privacy</RouterLink>
          <RouterLink class="hover:text-foreground" :to="{ name: 'terms' }">Terms</RouterLink>
        </div>
      </footer>
    </div>
  </div>
</template>

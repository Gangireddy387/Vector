<script setup lang="ts">
import { ArrowRight, Code2, KeyRound } from 'lucide-vue-next'
import { RouterLink } from 'vue-router'
import BrandOrbitShell from '@/components/layout/BrandOrbitShell.vue'
import { Button } from '@/components/ui/button'

const curl = `curl -s …/api/issues \\
  -H "Authorization: Bearer vtk_…" \\
  -H "X-Organization-Id: <org-uuid>"`
</script>

<template>
  <BrandOrbitShell
    variant="sheet"
    :show-radar="false"
    eyebrow="API · Tokens · Webhooks"
    headline="Build on"
    headline-accent="Vector."
    description="Call the same APIs the app uses — scoped to your organization with a personal access token."
    header-hint="Work management for every team"
  >
    <template #header-actions>
      <Button variant="ghost" size="sm" class="hidden text-inherit hover:bg-white/10 sm:inline-flex lg:text-white lg:hover:bg-white/10" as-child>
        <RouterLink :to="{ name: 'landing' }">About</RouterLink>
      </Button>
      <Button variant="ghost" size="sm" class="hidden text-inherit hover:bg-white/10 sm:inline-flex lg:text-white lg:hover:bg-white/10" as-child>
        <RouterLink :to="{ name: 'pricing' }">Pricing</RouterLink>
      </Button>
    </template>

    <div class="space-y-4 text-center">
      <div class="space-y-2">
        <p class="text-xs font-semibold tracking-[0.16em] text-primary uppercase">Developers</p>
        <h1 class="text-2xl font-semibold tracking-tight sm:text-[1.65rem]">Personal API tokens</h1>
        <p class="text-sm leading-relaxed text-muted-foreground">
          Same APIs the app uses — scoped to your organization.
        </p>
      </div>

      <div class="space-y-2 text-left text-xs text-muted-foreground">
        <p class="flex items-start gap-2 rounded-xl border border-border/70 bg-background/50 px-3 py-2">
          <KeyRound class="mt-0.5 size-3.5 shrink-0 text-primary" />
          <span>Settings → Security → API tokens → copy <code class="text-foreground">vtk_…</code></span>
        </p>
        <p class="flex items-start gap-2 rounded-xl border border-border/70 bg-background/50 px-3 py-2">
          <Code2 class="mt-0.5 size-3.5 shrink-0 text-primary" />
          <span>Send <code class="text-foreground">Authorization: Bearer</code> + optional <code class="text-foreground">X-Organization-Id</code></span>
        </p>
        <pre class="overflow-x-auto rounded-xl border border-border/70 bg-muted/50 p-2.5 text-[10px] leading-relaxed whitespace-pre-wrap break-all text-foreground">{{ curl }}</pre>
      </div>

      <div class="flex flex-col gap-2.5">
        <Button variant="brand" size="lg" class="w-full" as-child>
          <RouterLink :to="{ name: 'register' }">Create account <ArrowRight /></RouterLink>
        </Button>
        <Button variant="outline" size="lg" class="w-full" as-child>
          <RouterLink :to="{ name: 'login' }">Sign in to create a token</RouterLink>
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
        <RouterLink :to="{ name: 'workday-preview' }" class="hover:text-foreground hover:underline lg:hover:text-white">Workday</RouterLink>
        <RouterLink :to="{ name: 'privacy' }" class="hover:text-foreground hover:underline lg:hover:text-white">Privacy</RouterLink>
      </nav>
    </template>
  </BrandOrbitShell>
</template>

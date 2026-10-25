<script setup lang="ts">
import { ArrowLeft } from 'lucide-vue-next'
import { computed } from 'vue'
import AppLogo from '@/components/layout/AppLogo.vue'
import { LEGAL } from '@/constants/legal'
import { useAuthStore } from '@/modules/auth/auth.store'

export interface LegalSection {
  id: string
  title: string
}

defineProps<{ title: string; summary: string; sections: LegalSection[] }>()

const auth = useAuthStore()
const backTo = computed(() => (auth.isAuthenticated ? { name: 'home' } : { name: 'login' }))
const year = new Date().getFullYear()
</script>

<template>
  <div class="min-h-dvh bg-background">
    <header class="glass sticky top-0 z-30 border-b border-border/60 pt-safe">
      <div class="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-5">
        <AppLogo />
        <RouterLink :to="backTo" class="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
          <ArrowLeft class="size-4" /> Back to {{ LEGAL.productName }}
        </RouterLink>
      </div>
    </header>

    <div class="mx-auto grid max-w-6xl gap-10 px-5 py-10 lg:grid-cols-[14rem_minmax(0,1fr)]">
      <nav class="hidden lg:block" aria-label="On this page">
        <div class="sticky top-24 space-y-1 text-sm">
          <p class="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">On this page</p>
          <a
            v-for="section in sections"
            :key="section.id"
            :href="`#${section.id}`"
            class="block border-l-2 border-transparent py-1 pl-3 text-muted-foreground hover:border-primary hover:text-foreground"
          >
            {{ section.title }}
          </a>
        </div>
      </nav>

      <article class="legal-body max-w-3xl">
        <p class="text-xs font-semibold tracking-wider text-primary uppercase">Legal</p>
        <h1>{{ title }}</h1>
        <p class="text-sm text-muted-foreground">Effective {{ LEGAL.effectiveDate }} · {{ LEGAL.companyName }}</p>
        <p class="lead">{{ summary }}</p>
        <slot />
      </article>
    </div>

    <footer class="border-t border-border/60">
      <div class="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-5 text-xs text-muted-foreground">
        <span>© {{ year }} {{ LEGAL.companyName }}</span>
        <nav class="flex gap-4" aria-label="Legal">
          <RouterLink :to="{ name: 'privacy' }" class="hover:text-foreground" active-class="text-foreground">Privacy Policy</RouterLink>
          <RouterLink :to="{ name: 'terms' }" class="hover:text-foreground" active-class="text-foreground">Terms of Service</RouterLink>
        </nav>
      </div>
    </footer>
  </div>
</template>

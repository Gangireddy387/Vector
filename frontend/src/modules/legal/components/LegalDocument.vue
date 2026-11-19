<script setup lang="ts">
import { ArrowLeft, ChevronDown } from 'lucide-vue-next'
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import AppLogo from '@/components/layout/AppLogo.vue'
import { LEGAL } from '@/constants/legal'
import { useAuthStore } from '@/modules/auth/auth.store'

export interface LegalSection {
  id: string
  title: string
}

const props = withDefaults(
  defineProps<{ title: string; summary: string; sections: LegalSection[]; /** Inside BrandOrbitShell — no page chrome. */ embedded?: boolean }>(),
  { embedded: false },
)

const auth = useAuthStore()
const backTo = computed(() => (auth.isAuthenticated ? { name: 'home' } : { name: 'landing' }))
const year = new Date().getFullYear()

function goToSection(id: string) {
  if (!id) return
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
</script>

<template>
  <div :class="embedded ? 'min-w-0' : 'min-h-dvh bg-background'">
    <header v-if="!embedded" class="glass sticky top-0 z-30 border-b border-border/60 pt-safe">
      <div class="mx-auto flex h-14 w-full max-w-[90rem] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <AppLogo />
        <RouterLink :to="backTo" class="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
          <ArrowLeft class="size-4" /> Back to {{ LEGAL.productName }}
        </RouterLink>
      </div>
    </header>

    <div
      class="grid w-full gap-6"
      :class="embedded ? 'gap-4' : 'mx-auto max-w-[90rem] gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[14rem_minmax(0,1fr)] lg:px-8'"
    >
      <div :class="embedded ? '' : 'lg:hidden'">
        <label class="mb-1.5 block text-xs font-semibold tracking-wider text-muted-foreground uppercase" for="legal-toc">On this page</label>
        <div class="relative">
          <select
            id="legal-toc"
            class="h-10 w-full appearance-none rounded-md border border-border bg-card/80 px-3 pr-9 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30"
            :value="''"
            @change="goToSection(($event.target as HTMLSelectElement).value); ($event.target as HTMLSelectElement).value = ''"
          >
            <option value="" disabled>Jump to a section…</option>
            <option v-for="section in props.sections" :key="section.id" :value="section.id">{{ section.title }}</option>
          </select>
          <ChevronDown class="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" />
        </div>
      </div>

      <nav v-if="!embedded" class="hidden lg:block" aria-label="On this page">
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

      <article class="legal-body min-w-0" :class="embedded ? '' : 'max-w-4xl'">
        <p class="text-xs font-semibold tracking-wider text-primary uppercase">Legal</p>
        <h1>{{ title }}</h1>
        <p class="text-sm text-muted-foreground">Effective {{ LEGAL.effectiveDate }} · {{ LEGAL.companyName }}</p>
        <p class="lead">{{ summary }}</p>
        <slot />
      </article>
    </div>

    <footer v-if="!embedded" class="border-t border-border/60">
      <div class="mx-auto flex h-14 w-full max-w-[90rem] items-center justify-between gap-4 px-4 text-xs text-muted-foreground sm:px-6 lg:px-8">
        <span>© {{ year }} {{ LEGAL.companyName }}</span>
        <nav class="flex gap-4" aria-label="Legal">
          <RouterLink :to="{ name: 'privacy' }" class="hover:text-foreground" active-class="text-foreground">Privacy Policy</RouterLink>
          <RouterLink :to="{ name: 'terms' }" class="hover:text-foreground" active-class="text-foreground">Terms of Service</RouterLink>
        </nav>
      </div>
    </footer>
  </div>
</template>

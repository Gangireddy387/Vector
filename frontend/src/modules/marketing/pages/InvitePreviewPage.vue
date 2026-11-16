<script setup lang="ts">
import { ArrowRight, ClipboardList, ListTodo, LoaderCircle, MessageCircle, Video } from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import BrandMark from '@/components/layout/BrandMark.vue'
import OrganizationLogo from '@/components/common/OrganizationLogo.vue'
import ThemeSwitch from '@/components/layout/ThemeSwitch.vue'
import { Button } from '@/components/ui/button'
import { assetUrl, getErrorMessage } from '@/lib/http'
import { organizationsApi } from '@/modules/auth/auth.api'
import { useAuthStore } from '@/modules/auth/auth.store'

/**
 * Viral invite surface: branded org + workday loop without requiring a token or signup.
 * Real membership still needs an email invite (/accept-invite) or admin add.
 */
const auth = useAuthStore()
const route = useRoute()

const LOOP = [
  { icon: ClipboardList, label: 'Standup' },
  { icon: ListTodo, label: 'Tasks' },
  { icon: Video, label: 'Meetings' },
  { icon: MessageCircle, label: 'Messages' },
]

const slug = computed(() => String(route.params.slug ?? '').toLowerCase())
const org = ref<{ name: string; slug: string; logoUrl?: string | null; brandColor?: string | null } | null>(null)
const errorMessage = ref('')
const loading = ref(true)

onMounted(async () => {
  try {
    org.value = await organizationsApi.publicInfo(slug.value)
    if (auth.isAuthenticated) {
      const member = auth.organizations.find((item) => item.slug === org.value?.slug)
      if (member) {
        await auth.switchOrganization(member.id, '/?startDay=1')
        return
      }
    }
  } catch (error) {
    errorMessage.value = getErrorMessage(error)
  } finally {
    loading.value = false
  }
})

const logoSrc = computed(() => assetUrl(org.value?.logoUrl))
const registerTo = computed(() => ({
  name: 'register' as const,
  query: { from: 'invite-preview', org: slug.value },
}))
</script>

<template>
  <div class="relative min-h-svh overflow-hidden bg-background text-foreground">
    <div
      class="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/10 via-background to-background"
      aria-hidden="true"
    />
    <div class="relative mx-auto flex min-h-svh w-full max-w-lg flex-col px-4 py-6 sm:px-6 sm:py-10">
      <header class="flex items-center justify-between gap-3">
        <RouterLink :to="{ name: 'workday-preview' }" class="inline-flex items-center gap-2.5" aria-label="Vector workday">
          <BrandMark class="size-8" />
          <span class="text-lg font-semibold tracking-tight">Vector</span>
        </RouterLink>
        <ThemeSwitch />
      </header>

      <main class="flex flex-1 flex-col justify-center gap-6 py-10">
        <div v-if="loading" class="flex flex-col items-center gap-3 py-10 text-center">
          <LoaderCircle class="size-8 animate-spin text-primary" />
          <p class="font-medium">Loading workspace…</p>
        </div>

        <template v-else-if="org">
          <div class="space-y-3 text-center">
            <OrganizationLogo v-if="logoSrc" :src="logoSrc" :alt="org.name" size="lg" class="mx-auto" />
            <BrandMark v-else class="mx-auto size-12" />
            <h1 class="text-2xl font-semibold tracking-tight">{{ org.name }} runs on Vector</h1>
            <p class="text-sm text-muted-foreground">
              See the daily workday loop — standup, tasks, meetings, messages — then ask an admin for an invite to join.
            </p>
          </div>

          <section class="rounded-2xl border border-primary/20 bg-primary/[0.04] p-4">
            <p class="text-sm font-semibold">Workday loop</p>
            <p class="mt-0.5 text-xs text-muted-foreground">What your team does every morning inside Vector.</p>
            <ol class="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <li v-for="(step, index) in LOOP" :key="step.label" class="rounded-lg border border-border/70 bg-card px-2.5 py-2 text-center">
                <span class="mx-auto flex size-7 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <component :is="step.icon" class="size-3.5" />
                </span>
                <p class="mt-1.5 text-[11px] font-medium tabular-nums text-muted-foreground">{{ index + 1 }}</p>
                <p class="text-[12px] font-semibold">{{ step.label }}</p>
              </li>
            </ol>
          </section>

          <div class="space-y-2">
            <Button variant="brand" class="w-full" size="lg" as-child>
              <RouterLink :to="registerTo">Create your own workspace <ArrowRight /></RouterLink>
            </Button>
            <Button variant="outline" class="w-full" as-child>
              <RouterLink :to="{ name: 'workday-preview', query: { org: org.slug } }">Preview the full workday</RouterLink>
            </Button>
            <p class="text-center text-xs text-muted-foreground">
              Already invited?
              <RouterLink class="font-medium text-foreground underline-offset-2 hover:underline" :to="{ name: 'login' }">Sign in</RouterLink>
            </p>
          </div>
        </template>

        <template v-else>
          <div class="space-y-3 text-center">
            <h1 class="text-2xl font-semibold tracking-tight">Workspace not found</h1>
            <p class="text-sm text-destructive">{{ errorMessage || 'This invite preview link is incomplete or the workspace no longer exists.' }}</p>
            <Button variant="brand" as-child>
              <RouterLink :to="{ name: 'workday-preview' }">See how Vector works <ArrowRight /></RouterLink>
            </Button>
          </div>
        </template>
      </main>
    </div>
  </div>
</template>

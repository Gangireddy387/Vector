<script setup lang="ts">
import { ArrowRight, Copy, LoaderCircle, Mail } from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { toast } from 'vue-sonner'
import BrandMark from '@/components/layout/BrandMark.vue'
import OrganizationLogo from '@/components/common/OrganizationLogo.vue'
import ThemeSwitch from '@/components/layout/ThemeSwitch.vue'
import { Button } from '@/components/ui/button'
import { assetUrl, getErrorMessage } from '@/lib/http'
import { organizationsApi } from '@/modules/auth/auth.api'
import { useAuthStore } from '@/modules/auth/auth.store'
import WorkdayLoopDemo from '../components/WorkdayLoopDemo.vue'

/**
 * Viral invite surface: branded org + workday loop without requiring a token or signup.
 * Real membership still needs an email invite (/accept-invite) or admin add.
 */
const auth = useAuthStore()
const route = useRoute()

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
const askInviteMailto = computed(() => {
  const name = org.value?.name ?? 'the workspace'
  return `mailto:?subject=${encodeURIComponent(`Invite me to ${name} on Vector`)}&body=${encodeURIComponent(
    `Hi,\n\nCould you invite me to ${name} on Vector?\n\nThanks!`,
  )}`
})

async function copyWorkspaceLink() {
  try {
    await navigator.clipboard.writeText(window.location.href)
    toast.success('Workspace link copied')
  } catch {
    toast.error('Could not copy link')
  }
}
</script>

<template>
  <div class="relative min-h-svh overflow-hidden bg-background text-foreground">
    <div
      class="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/10 via-background to-background"
      aria-hidden="true"
      :style="org?.brandColor ? { backgroundImage: `radial-gradient(ellipse at top, ${org.brandColor}22, transparent 60%)` } : undefined"
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
              Try the daily workday loop below, then ask an admin for an invite to join.
            </p>
          </div>

          <WorkdayLoopDemo
            :cta-to="registerTo"
            cta-label="Create your own workspace"
            :brand-color="org.brandColor"
          />

          <div class="space-y-2">
            <Button variant="brand" class="w-full" size="lg" as-child>
              <RouterLink :to="registerTo">Create your own workspace <ArrowRight /></RouterLink>
            </Button>
            <Button variant="outline" class="w-full" as-child>
              <a :href="askInviteMailto"><Mail /> Ask admin for an invite</a>
            </Button>
            <Button variant="ghost" class="w-full" @click="copyWorkspaceLink"><Copy /> Copy workspace link</Button>
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

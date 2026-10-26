<script setup lang="ts">
import { ArrowRight } from 'lucide-vue-next'
import { reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import FormField from '@/components/common/FormField.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getErrorMessage } from '@/lib/http'
import { organizationsApi } from '../auth.api'
import { useAuthStore } from '../auth.store'
import AuthHeading from '../components/AuthHeading.vue'
import PasswordInput from '../components/PasswordInput.vue'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const form = reactive({ email: '', password: '' })
const errorMessage = ref('')
const isSubmitting = ref(false)
const demoEmail = ref<string | null>(null)

/** Seeded demo accounts (see backend seed), one per role, for reviewing the app quickly. */
const DEMO_PASSWORD = 'Password123!'
const DEMO_ACCOUNTS = [
  { email: 'alex@northwind.dev', name: 'Alex', role: 'CEO · organization admin', initials: 'AM', color: '#6366f1' },
  { email: 'priya@northwind.dev', name: 'Priya', role: 'Head of Engineering', initials: 'PS', color: '#ec4899' },
  { email: 'sam@northwind.dev', name: 'Sam', role: 'Frontend team lead', initials: 'SO', color: '#0ea5e9' },
  { email: 'ravi@northwind.dev', name: 'Ravi', role: 'Head of People (HR)', initials: 'RK', color: '#14b8a6' },
]

async function submit() {
  errorMessage.value = ''
  isSubmitting.value = true
  try {
    await auth.login(form)
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/'
    await router.replace(redirect)
  } catch (error) {
    errorMessage.value = getErrorMessage(error)
  } finally {
    isSubmitting.value = false
    demoEmail.value = null
  }
}

/** Arriving from an organization link (example.com/acme/...): say which organization this sign-in opens. */
const targetOrganization = ref<string | null>(null)
const redirectTarget = typeof route.query.redirect === 'string' ? router.resolve(route.query.redirect) : null
const redirectSlug = redirectTarget?.name === 'organization-link' ? String(redirectTarget.params.slug) : undefined
if (redirectSlug) {
  organizationsApi
    .publicInfo(redirectSlug)
    .then((organization) => (targetOrganization.value = organization.name))
    .catch(() => (targetOrganization.value = null))
}

function signInAs(email: string) {
  form.email = email
  form.password = DEMO_PASSWORD
  demoEmail.value = email
  void submit()
}
</script>

<template>
  <AuthHeading
    :title="targetOrganization ? `Sign in to ${targetOrganization}` : 'Sign in to Vector'"
    :description="targetOrganization ? 'Use your Vector account. You will land in this organization.' : 'Welcome back — pick up right where your team left off.'"
  />

  <form class="space-y-4 short:space-y-3" novalidate @submit.prevent="submit">
    <FormField label="Email" for="email">
      <Input id="email" v-model="form.email" type="email" autocomplete="email" placeholder="you@company.com" class="h-11 short:h-10" required />
    </FormField>
    <div class="grid gap-1.5">
      <div class="flex items-center justify-between">
        <label for="password" class="text-sm font-medium">Password</label>
        <RouterLink :to="{ name: 'forgot-password' }" class="text-xs font-medium text-primary hover:underline">Forgot password?</RouterLink>
      </div>
      <PasswordInput id="password" v-model="form.password" autocomplete="current-password" class="h-11 short:h-10" required />
    </div>
    <p v-if="errorMessage" class="bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">{{ errorMessage }}</p>
    <Button type="submit" variant="brand" class="group w-full" size="lg" :loading="isSubmitting && !demoEmail">
      Sign in <ArrowRight class="transition-transform group-hover:translate-x-0.5" />
    </Button>
  </form>

  <div class="my-5 flex items-center gap-3 text-xs text-muted-foreground short:my-3">
    <span class="h-px flex-1 bg-border" /> or explore with a demo account <span class="h-px flex-1 bg-border" />
  </div>

  <div class="grid grid-cols-2 gap-2">
    <button
      v-for="account in DEMO_ACCOUNTS"
      :key="account.email"
      type="button"
      class="flex items-center gap-2.5 border border-border bg-card px-2.5 py-2 text-left transition-all hover:-translate-y-px hover:border-primary/40 hover:shadow-soft disabled:opacity-60 short:py-1.5"
      :disabled="isSubmitting"
      @click="signInAs(account.email)"
    >
      <span
        class="flex size-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white"
        :style="{ backgroundColor: account.color }"
      >
        {{ account.initials }}
      </span>
      <span class="min-w-0">
        <span class="block truncate text-sm font-medium">{{ demoEmail === account.email ? 'Signing in…' : account.name }}</span>
        <span class="block truncate text-[11px] text-muted-foreground">{{ account.role }}</span>
      </span>
    </button>
  </div>

  <p class="mt-6 text-center text-sm text-muted-foreground short:mt-4">
    New to Vector?
    <RouterLink :to="{ name: 'register' }" class="font-medium text-primary hover:underline">Create an account</RouterLink>
  </p>
</template>

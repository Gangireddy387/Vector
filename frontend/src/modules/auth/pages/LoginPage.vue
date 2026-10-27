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
    <Button type="submit" variant="brand" class="group w-full" size="lg" :loading="isSubmitting">
      Sign in <ArrowRight class="transition-transform group-hover:translate-x-0.5" />
    </Button>
  </form>

  <p class="mt-6 text-center text-sm text-muted-foreground short:mt-4">
    New to Vector?
    <RouterLink :to="{ name: 'register' }" class="font-medium text-primary hover:underline">Create an account</RouterLink>
  </p>
</template>

<script setup lang="ts">
import { ArrowRight } from 'lucide-vue-next'
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import FormField from '@/components/common/FormField.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getErrorMessage, isSuperAdminPath } from '@/lib/http'
import { isMfaChallenge, organizationsApi } from '../auth.api'
import { useAuthStore } from '../auth.store'
import AuthHeading from '../components/AuthHeading.vue'
import PasswordInput from '../components/PasswordInput.vue'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const form = reactive({ email: '', password: '' })
const mfaToken = ref<string | null>(null)
const mfaCode = ref('')
const useRecovery = ref(false)
const fieldErrors = ref<Record<string, string>>({})
const errorMessage = ref('')
const isSubmitting = ref(false)

const EMAIL_RE = /^\S+@\S+\.\S+$/
const mfaStep = computed(() => Boolean(mfaToken.value))

function validate() {
  const errors: Record<string, string> = {}
  if (!form.email.trim()) errors.email = 'Enter your email'
  else if (!EMAIL_RE.test(form.email.trim())) errors.email = 'Enter a valid email address'
  if (!form.password) errors.password = 'Enter your password'
  fieldErrors.value = errors
  return !Object.keys(errors).length
}

const canSubmit = computed(() => {
  if (mfaStep.value) {
    if (useRecovery.value) return mfaCode.value.trim().length >= 8 && !isSubmitting.value
    return /^\d{6}$/.test(mfaCode.value.trim()) && !isSubmitting.value
  }
  return EMAIL_RE.test(form.email.trim()) && form.password.length > 0 && !isSubmitting.value
})

watch(
  () => form.email,
  () => {
    if (fieldErrors.value.email) {
      const { email: _, ...rest } = fieldErrors.value
      fieldErrors.value = rest
    }
  },
)
watch(
  () => form.password,
  () => {
    if (fieldErrors.value.password) {
      const { password: _, ...rest } = fieldErrors.value
      fieldErrors.value = rest
    }
  },
)

async function finishSignIn() {
  const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/'
  if (auth.isSuperAdmin && !isSuperAdminPath(window.location.pathname) && !isSuperAdminPath(redirect)) return window.location.replace('/super-admin')
  await router.replace(redirect)
}

async function submit() {
  errorMessage.value = ''
  if (mfaStep.value) {
    isSubmitting.value = true
    try {
      const payload = useRecovery.value
        ? { mfaToken: mfaToken.value!, recoveryCode: mfaCode.value.trim() }
        : { mfaToken: mfaToken.value!, code: mfaCode.value.trim() }
      await auth.verifyMfaLogin(payload)
      await finishSignIn()
    } catch (error) {
      errorMessage.value = getErrorMessage(error)
    } finally {
      isSubmitting.value = false
    }
    return
  }

  if (!validate()) return
  isSubmitting.value = true
  try {
    const result = await auth.login(form)
    if (isMfaChallenge(result)) {
      mfaToken.value = result.mfaToken
      mfaCode.value = ''
      useRecovery.value = false
      return
    }
    await finishSignIn()
  } catch (error) {
    const message = getErrorMessage(error)
    errorMessage.value = /invalid|credential|password|email/i.test(message)
      ? 'Those credentials didn’t match. Check your email and password, or reset your password.'
      : message
  } finally {
    isSubmitting.value = false
  }
}

function backToPassword() {
  mfaToken.value = null
  mfaCode.value = ''
  useRecovery.value = false
  errorMessage.value = ''
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
    :title="mfaStep ? 'Authenticator code' : targetOrganization ? `Sign in to ${targetOrganization}` : 'Sign in to Vector'"
    :description="
      mfaStep
        ? useRecovery
          ? 'Enter one of the recovery codes you saved when you turned on two-factor authentication.'
          : 'Enter the 6-digit code from your authenticator app.'
        : targetOrganization
          ? 'Use your Vector account. You will land in this organization.'
          : 'Welcome back — pick up right where your team left off.'
    "
  />

  <form class="space-y-4 short:space-y-3" novalidate @submit.prevent="submit">
    <template v-if="!mfaStep">
      <FormField label="Email" for="email" :error="fieldErrors.email">
        <Input id="email" v-model="form.email" type="email" autocomplete="email" placeholder="you@company.com" class="h-11 short:h-10" required />
      </FormField>
      <div class="grid gap-1.5">
        <div class="flex items-center justify-between">
          <label for="password" class="text-sm font-medium">Password</label>
          <RouterLink :to="{ name: 'forgot-password' }" class="text-xs font-medium text-primary hover:underline">Forgot password?</RouterLink>
        </div>
        <PasswordInput id="password" v-model="form.password" autocomplete="current-password" class="h-11 short:h-10" required :aria-invalid="Boolean(fieldErrors.password)" />
        <p v-if="fieldErrors.password" class="text-xs text-destructive">{{ fieldErrors.password }}</p>
      </div>
    </template>
    <template v-else>
      <FormField :label="useRecovery ? 'Recovery code' : 'Authentication code'" for="mfa-code">
        <Input
          id="mfa-code"
          v-model="mfaCode"
          :inputmode="useRecovery ? 'text' : 'numeric'"
          :autocomplete="useRecovery ? 'off' : 'one-time-code'"
          :placeholder="useRecovery ? 'XXXX-XXXX-XX' : '123456'"
          class="h-11 short:h-10 tracking-widest"
          autofocus
          required
        />
      </FormField>
      <button type="button" class="text-xs font-medium text-primary hover:underline" @click="useRecovery = !useRecovery">
        {{ useRecovery ? 'Use authenticator code instead' : 'Use a recovery code instead' }}
      </button>
    </template>
    <p v-if="errorMessage" class="bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">{{ errorMessage }}</p>
    <Button type="submit" variant="brand" class="group w-full" size="lg" :loading="isSubmitting" :disabled="!canSubmit">
      {{ mfaStep ? 'Verify and sign in' : 'Sign in' }} <ArrowRight class="transition-transform group-hover:translate-x-0.5" />
    </Button>
    <Button v-if="mfaStep" type="button" variant="ghost" class="w-full" @click="backToPassword">Back</Button>
  </form>

  <p v-if="!mfaStep" class="mt-5 text-center text-sm leading-relaxed text-muted-foreground short:mt-4">
    New to Vector?
    <RouterLink :to="{ name: 'register' }" class="font-medium whitespace-nowrap text-primary hover:underline">Create an account</RouterLink>
  </p>
</template>

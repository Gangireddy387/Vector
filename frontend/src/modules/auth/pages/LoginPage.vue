<script setup lang="ts">
import axios from 'axios'
import { ArrowRight } from 'lucide-vue-next'
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import FormField from '@/components/common/FormField.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getErrorMessage, isSuperAdminPath } from '@/lib/http'
import type { OrganizationSsoSettings } from '@/types/models'
import { authApi, isMfaChallenge, organizationsApi } from '../auth.api'
import { useAuthStore } from '../auth.store'
import AuthHeading from '../components/AuthHeading.vue'
import PasswordInput from '../components/PasswordInput.vue'

type OAuthProvider = 'google' | 'microsoft' | 'oidc'

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
const oauthBusy = ref<OAuthProvider | null>(null)
const oauthProviders = ref({ google: false, microsoft: false, oidc: false })
const orgSso = ref<OrganizationSsoSettings | null>(null)

const EMAIL_RE = /^\S+@\S+\.\S+$/
const mfaStep = computed(() => Boolean(mfaToken.value))
const ssoEnforced = computed(() => Boolean(orgSso.value?.enabled && orgSso.value?.enforce))
const requiredProvider = computed<OAuthProvider | null>(() => {
  if (!ssoEnforced.value) return null
  const provider = orgSso.value?.provider
  if (provider === 'google' || provider === 'microsoft' || provider === 'oidc') return provider
  return 'microsoft'
})
const showPasswordForm = computed(() => !ssoEnforced.value)
const requiredProviderLabel = computed(() => {
  if (requiredProvider.value === 'google') return 'Google'
  if (requiredProvider.value === 'microsoft') return 'Microsoft'
  if (requiredProvider.value === 'oidc') return 'SSO'
  return 'SSO'
})

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
  if (!showPasswordForm.value) return false
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

function ssoDetails(error: unknown): { code?: string; provider?: string; organizationSlug?: string } | null {
  if (!axios.isAxiosError(error)) return null
  const details = error.response?.data?.details
  return details && typeof details === 'object' && !Array.isArray(details) ? (details as { code?: string; provider?: string; organizationSlug?: string }) : null
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
    const sso = ssoDetails(error)
    if (
      sso?.code === 'sso_required' &&
      (sso.provider === 'google' || sso.provider === 'microsoft' || sso.provider === 'oidc')
    ) {
      errorMessage.value = getErrorMessage(error)
      if (sso.provider === 'oidc' ? oauthProviders.value.oidc : oauthProviders.value[sso.provider]) {
        await continueWith(sso.provider, sso.organizationSlug)
      }
      return
    }
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

async function continueWith(provider: OAuthProvider, organizationSlug?: string | null) {
  oauthBusy.value = provider
  errorMessage.value = ''
  try {
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/'
    const slug = organizationSlug || redirectSlug || undefined
    if (provider === 'oidc' && !slug) {
      errorMessage.value = 'Open this organization’s sign-in link to continue with SSO.'
      oauthBusy.value = null
      return
    }
    const { url } = await authApi.startOAuth(provider, {
      redirect,
      organizationSlug: slug,
      microsoftTenant: orgSso.value?.microsoftTenant,
    })
    window.location.assign(url)
  } catch (error) {
    errorMessage.value = getErrorMessage(error)
    oauthBusy.value = null
  }
}

onMounted(async () => {
  const oauthError = typeof route.query.oauthError === 'string' ? route.query.oauthError : null
  const oauthToken = typeof route.query.oauthToken === 'string' ? route.query.oauthToken : null
  const incomingMfa = typeof route.query.mfaToken === 'string' ? route.query.mfaToken : null
  if (oauthError) {
    errorMessage.value = oauthError
    void router.replace({ query: { ...route.query, oauthError: undefined } })
  }
  if (incomingMfa) {
    mfaToken.value = incomingMfa
    void router.replace({ query: { ...route.query, mfaToken: undefined } })
  }
  if (oauthToken) {
    isSubmitting.value = true
    try {
      await auth.acceptOAuthToken(oauthToken)
      await finishSignIn()
    } catch (error) {
      errorMessage.value = getErrorMessage(error)
    } finally {
      isSubmitting.value = false
      void router.replace({ query: { ...route.query, oauthToken: undefined } })
    }
  }
  try {
    oauthProviders.value = await authApi.oauthProviders()
  } catch {
    oauthProviders.value = { google: false, microsoft: false, oidc: false }
  }
})

/** Arriving from an organization link (example.com/acme/...): say which organization this sign-in opens. */
const targetOrganization = ref<string | null>(null)
const redirectTarget = typeof route.query.redirect === 'string' ? router.resolve(route.query.redirect) : null
const redirectSlug = redirectTarget?.name === 'organization-link' ? String(redirectTarget.params.slug) : undefined
if (redirectSlug) {
  organizationsApi
    .publicInfo(redirectSlug)
    .then((organization) => {
      targetOrganization.value = organization.name
      orgSso.value = organization.sso ?? null
    })
    .catch(() => {
      targetOrganization.value = null
      orgSso.value = null
    })
}

const showGoogle = computed(() => {
  if (!oauthProviders.value.google) return false
  if (requiredProvider.value) return requiredProvider.value === 'google'
  return true
})
const showMicrosoft = computed(() => {
  if (!oauthProviders.value.microsoft) return false
  if (requiredProvider.value) return requiredProvider.value === 'microsoft'
  return true
})
const showOidc = computed(() => {
  if (!oauthProviders.value.oidc) return false
  if (requiredProvider.value) return requiredProvider.value === 'oidc'
  return Boolean(orgSso.value?.enabled && orgSso.value?.provider === 'oidc')
})
</script>

<template>
  <AuthHeading
    :title="mfaStep ? 'Authenticator code' : targetOrganization ? `Sign in to ${targetOrganization}` : 'Sign in to Vector'"
    :description="
      mfaStep
        ? useRecovery
          ? 'Enter one of the recovery codes you saved when you turned on two-factor authentication.'
          : 'Enter the 6-digit code from your authenticator app.'
        : ssoEnforced
          ? `This organization requires ${requiredProviderLabel} sign-in.`
          : targetOrganization
            ? 'Use your Vector account. You will land in this organization.'
            : 'Welcome back — pick up right where your team left off.'
    "
  />

  <div v-if="!mfaStep && (showGoogle || showMicrosoft || showOidc)" class="mb-4 space-y-2 short:mb-3">
    <Button
      v-if="showGoogle"
      type="button"
      variant="outline"
      class="w-full"
      size="lg"
      :loading="oauthBusy === 'google'"
      :disabled="Boolean(oauthBusy)"
      @click="continueWith('google')"
    >
      Continue with Google
    </Button>
    <Button
      v-if="showMicrosoft"
      type="button"
      variant="outline"
      class="w-full"
      size="lg"
      :loading="oauthBusy === 'microsoft'"
      :disabled="Boolean(oauthBusy)"
      @click="continueWith('microsoft')"
    >
      Continue with Microsoft
    </Button>
    <Button
      v-if="showOidc"
      type="button"
      variant="outline"
      class="w-full"
      size="lg"
      :loading="oauthBusy === 'oidc'"
      :disabled="Boolean(oauthBusy)"
      @click="continueWith('oidc')"
    >
      Continue with SSO
    </Button>
    <p v-if="showPasswordForm" class="text-center text-xs text-muted-foreground">or use email</p>
  </div>

  <form v-if="mfaStep || showPasswordForm" class="space-y-4 short:space-y-3" novalidate @submit.prevent="submit">
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
    <Button type="submit" variant="brand" class="w-full group" size="lg" :loading="isSubmitting" :disabled="!canSubmit">
      <template v-if="isSubmitting">{{ mfaStep ? 'Verifying…' : 'Signing in…' }}</template>
      <template v-else>
        {{ mfaStep ? 'Verify and sign in' : 'Sign in' }}
        <ArrowRight class="transition-transform group-hover:translate-x-0.5" />
      </template>
    </Button>
    <Button v-if="mfaStep" type="button" variant="ghost" class="w-full" @click="backToPassword">Back</Button>
  </form>

  <p v-else-if="errorMessage" class="bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">{{ errorMessage }}</p>

  <p v-if="!mfaStep && showPasswordForm" class="mt-5 text-center text-sm leading-relaxed text-muted-foreground short:mt-4">
    New to Vector?
    <RouterLink :to="{ name: 'register' }" class="font-medium whitespace-nowrap text-primary hover:underline">Create an account</RouterLink>
  </p>
</template>

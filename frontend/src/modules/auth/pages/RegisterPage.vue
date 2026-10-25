<script setup lang="ts">
import { ArrowLeft, Building2, UserRound } from 'lucide-vue-next'
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import FormField from '@/components/common/FormField.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getErrorMessage, getFieldErrors } from '@/lib/http'
import { useAuthStore } from '../auth.store'
import AuthHeading from '../components/AuthHeading.vue'
import OrganizationFields from '../components/OrganizationFields.vue'
import PasswordInput from '../components/PasswordInput.vue'

const auth = useAuthStore()
const router = useRouter()

const step = ref<1 | 2>(1)
const form = reactive({ name: '', email: '', password: '', organizationName: '', organizationSlug: '' })
const slugAvailable = ref(false)
const fieldErrors = ref<Record<string, string>>({})
const errorMessage = ref('')
const isSubmitting = ref(false)

const ACCOUNT_FIELDS = ['name', 'email', 'password']

/** Quick checks before moving on; the server validates everything again on submit. */
function continueToOrganization() {
  const errors: Record<string, string> = {}
  if (form.name.trim().length < 2) errors.name = 'Name must be at least 2 characters'
  if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) errors.email = 'Enter a valid email address'
  if (form.password.length < 8) errors.password = 'Password must be at least 8 characters'
  fieldErrors.value = errors
  errorMessage.value = ''
  if (Object.keys(errors).length) return
  if (!form.organizationName) {
    const domain = form.email.split('@')[1]?.split('.')[0] ?? ''
    const isPersonal = ['gmail', 'yahoo', 'outlook', 'hotmail', 'icloud', 'proton', 'protonmail', 'live', 'aol'].includes(domain)
    if (domain && !isPersonal) form.organizationName = domain.charAt(0).toUpperCase() + domain.slice(1)
  }
  step.value = 2
}

async function submit() {
  errorMessage.value = ''
  fieldErrors.value = {}
  isSubmitting.value = true
  try {
    await auth.register({ ...form, organizationName: form.organizationName.trim() })
    await router.replace({ name: 'projects', query: { welcome: '1' } })
  } catch (error) {
    fieldErrors.value = getFieldErrors(error)
    errorMessage.value = Object.keys(fieldErrors.value).length ? '' : getErrorMessage(error)
    // An account problem (for example, the email is already registered) belongs on the first step.
    if (ACCOUNT_FIELDS.some((field) => fieldErrors.value[field]) || /email/i.test(errorMessage.value)) step.value = 1
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <AuthHeading
    :title="step === 1 ? 'Create your account' : 'Set up your organization'"
    :description="step === 1 ? 'Start free. You will set up your organization next.' : 'Your team’s own space in Vector, with its own address. You can invite people right after.'"
  />

  <ol class="mb-5 grid grid-cols-2 gap-2 text-xs short:mb-3" aria-label="Signup steps">
    <li
      v-for="(item, index) in [
        { label: 'Your account', icon: UserRound },
        { label: 'Organization', icon: Building2 },
      ]"
      :key="item.label"
      class="flex items-center gap-2 border-t-2 pt-2 font-medium"
      :class="index + 1 <= step ? 'border-primary text-foreground' : 'border-border text-muted-foreground'"
      :aria-current="index + 1 === step ? 'step' : undefined"
    >
      <component :is="item.icon" class="size-3.5" /> {{ index + 1 }}. {{ item.label }}
    </li>
  </ol>

  <form v-if="step === 1" class="space-y-4 short:space-y-3" novalidate @submit.prevent="continueToOrganization">
    <FormField label="Full name" for="name" :error="fieldErrors.name">
      <Input id="name" v-model="form.name" autocomplete="name" placeholder="Jane Doe" required />
    </FormField>
    <FormField label="Work email" for="email" :error="fieldErrors.email">
      <Input id="email" v-model="form.email" type="email" autocomplete="email" placeholder="you@company.com" required />
    </FormField>
    <FormField label="Password" for="password" :error="fieldErrors.password" hint="At least 8 characters.">
      <PasswordInput id="password" v-model="form.password" autocomplete="new-password" required />
    </FormField>
    <p v-if="errorMessage" class="bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">{{ errorMessage }}</p>
    <Button type="submit" variant="brand" class="w-full" size="lg">Continue</Button>
  </form>

  <form v-else class="space-y-4 short:space-y-3" novalidate @submit.prevent="submit">
    <OrganizationFields v-model:name="form.organizationName" v-model:slug="form.organizationSlug" v-model:available="slugAvailable" :errors="fieldErrors" autofocus />
    <p v-if="errorMessage" class="bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">{{ errorMessage }}</p>
    <div class="flex gap-2">
      <Button type="button" variant="outline" size="lg" aria-label="Back to your account" @click="step = 1"><ArrowLeft /></Button>
      <Button
        type="submit"
        variant="brand"
        class="flex-1"
        size="lg"
        :loading="isSubmitting"
        :disabled="form.organizationName.trim().length < 2 || !slugAvailable"
      >
        Create organization
      </Button>
    </div>
    <p class="text-center text-xs text-muted-foreground">
      By creating an account you agree to the
      <RouterLink :to="{ name: 'terms' }" class="font-medium text-foreground underline-offset-2 hover:underline">Terms of Service</RouterLink>
      and
      <RouterLink :to="{ name: 'privacy' }" class="font-medium text-foreground underline-offset-2 hover:underline">Privacy Policy</RouterLink>.
    </p>
  </form>

  <p class="mt-6 text-center text-sm text-muted-foreground short:mt-4">
    Already have an account?
    <RouterLink :to="{ name: 'login' }" class="font-medium text-primary hover:underline">Sign in</RouterLink>
  </p>
</template>

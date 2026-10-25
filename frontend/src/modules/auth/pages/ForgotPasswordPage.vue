<script setup lang="ts">
import { MailCheck } from 'lucide-vue-next'
import { ref } from 'vue'
import FormField from '@/components/common/FormField.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getErrorMessage } from '@/lib/http'
import { authApi } from '../auth.api'
import AuthHeading from '../components/AuthHeading.vue'

const email = ref('')
const isSent = ref(false)
const isSubmitting = ref(false)
const errorMessage = ref('')

async function submit() {
  errorMessage.value = ''
  isSubmitting.value = true
  try {
    await authApi.forgotPassword(email.value)
    isSent.value = true
  } catch (error) {
    errorMessage.value = getErrorMessage(error)
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <template v-if="isSent">
    <div class="mb-6 flex size-12 items-center justify-center bg-success/15 text-success">
      <MailCheck class="size-6" />
    </div>
    <AuthHeading title="Check your inbox" :description="`If an account exists for ${email}, we sent a link to reset your password.`" />
    <Button variant="outline" class="w-full" as-child>
      <RouterLink :to="{ name: 'login' }">Back to sign in</RouterLink>
    </Button>
  </template>
  <template v-else>
    <AuthHeading title="Forgot your password?" description="Enter your email and we will send you a reset link." />
    <form class="space-y-4" novalidate @submit.prevent="submit">
      <FormField label="Email" for="email">
        <Input id="email" v-model="email" type="email" autocomplete="email" placeholder="you@company.com" required />
      </FormField>
      <p v-if="errorMessage" class=" bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">{{ errorMessage }}</p>
      <Button type="submit" variant="brand" class="w-full" size="lg" :loading="isSubmitting">Send reset link</Button>
    </form>
    <p class="mt-6 text-center text-sm">
      <RouterLink :to="{ name: 'login' }" class="text-primary hover:underline">Back to sign in</RouterLink>
    </p>
  </template>
</template>

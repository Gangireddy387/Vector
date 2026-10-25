<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import FormField from '@/components/common/FormField.vue'
import { Button } from '@/components/ui/button'
import { getErrorMessage } from '@/lib/http'
import { useAuthStore } from '../auth.store'
import AuthHeading from '../components/AuthHeading.vue'
import PasswordInput from '../components/PasswordInput.vue'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const token = computed(() => (typeof route.query.token === 'string' ? route.query.token : ''))
const password = ref('')
const confirmation = ref('')
const errorMessage = ref('')
const isSubmitting = ref(false)

async function submit() {
  errorMessage.value = ''
  if (password.value !== confirmation.value) {
    errorMessage.value = 'Passwords do not match'
    return
  }
  isSubmitting.value = true
  try {
    await auth.resetPassword({ token: token.value, password: password.value })
    await router.replace({ name: 'home' })
  } catch (error) {
    errorMessage.value = getErrorMessage(error)
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <AuthHeading title="Choose a new password" description="Use at least 8 characters." />
  <p v-if="!token" class=" bg-destructive/10 px-3 py-2 text-sm text-destructive">This reset link is incomplete. Request a new one.</p>
  <form v-else class="space-y-4" novalidate @submit.prevent="submit">
    <FormField label="New password" for="password">
      <PasswordInput id="password" v-model="password" autocomplete="new-password" required />
    </FormField>
    <FormField label="Confirm password" for="confirmation">
      <PasswordInput id="confirmation" v-model="confirmation" autocomplete="new-password" required />
    </FormField>
    <p v-if="errorMessage" class=" bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">{{ errorMessage }}</p>
    <Button type="submit" variant="brand" class="w-full" size="lg" :loading="isSubmitting">Update password</Button>
  </form>
</template>

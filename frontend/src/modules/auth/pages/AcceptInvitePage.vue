<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import FormField from '@/components/common/FormField.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getErrorMessage } from '@/lib/http'
import { useAuthStore } from '../auth.store'
import AuthHeading from '../components/AuthHeading.vue'
import PasswordInput from '../components/PasswordInput.vue'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const token = computed(() => (typeof route.query.token === 'string' ? route.query.token : ''))
const form = reactive({ name: '', password: '' })
const errorMessage = ref('')
const isSubmitting = ref(false)

async function submit() {
  errorMessage.value = ''
  isSubmitting.value = true
  try {
    await auth.acceptInvite({ token: token.value, ...form })
    await router.replace({ name: 'projects' })
  } catch (error) {
    errorMessage.value = getErrorMessage(error)
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <AuthHeading title="Join your team" description="Finish setting up your account to start collaborating." />
  <p v-if="!token" class=" bg-destructive/10 px-3 py-2 text-sm text-destructive">This invitation link is incomplete.</p>
  <form v-else class="space-y-4" novalidate @submit.prevent="submit">
    <FormField label="Full name" for="name">
      <Input id="name" v-model="form.name" autocomplete="name" required />
    </FormField>
    <FormField label="Password" for="password" hint="At least 8 characters.">
      <PasswordInput id="password" v-model="form.password" autocomplete="new-password" required />
    </FormField>
    <p v-if="errorMessage" class=" bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">{{ errorMessage }}</p>
    <Button type="submit" variant="brand" class="w-full" size="lg" :loading="isSubmitting">Join workspace</Button>
    <p class="text-center text-xs text-muted-foreground">
      By joining you agree to the
      <RouterLink :to="{ name: 'terms' }" class="font-medium text-foreground underline-offset-2 hover:underline">Terms of Service</RouterLink>
      and
      <RouterLink :to="{ name: 'privacy' }" class="font-medium text-foreground underline-offset-2 hover:underline">Privacy Policy</RouterLink>.
    </p>
  </form>
</template>

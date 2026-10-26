<script setup lang="ts">
import { ArrowLeft, LogOut } from 'lucide-vue-next'
import { computed, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Button } from '@/components/ui/button'
import { getErrorMessage, getFieldErrors } from '@/lib/http'
import { useAuthStore } from '../auth.store'
import AuthHeading from '../components/AuthHeading.vue'
import OrganizationFields from '../components/OrganizationFields.vue'

/** Creates another organization, or the first one for people who are not in any (for example after removal). */
const auth = useAuthStore()
const router = useRouter()

const form = reactive({ name: '', slug: '' })
const slugAvailable = ref(false)
const fieldErrors = ref<Record<string, string>>({})
const errorMessage = ref('')
const isSubmitting = ref(false)
const hasOrganization = computed(() => Boolean(auth.organization))

async function submit() {
  errorMessage.value = ''
  fieldErrors.value = {}
  isSubmitting.value = true
  try {
    await auth.createOrganization({ name: form.name.trim(), slug: form.slug })
  } catch (error) {
    fieldErrors.value = getFieldErrors(error)
    errorMessage.value = Object.keys(fieldErrors.value).length ? '' : getErrorMessage(error)
    isSubmitting.value = false
  }
}

function signOut() {
  void auth.logout()
}
</script>

<template>
  <AuthHeading
    :title="hasOrganization ? 'Create an organization' : 'Create your organization'"
    :description="
      hasOrganization
        ? 'A separate space with its own people, projects and settings. You will be its admin.'
        : 'You are not part of any organization yet. Create one for your team, or ask an admin to invite you.'
    "
  />
  <form class="space-y-4 short:space-y-3" novalidate @submit.prevent="submit">
    <OrganizationFields v-model:name="form.name" v-model:slug="form.slug" v-model:available="slugAvailable" :errors="fieldErrors" autofocus />
    <p v-if="errorMessage" class="bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">{{ errorMessage }}</p>
    <Button type="submit" variant="brand" class="w-full" size="lg" :loading="isSubmitting" :disabled="form.name.trim().length < 2 || !slugAvailable">
      Create organization
    </Button>
  </form>
  <div class="mt-6 flex justify-center short:mt-4">
    <Button v-if="hasOrganization" variant="ghost" size="sm" @click="router.back()"><ArrowLeft /> Back to {{ auth.organization?.name }}</Button>
    <Button v-else variant="ghost" size="sm" @click="signOut"><LogOut /> Sign out ({{ auth.user?.email }})</Button>
  </div>
</template>

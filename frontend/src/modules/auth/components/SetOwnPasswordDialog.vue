<script setup lang="ts">
import { KeyRound } from 'lucide-vue-next'
import { computed, reactive, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import FormField from '@/components/common/FormField.vue'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { getErrorMessage, getFieldErrors } from '@/lib/http'
import { useAuthStore } from '../auth.store'
import PasswordInput from './PasswordInput.vue'

/**
 * People who joined through a one-click invitation are signed in with a temporary password. Before they start, they
 * choose their own (and can fix the name taken from their email). It cannot be dismissed while the temporary one is
 * still in use; signing out is the only other way.
 */
const auth = useAuthStore()
const isOpen = computed(() => Boolean(auth.user?.mustChangePassword))

const form = reactive({ name: '', password: '', confirm: '' })
const errors = ref<Record<string, string>>({})
const isSaving = ref(false)
watch(isOpen, (open) => open && (form.name = auth.user?.name ?? ''), { immediate: true })

async function save() {
  errors.value = {}
  if (form.name.trim().length < 2) errors.value.name = 'Name must be at least 2 characters'
  if (form.password.length < 8) errors.value.newPassword = 'Password must be at least 8 characters'
  else if (form.password !== form.confirm) errors.value.confirm = 'The two passwords do not match'
  if (Object.keys(errors.value).length) return
  isSaving.value = true
  try {
    if (form.name.trim() !== auth.user?.name) await auth.updateProfile({ name: form.name.trim() })
    await auth.changePassword({ newPassword: form.password })
    toast.success('You’re all set', { description: 'Hit Start my day on Home — your workday loop is ready.' })
  } catch (error) {
    errors.value = getFieldErrors(error)
    if (!Object.keys(errors.value).length) toast.error(getErrorMessage(error))
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <Dialog :open="isOpen">
    <DialogContent class="sm:max-w-md" hide-close @escape-key-down.prevent>
      <DialogHeader>
        <span class="mb-1 flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><KeyRound class="size-5" /></span>
        <DialogTitle>Choose your own password</DialogTitle>
        <DialogDescription>
          You’re signed in with a temporary password. Pick your own, then Start my day on Home — standup, tasks, meetings, messages.
        </DialogDescription>
      </DialogHeader>
      <form class="space-y-4" novalidate @submit.prevent="save">
        <FormField label="Your name" for="own-name" :error="errors.name" hint="How your teammates see you.">
          <Input id="own-name" v-model="form.name" autocomplete="name" maxlength="120" />
        </FormField>
        <FormField label="New password" for="own-password" :error="errors.newPassword" hint="At least 8 characters.">
          <PasswordInput id="own-password" v-model="form.password" autocomplete="new-password" />
        </FormField>
        <FormField label="Repeat new password" for="own-password-confirm" :error="errors.confirm">
          <PasswordInput id="own-password-confirm" v-model="form.confirm" autocomplete="new-password" />
        </FormField>
        <Button type="submit" variant="brand" class="w-full" size="lg" :loading="isSaving">Save and Start my day</Button>
        <button type="button" class="w-full text-center text-xs text-muted-foreground underline-offset-2 hover:underline" @click="auth.logout()">Sign out instead</button>
      </form>
    </DialogContent>
  </Dialog>
</template>

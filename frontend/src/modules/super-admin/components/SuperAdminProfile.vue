<script setup lang="ts">
import { Monitor, Moon, Sun } from 'lucide-vue-next'
import { reactive, ref } from 'vue'
import { toast } from 'vue-sonner'
import FormField from '@/components/common/FormField.vue'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { type ThemePreference, useTheme } from '@/composables/useTheme'
import { getErrorMessage } from '@/lib/http'
import { useAuthStore } from '@/modules/auth/auth.store'
import ProfilePhotoField from '@/modules/settings/components/ProfilePhotoField.vue'

/** The super admin's own profile: how organizations see them in support chats and reviews. */
const auth = useAuthStore()
const form = reactive({
  name: auth.user?.name ?? '',
  avatarColor: auth.user?.avatarColor ?? '#6366f1',
})
const isSaving = ref(false)

const { preference } = useTheme()
const THEMES: Array<{ value: ThemePreference; label: string; icon: typeof Sun }> = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'auto', label: 'System', icon: Monitor },
]

async function save() {
  const name = form.name.trim()
  if (name.length < 2) return toast.error('Use at least 2 characters for your name')
  isSaving.value = true
  try {
    await auth.updateProfile({ name, avatarColor: form.avatarColor })
    toast.success('Profile updated', { description: 'Organizations see your new name and photo in the Vector team chat.' })
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle>Your profile</CardTitle>
      <CardDescription>Your photo and name appear to organization admins in the Vector team chat and on your reviews.</CardDescription>
    </CardHeader>
    <CardContent>
      <form class="space-y-5" @submit.prevent="save">
        <ProfilePhotoField v-model:color="form.avatarColor" :preview-name="form.name" />
        <div class="grid gap-3 sm:grid-cols-2">
          <FormField label="Full name" for="super-admin-name">
            <Input id="super-admin-name" v-model="form.name" maxlength="120" required />
          </FormField>
          <FormField label="Email" for="super-admin-email">
            <Input id="super-admin-email" :model-value="auth.user?.email" disabled />
          </FormField>
        </div>
        <Button type="submit" variant="brand" :loading="isSaving">Save profile</Button>
      </form>
    </CardContent>
  </Card>

  <Card class="mt-4">
    <CardHeader>
      <CardTitle>Appearance</CardTitle>
      <CardDescription>Light, dark, or follow your device. Saved on this device.</CardDescription>
    </CardHeader>
    <CardContent>
      <div class="grid max-w-xl grid-cols-3 gap-2" role="radiogroup" aria-label="Colour mode">
        <button
          v-for="option in THEMES"
          :key="option.value"
          type="button"
          role="radio"
          :aria-checked="preference === option.value"
          class="flex flex-col items-center gap-2 border p-3 text-sm transition-all"
          :class="preference === option.value ? 'border-primary bg-primary/5 ring-4 ring-primary/10' : 'border-border/70 hover:border-primary/30 hover:bg-accent/40'"
          @click="preference = option.value"
        >
          <component :is="option.icon" class="size-5" /> {{ option.label }}
        </button>
      </div>
    </CardContent>
  </Card>
</template>

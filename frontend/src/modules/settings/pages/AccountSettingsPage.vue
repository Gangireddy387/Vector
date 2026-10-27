<script setup lang="ts">
import { Download, Monitor, Moon, Sun } from 'lucide-vue-next'
import { reactive, ref } from 'vue'
import { toast } from 'vue-sonner'
import FormField from '@/components/common/FormField.vue'
import PageHeader from '@/components/common/PageHeader.vue'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { useDevice } from '@/composables/useDevice'
import { usePwaInstall } from '@/composables/usePwaInstall'
import { type ThemePreference, useTheme } from '@/composables/useTheme'
import { getErrorMessage } from '@/lib/http'
import { authApi } from '@/modules/auth/auth.api'
import { useAuthStore } from '@/modules/auth/auth.store'
import PasswordInput from '@/modules/auth/components/PasswordInput.vue'
import ProfilePhotoField from '../components/ProfilePhotoField.vue'
import SkillsInput from '../components/SkillsInput.vue'
import TimezoneField from '../components/TimezoneField.vue'

const auth = useAuthStore()
const { isDesktop, isStandalone } = useDevice()
const { preference, isPersonal, followOrganization } = useTheme()
const ORG_MODE_LABEL = { light: 'light', dark: 'dark', system: 'system' } as const

const { canInstall, install } = usePwaInstall()

const profile = reactive({
  name: auth.user?.name ?? '',
  title: auth.user?.title ?? '',
  avatarColor: auth.user?.avatarColor ?? '#6366f1',
  about: auth.user?.about ?? '',
  location: auth.user?.location ?? '',
  phone: auth.user?.phone ?? '',
  skills: [...(auth.user?.skills ?? [])],
})
const ABOUT_LIMIT = 1000
const passwords = reactive({ currentPassword: '', newPassword: '' })
const isSavingProfile = ref(false)
const isSavingPassword = ref(false)

const THEMES: Array<{ value: ThemePreference; label: string; icon: typeof Sun }> = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'auto', label: 'System', icon: Monitor },
]

async function saveProfile() {
  isSavingProfile.value = true
  try {
    await auth.updateProfile({
      ...profile,
      title: profile.title.trim() || null,
      about: profile.about.trim() || null,
      location: profile.location.trim() || null,
      phone: profile.phone.trim() || null,
    })
    toast.success('Profile updated')
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    isSavingProfile.value = false
  }
}

async function setPreference(key: 'emailNotifications' | 'dailyDigest', value: boolean) {
  try {
    await auth.updateProfile({ preferences: { [key]: value } })
  } catch (error) {
    toast.error(getErrorMessage(error))
  }
}

async function changePassword() {
  isSavingPassword.value = true
  try {
    await authApi.changePassword(passwords)
    passwords.currentPassword = ''
    passwords.newPassword = ''
    toast.success('Password changed')
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    isSavingPassword.value = false
  }
}
</script>

<template>
  <div class="w-full space-y-4" :class="isDesktop ? 'p-5' : 'p-3'">
    <PageHeader v-if="isDesktop" title="Settings" description="Your profile, notifications and preferences." />

    <div class="grid items-start gap-4 xl:grid-cols-2">
      <div class="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
            <CardDescription>How teammates see you.</CardDescription>
          </CardHeader>
          <CardContent>
            <form class="space-y-4" @submit.prevent="saveProfile">
              <ProfilePhotoField v-model:color="profile.avatarColor" :preview-name="profile.name" />
              <div class="grid gap-3 sm:grid-cols-2">
                <FormField label="Full name" for="profile-name"><Input id="profile-name" v-model="profile.name" required /></FormField>
                <FormField label="Job title" for="profile-title" optional><Input id="profile-title" v-model="profile.title" placeholder="e.g. Product Designer" /></FormField>
                <FormField label="Email" for="profile-email" class="sm:col-span-2">
                  <Input id="profile-email" :model-value="auth.user?.email" disabled />
                </FormField>
                <FormField label="Location" for="profile-location" optional>
                  <Input id="profile-location" v-model="profile.location" placeholder="e.g. Hyderabad, India" maxlength="100" />
                </FormField>
                <FormField label="Phone" for="profile-phone" optional>
                  <Input id="profile-phone" v-model="profile.phone" type="tel" placeholder="e.g. +91 98765 43210" maxlength="40" />
                </FormField>
                <FormField
                  label="About"
                  for="profile-about"
                  optional
                  class="sm:col-span-2"
                  :hint="`What you work on and what people can come to you for · ${profile.about.length}/${ABOUT_LIMIT}`"
                >
                  <Textarea
                    id="profile-about"
                    v-model="profile.about"
                    rows="4"
                    :maxlength="ABOUT_LIMIT"
                    placeholder="e.g. Frontend engineer focused on the mobile app. Ask me about Vue, accessibility and design systems."
                  />
                </FormField>
                <FormField label="Skills" for="profile-skills" optional class="sm:col-span-2" hint="Up to 15. Shown on your profile.">
                  <SkillsInput id="profile-skills" v-model="profile.skills" />
                </FormField>
              </div>
              <Button type="submit" :loading="isSavingProfile">Save profile</Button>
            </form>
            <TimezoneField class="mt-5" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Password</CardTitle></CardHeader>
          <CardContent>
            <form class="grid gap-3 sm:grid-cols-2" @submit.prevent="changePassword">
              <FormField label="Current password" for="current-password">
                <PasswordInput id="current-password" v-model="passwords.currentPassword" autocomplete="current-password" required />
              </FormField>
              <FormField label="New password" for="new-password" hint="At least 8 characters.">
                <PasswordInput id="new-password" v-model="passwords.newPassword" autocomplete="new-password" required />
              </FormField>
              <div class="sm:col-span-2"><Button type="submit" variant="outline" :loading="isSavingPassword">Change password</Button></div>
            </form>
          </CardContent>
        </Card>
      </div>

      <div class="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Notifications</CardTitle>
            <CardDescription>In-app notifications are always on. Choose what reaches your inbox.</CardDescription>
          </CardHeader>
          <CardContent class="space-y-4">
            <label class="flex items-start justify-between gap-4">
              <span>
                <span class="block text-sm font-medium">Email notifications</span>
                <span class="block text-xs text-muted-foreground">Assignments, mentions, due-date reminders and completed work you watch.</span>
              </span>
              <Switch :model-value="auth.user?.preferences.emailNotifications ?? true" @update:model-value="(value: boolean) => setPreference('emailNotifications', value)" />
            </label>
            <label class="flex items-start justify-between gap-4">
              <span>
                <span class="block text-sm font-medium">Daily digest</span>
                <span class="block text-xs text-muted-foreground">A short 8:00 email with what is overdue, due today and coming up.</span>
              </span>
              <Switch :model-value="auth.user?.preferences.dailyDigest ?? false" @update:model-value="(value: boolean) => setPreference('dailyDigest', value)" />
            </label>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Appearance</CardTitle>
            <CardDescription>Light, dark, or follow your device. Saved on this device and kept even when your organization changes its default.</CardDescription>
          </CardHeader>
          <CardContent class="space-y-3">
            <div class="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Colour mode">
              <button
                v-for="theme in THEMES"
                :key="theme.value"
                type="button"
                role="radio"
                :aria-checked="preference === theme.value"
                class="flex flex-col items-center gap-2 border p-3 text-sm transition-all"
                :class="preference === theme.value ? 'border-primary bg-primary/5 ring-4 ring-primary/10' : 'border-border/70 hover:border-primary/30 hover:bg-accent/40'"
                @click="preference = theme.value"
              >
                <component :is="theme.icon" class="size-5" /> {{ theme.label }}
              </button>
            </div>
            <div v-if="auth.organization" class="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <template v-if="isPersonal">
                <span class="min-w-0 flex-1">Your own choice. {{ auth.organization.name }}’s default is {{ ORG_MODE_LABEL[auth.organization.defaultMode] }}.</span>
                <Button variant="link" size="xs" class="h-auto p-0" @click="followOrganization(auth.organization.defaultMode)">Use the organization default</Button>
              </template>
              <span v-else>Following {{ auth.organization.name }}’s default ({{ ORG_MODE_LABEL[auth.organization.defaultMode] }}). Pick one above to make it your own.</span>
            </div>
          </CardContent>
        </Card>

        <Card v-if="canInstall || !isStandalone">
          <CardHeader>
            <CardTitle>Install the app</CardTitle>
            <CardDescription>
              Add Vector to your home screen or desktop for a full-screen, app-like experience.
              <template v-if="!canInstall"> On iPhone and iPad: tap Share → “Add to Home Screen”.</template>
            </CardDescription>
          </CardHeader>
          <CardContent v-if="canInstall">
            <Button @click="install"><Download /> Install Vector</Button>
          </CardContent>
        </Card>
      </div>
    </div>
  </div>
</template>

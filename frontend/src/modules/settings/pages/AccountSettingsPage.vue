<script setup lang="ts">
import { Bell, CalendarDays, Download, KeyRound, Monitor, Moon, Palette, Sun, SunDim, Trash2, UserRound, Volume2 } from 'lucide-vue-next'
import { computed, reactive, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import FormField from '@/components/common/FormField.vue'
import PageFrame from '@/components/common/PageFrame.vue'
import PageHeader from '@/components/common/PageHeader.vue'
import SettingsLayout, { type SettingsSection } from '@/components/common/SettingsLayout.vue'
import Toolbar from '@/components/common/Toolbar.vue'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
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
import PushPrompt from '@/modules/meetings/components/PushPrompt.vue'
import ApiTokensCard from '../components/ApiTokensCard.vue'
import CalendarConnectionsCard from '../components/CalendarConnectionsCard.vue'
import IntegrationsHealthCard from '../components/IntegrationsHealthCard.vue'
import MfaSettingsCard from '../components/MfaSettingsCard.vue'
import ProfilePhotoField from '../components/ProfilePhotoField.vue'
import EmailEntitlementsCard from '../components/EmailEntitlementsCard.vue'
import QuietHoursCard from '../components/QuietHoursCard.vue'
import SoundSettingsCard from '../components/SoundSettingsCard.vue'
import SkillsInput from '../components/SkillsInput.vue'
import TimezoneField from '../components/TimezoneField.vue'

const auth = useAuthStore()
const { isDesktop, isStandalone } = useDevice()
const { preference, isPersonal, followOrganization } = useTheme()
const ORG_MODE_LABEL = { light: 'light', dark: 'dark', system: 'system' } as const
const route = useRoute()
const router = useRouter()

const { canInstall, install } = usePwaInstall()
/** Show the Safari “Add to Home Screen” tip only on Apple devices when the install prompt is unavailable. */
const isAppleHint = /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent) && /Safari/.test(navigator.userAgent)

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
const passwords = reactive({ currentPassword: '', newPassword: '', confirmPassword: '' })
const isSavingProfile = ref(false)
const isSavingPassword = ref(false)
const hasPassword = computed(() => Boolean(auth.user?.hasPassword ?? auth.user?.authProviders?.password))

const THEMES: Array<{ value: ThemePreference; label: string; hint: string; icon: typeof Sun }> = [
  { value: 'light', label: 'Light', hint: 'Bright and clean', icon: Sun },
  { value: 'dim', label: 'Dim', hint: 'Soft blue-grey', icon: SunDim },
  { value: 'dark', label: 'Dark', hint: 'Easy on the eyes', icon: Moon },
  { value: 'auto', label: 'System', hint: 'Match this device', icon: Monitor },
]

const SECTIONS: SettingsSection[] = [
  { value: 'profile', label: 'Profile', icon: UserRound },
  { value: 'security', label: 'Security', icon: KeyRound },
  { value: 'notifications', label: 'Notifications', icon: Bell },
  { value: 'sounds', label: 'Sounds', icon: Volume2 },
  { value: 'calendar', label: 'Calendar', icon: CalendarDays },
  { value: 'appearance', label: 'Appearance', icon: Palette },
  { value: 'data', label: 'Your data', icon: Download },
]

/** Open calendar when returning from OAuth; otherwise honour ?tab=. */
const activeSection = computed({
  get: () => {
    if (route.query.calendar) return 'calendar'
    return SECTIONS.some((section) => section.value === route.query.tab) ? String(route.query.tab) : 'profile'
  },
  set: (tab: string) => {
    const query = { ...route.query, tab: tab === 'profile' ? undefined : tab } as Record<
      string,
      string | string[] | null | undefined
    >
    if (tab !== 'calendar') delete query.calendar
    void router.replace({ query })
  },
})

type PrefKey = 'emailNotifications' | 'dailyDigest' | 'weeklyReportsEmail' | 'pushEnabled'

const NOTIFICATION_PREFS: Array<{
  key: PrefKey
  title: string
  description: string
  /** Plan feature that must be on for this toggle to send mail. */
  planKey?: 'emailNotifications' | 'emailDigest' | 'reports'
}> = [
  {
    key: 'emailNotifications',
    title: 'Email notifications',
    description: 'Assignments, mentions, due-date reminders and completed work you watch.',
    planKey: 'emailNotifications',
  },
  {
    key: 'pushEnabled',
    title: 'Push notifications',
    description: 'Mentions, standups, due dates and similar alerts on this device when Vector is closed.',
  },
  {
    key: 'dailyDigest',
    title: 'Daily digest',
    description: 'A short 8:00 email with what is overdue, due today and coming up.',
    planKey: 'emailDigest',
  },
  {
    key: 'weeklyReportsEmail',
    title: 'Weekly reports email',
    description: 'A Monday morning overview of open work, completions and overdue tasks.',
    planKey: 'reports',
  },
]

function prefLocked(item: (typeof NOTIFICATION_PREFS)[number]) {
  if (!item.planKey) return false
  if (item.planKey === 'emailNotifications') {
    return !auth.hasFeature('emailNotifications') && !auth.hasFeature('emailReminders')
  }
  return !auth.hasFeature(item.planKey)
}

const planSettingsLink = computed(() =>
  auth.isOrganizationAdmin
    ? { name: 'workspace-admin' as const, query: { tab: 'plan' } }
    : { name: 'org-plan' as const },
)

const isExporting = ref(false)
const isDeleteOpen = ref(false)
const deletePassword = ref('')
const deleteEmail = ref('')
const isDeleting = ref(false)
const isRevokingSessions = ref(false)
const canConfirmDelete = computed(() =>
  hasPassword.value ? Boolean(deletePassword.value) : deleteEmail.value.trim().toLowerCase() === (auth.user?.email ?? '').toLowerCase(),
)

async function revokeSessions() {
  isRevokingSessions.value = true
  try {
    await auth.revokeOtherSessions()
    toast.success('Other sessions signed out', { description: 'This device stays signed in.' })
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    isRevokingSessions.value = false
  }
}

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

async function setPreference(key: 'emailNotifications' | 'dailyDigest' | 'weeklyReportsEmail' | 'pushEnabled', value: boolean) {
  try {
    await auth.updateProfile({ preferences: { [key]: value } })
    toast.success(value ? 'Preference saved' : 'Preference turned off')
  } catch (error) {
    toast.error(getErrorMessage(error))
  }
}

async function exportData() {
  isExporting.value = true
  try {
    await authApi.exportAccount()
    toast.success('Export downloaded')
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    isExporting.value = false
  }
}

async function deleteAccount() {
  isDeleting.value = true
  try {
    await authApi.deleteAccount(
      hasPassword.value ? { password: deletePassword.value } : { confirmEmail: deleteEmail.value.trim() },
    )
    toast.success('Account deleted')
    await auth.logout()
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    isDeleting.value = false
  }
}

async function changePassword() {
  const settingFirstPassword = !hasPassword.value
  if (settingFirstPassword && passwords.newPassword !== passwords.confirmPassword) {
    toast.error('The two passwords do not match')
    return
  }
  isSavingPassword.value = true
  try {
    await auth.changePassword(
      settingFirstPassword
        ? { newPassword: passwords.newPassword }
        : { currentPassword: passwords.currentPassword, newPassword: passwords.newPassword },
    )
    passwords.currentPassword = ''
    passwords.newPassword = ''
    passwords.confirmPassword = ''
    toast.success(settingFirstPassword ? 'Password set' : 'Password changed', {
      description: settingFirstPassword
        ? 'You can sign in with email and this password as well as Google/Microsoft.'
        : 'You were signed out on your other devices.',
    })
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    isSavingPassword.value = false
  }
}

function onDeleteDialogOpen(open: boolean) {
  isDeleteOpen.value = open
  if (!open) {
    deletePassword.value = ''
    deleteEmail.value = ''
  }
}

function preferenceValue(key: (typeof NOTIFICATION_PREFS)[number]['key']) {
  const defaults = { emailNotifications: true, pushEnabled: true, dailyDigest: false, weeklyReportsEmail: false }
  return auth.user?.preferences[key] ?? defaults[key]
}
</script>

<template>
  <PageFrame gap="compact" pad="compact">
    <PageHeader v-if="isDesktop" title="Settings" description="Your profile, notifications and preferences." />

    <SettingsLayout v-model="activeSection" :sections="SECTIONS" aria-label="Account settings">
      <template #profile>
        <div class="w-full space-y-3">
          <Card class="gap-3">
            <CardHeader class="border-b border-border/60 pb-3">
              <CardTitle>Profile</CardTitle>
              <CardDescription>How teammates see you across projects and messages.</CardDescription>
            </CardHeader>
            <CardContent>
              <form class="space-y-4" @submit.prevent="saveProfile">
                <div class="rounded-xl border border-border/70 bg-muted/25 p-3">
                  <ProfilePhotoField v-model:color="profile.avatarColor" :preview-name="profile.name" />
                </div>

                <div class="grid gap-3 sm:grid-cols-2">
                  <FormField label="Full name" for="profile-name">
                    <Input id="profile-name" v-model="profile.name" required />
                  </FormField>
                  <FormField label="Job title" for="profile-title" optional>
                    <Input id="profile-title" v-model="profile.title" placeholder="e.g. Product Designer" />
                  </FormField>
                  <FormField
                    label="Email"
                    for="profile-email"
                    hint="Sign-in email can’t be changed here. Ask an organization admin if you need it updated."
                  >
                    <Input id="profile-email" :model-value="auth.user?.email" disabled />
                  </FormField>
                  <FormField label="Phone" for="profile-phone" optional>
                    <Input id="profile-phone" v-model="profile.phone" type="tel" placeholder="e.g. +91 98765 43210" maxlength="40" />
                  </FormField>
                  <FormField label="Location" for="profile-location" optional class="sm:col-span-2">
                    <Input id="profile-location" v-model="profile.location" placeholder="e.g. Hyderabad, India" maxlength="100" />
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
                      rows="3"
                      :maxlength="ABOUT_LIMIT"
                      placeholder="e.g. Frontend engineer focused on the mobile app. Ask me about Vue, accessibility and design systems."
                    />
                  </FormField>
                  <FormField label="Skills" for="profile-skills" optional class="sm:col-span-2" hint="Up to 15. Shown on your profile.">
                    <SkillsInput id="profile-skills" v-model="profile.skills" />
                  </FormField>
                </div>

                <TimezoneField />

                <Toolbar variant="footer" class="border-t border-border/60 pt-3">
                  <Button type="submit" :loading="isSavingProfile">Save profile</Button>
                </Toolbar>
              </form>
            </CardContent>
          </Card>
        </div>
      </template>

      <template #security>
        <div class="w-full space-y-3">
          <div
            v-if="auth.user?.mfaSetupRequired"
            class="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3.5 py-3 text-sm text-amber-950 dark:text-amber-100"
            role="status"
          >
            {{ auth.organization?.name ?? 'This organization' }} requires two-factor authentication. Turn it on below to keep using Vector here.
          </div>
          <Card class="gap-3">
            <CardHeader class="border-b border-border/60 pb-3">
              <CardTitle>{{ hasPassword ? 'Password' : 'Set a password' }}</CardTitle>
              <CardDescription>
                <template v-if="hasPassword">Change the password used to sign in to your account.</template>
                <template v-else>
                  You signed in with Google or Microsoft. Optionally set a password so you can also sign in with email.
                </template>
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form class="grid gap-3 sm:grid-cols-2" @submit.prevent="changePassword">
                <FormField v-if="hasPassword" label="Current password" for="current-password">
                  <PasswordInput id="current-password" v-model="passwords.currentPassword" autocomplete="current-password" required />
                </FormField>
                <FormField :label="hasPassword ? 'New password' : 'Password'" for="new-password" hint="At least 8 characters.">
                  <PasswordInput id="new-password" v-model="passwords.newPassword" autocomplete="new-password" required />
                </FormField>
                <FormField v-if="!hasPassword" label="Repeat password" for="confirm-password">
                  <PasswordInput id="confirm-password" v-model="passwords.confirmPassword" autocomplete="new-password" required />
                </FormField>
                <Toolbar variant="footer" class="sm:col-span-2">
                  <Button type="submit" variant="outline" :loading="isSavingPassword">
                    {{ hasPassword ? 'Change password' : 'Set password' }}
                  </Button>
                </Toolbar>
              </form>
            </CardContent>
          </Card>

          <MfaSettingsCard />
          <ApiTokensCard />

          <Card class="gap-3">
            <CardHeader class="border-b border-border/60 pb-3">
              <CardTitle>Sessions</CardTitle>
              <CardDescription>
                Sign out every other browser or device using your account. This device stays signed in. Vector does not list device names yet.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" :loading="isRevokingSessions" @click="revokeSessions">Sign out other sessions</Button>
            </CardContent>
          </Card>
        </div>
      </template>

      <template #notifications>
        <div class="w-full space-y-3">
          <EmailEntitlementsCard />
          <Card class="gap-3">
            <CardHeader class="border-b border-border/60 pb-3">
              <CardTitle>Notifications</CardTitle>
              <CardDescription>
                In-app notifications are always on. These toggles control what Vector may also send by email or push — separate from allowing this browser to show alerts.
              </CardDescription>
            </CardHeader>
            <CardContent class="space-y-3">
              <div class="overflow-hidden rounded-xl border border-border/70">
                <label
                  v-for="(item, index) in NOTIFICATION_PREFS"
                  :key="item.key"
                  class="flex items-start justify-between gap-4 px-3.5 py-3 transition-colors"
                  :class="[
                    index > 0 && 'border-t border-border/70',
                    prefLocked(item) ? 'cursor-not-allowed bg-muted/20 opacity-80' : 'cursor-pointer hover:bg-muted/35',
                  ]"
                >
                  <span class="min-w-0">
                    <span class="block text-sm font-medium">{{ item.title }}</span>
                    <span class="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{{ item.description }}</span>
                    <span v-if="prefLocked(item)" class="mt-1 block text-xs text-amber-800 dark:text-amber-200">
                      Not on your organization’s plan.
                      <RouterLink :to="planSettingsLink" class="font-medium text-primary hover:underline">View plan</RouterLink>
                    </span>
                  </span>
                  <Switch
                    class="mt-0.5"
                    :model-value="prefLocked(item) ? false : preferenceValue(item.key)"
                    :disabled="prefLocked(item)"
                    @update:model-value="(value: boolean) => setPreference(item.key, value)"
                  />
                </label>
              </div>
              <div :class="!preferenceValue('pushEnabled') && 'pointer-events-none opacity-60'">
                <PushPrompt context="settings" />
                <p v-if="!preferenceValue('pushEnabled')" class="mt-2 text-xs text-muted-foreground">
                  Turn on Push notifications above before enabling alerts on this device.
                </p>
              </div>
            </CardContent>
          </Card>
          <QuietHoursCard />
        </div>
      </template>

      <template #sounds>
        <div class="w-full">
          <SoundSettingsCard />
        </div>
      </template>

      <template #calendar>
        <div class="w-full space-y-3">
          <CalendarConnectionsCard />
          <IntegrationsHealthCard />
        </div>
      </template>

      <template #appearance>
        <div class="w-full space-y-3">
          <Card class="gap-3">
            <CardHeader class="border-b border-border/60 pb-3">
              <CardTitle>Appearance</CardTitle>
              <CardDescription>Light, dark, or follow your device. Saved on this device even when your organization changes its default.</CardDescription>
            </CardHeader>
            <CardContent class="space-y-3">
              <div class="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Colour mode">
                <button
                  v-for="theme in THEMES"
                  :key="theme.value"
                  type="button"
                  role="radio"
                  :aria-checked="preference === theme.value"
                  class="group flex flex-col items-start gap-2.5 rounded-xl border p-3 text-left transition-all"
                  :class="
                    preference === theme.value
                      ? 'border-primary bg-primary/5 shadow-[0_0_0_1px_var(--primary)]'
                      : 'border-border/70 hover:border-primary/35 hover:bg-accent/40'
                  "
                  @click="preference = theme.value"
                >
                  <span
                    class="flex size-8 items-center justify-center rounded-lg transition-colors"
                    :class="preference === theme.value ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground group-hover:bg-accent'"
                  >
                    <component :is="theme.icon" class="size-4" />
                  </span>
                  <span>
                    <span class="block text-sm font-medium">{{ theme.label }}</span>
                    <span class="block text-[11.5px] text-muted-foreground">{{ theme.hint }}</span>
                  </span>
                </button>
              </div>
              <div v-if="auth.organization" class="rounded-xl border border-border/70 bg-muted/25 px-3.5 py-2.5 text-xs text-muted-foreground">
                <template v-if="isPersonal">
                  <div class="flex flex-wrap items-center gap-2">
                    <span class="min-w-0 flex-1">Your own choice. {{ auth.organization.name }}’s default is {{ ORG_MODE_LABEL[auth.organization.defaultMode] }}.</span>
                    <Button variant="link" size="xs" class="h-auto p-0" @click="followOrganization(auth.organization.defaultMode)">Use the organization default</Button>
                  </div>
                </template>
                <span v-else>Following {{ auth.organization.name }}’s default ({{ ORG_MODE_LABEL[auth.organization.defaultMode] }}). Pick one above to make it your own.</span>
              </div>
            </CardContent>
          </Card>

          <Card v-if="canInstall" class="gap-3">
            <CardHeader class="border-b border-border/60 pb-3">
              <CardTitle>Install the app</CardTitle>
              <CardDescription>Add Vector to your home screen or desktop for a full-screen, app-like experience.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button @click="install"><Download /> Install Vector</Button>
            </CardContent>
          </Card>
          <Card v-else-if="!isStandalone && isAppleHint" class="gap-3">
            <CardHeader class="border-b border-border/60 pb-3">
              <CardTitle>Add to Home Screen</CardTitle>
              <CardDescription>On iPhone and iPad: tap Share → “Add to Home Screen” for an app-like experience.</CardDescription>
            </CardHeader>
          </Card>
        </div>
      </template>

      <template #data>
        <div class="w-full">
          <Card class="gap-3">
            <CardHeader class="border-b border-border/60 pb-3">
              <CardTitle>Your data</CardTitle>
              <CardDescription>Download a copy of your account data, or permanently disable this account.</CardDescription>
            </CardHeader>
            <CardContent class="space-y-2.5">
              <Toolbar variant="wrap" dense justify="between" class="rounded-xl border border-border/70 bg-muted/20 px-3.5 py-3">
                <div class="min-w-0">
                  <p class="text-sm font-medium">Export data</p>
                  <p class="mt-0.5 text-xs text-muted-foreground">JSON with your profile, memberships, preferences and assigned task keys.</p>
                </div>
                <Button variant="outline" :loading="isExporting" @click="exportData"><Download /> Export data</Button>
              </Toolbar>
              <Toolbar variant="wrap" dense justify="between" class="rounded-xl border border-destructive/25 bg-destructive/5 px-3.5 py-3">
                <div class="min-w-0">
                  <p class="text-sm font-medium text-destructive">Delete account</p>
                  <p class="mt-0.5 text-xs text-muted-foreground">Disables your account and anonymizes your email. This cannot be undone.</p>
                </div>
                <Button variant="destructive" @click="isDeleteOpen = true"><Trash2 /> Delete account</Button>
              </Toolbar>
            </CardContent>
          </Card>
        </div>
      </template>
    </SettingsLayout>

    <Dialog :open="isDeleteOpen" @update:open="onDeleteDialogOpen">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete your account?</DialogTitle>
          <DialogDescription>
            Your account will be disabled and your email anonymized. You will be signed out immediately.
            <template v-if="hasPassword"> Type your password to confirm.</template>
            <template v-else> Type your account email ({{ auth.user?.email }}) to confirm.</template>
          </DialogDescription>
        </DialogHeader>
        <FormField v-if="hasPassword" label="Password" for="delete-password">
          <PasswordInput id="delete-password" v-model="deletePassword" autocomplete="current-password" required />
        </FormField>
        <FormField v-else label="Account email" for="delete-email">
          <Input id="delete-email" v-model="deleteEmail" type="email" autocomplete="email" required :placeholder="auth.user?.email" />
        </FormField>
        <DialogFooter>
          <Button variant="outline" @click="isDeleteOpen = false">Cancel</Button>
          <Button variant="destructive" :loading="isDeleting" :disabled="!canConfirmDelete" @click="deleteAccount">Delete account</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </PageFrame>
</template>

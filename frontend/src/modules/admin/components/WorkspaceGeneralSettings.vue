<script setup lang="ts">
import { Copy, Monitor, Moon, Sun, Trash2 } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import FormField from '@/components/common/FormField.vue'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useTheme } from '@/composables/useTheme'
import { getErrorMessage, getFieldErrors } from '@/lib/http'
import { useAuthStore } from '@/modules/auth/auth.store'
import OrganizationFields from '@/modules/auth/components/OrganizationFields.vue'
import { organizationUrl } from '@/modules/auth/organization-slug'
import { useWorkspaceStore } from '@/stores/workspace.store'
import type { ColorMode, WorkspaceSettings } from '@/types/models'
import { workspaceApi } from '../admin.api'
import OrganizationLogoField from './OrganizationLogoField.vue'
import OrganizationThemeField from './OrganizationThemeField.vue'

const workspace = useWorkspaceStore()
const auth = useAuthStore()
const theme = useTheme()
const PERSONAL_LABEL = { light: 'Light', dim: 'Dim', dark: 'Dark', auto: 'System' } as const

const form = ref({ name: workspace.settings.name, slug: workspace.settings.slug ?? '' })
const slugAvailable = ref(true)
const fieldErrors = ref<Record<string, string>>({})
const isSaving = ref(false)

watch(
  () => [workspace.settings.name, workspace.settings.slug] as const,
  ([name, slug]) => (form.value = { name, slug: slug ?? '' }),
)

const isDirty = computed(() => form.value.name.trim() !== workspace.settings.name || form.value.slug !== workspace.settings.slug)

const MODES: Array<{ value: ColorMode; label: string; description: string; icon: typeof Sun }> = [
  { value: 'light', label: 'Light', description: 'Bright and clean', icon: Sun },
  { value: 'dark', label: 'Dark', description: 'Easy on the eyes', icon: Moon },
  { value: 'system', label: 'System', description: 'Follow each device', icon: Monitor },
]

async function save(changes: Partial<Omit<WorkspaceSettings, 'updatedAt'>>, message: string) {
  isSaving.value = true
  fieldErrors.value = {}
  try {
    await workspace.update(changes)
    toast.success(message)
  } catch (error) {
    fieldErrors.value = getFieldErrors(error)
    if (!Object.keys(fieldErrors.value).length) toast.error(getErrorMessage(error))
  } finally {
    isSaving.value = false
  }
}

async function copyLink() {
  if (!workspace.settings.slug) return
  await navigator.clipboard.writeText(organizationUrl(workspace.settings.slug))
  toast.success('Organization link copied')
}

// --- Danger zone ---------------------------------------------------------------
const isDeleteOpen = ref(false)
const confirmName = ref('')
const isDeleting = ref(false)

async function deleteOrganization() {
  isDeleting.value = true
  try {
    await workspaceApi.remove(confirmName.value)
    const next = auth.organizations.find((organization) => organization.id !== auth.organization?.id)
    toast.success(`${workspace.settings.name} was deleted`)
    if (next) await auth.switchOrganization(next.id)
    else {
      await auth.refreshSession()
      window.location.assign('/organizations/new')
    }
  } catch (error) {
    toast.error(getErrorMessage(error))
    isDeleting.value = false
  }
}
</script>

<template>
  <div class="space-y-3.5 sm:space-y-4">
    <Card>
      <CardHeader>
        <CardTitle>Name and address</CardTitle>
        <CardDescription>
          <span class="sm:hidden">Name in the sidebar and emails; address is the link your team opens.</span>
          <span class="max-sm:hidden">The name appears in the sidebar and emails. The address is the link your team uses to open this organization.</span>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form class="space-y-4" @submit.prevent="save({ name: form.name.trim(), slug: form.slug }, 'Organization updated')">
          <OrganizationFields
            v-model:name="form.name"
            v-model:slug="form.slug"
            v-model:available="slugAvailable"
            :errors="fieldErrors"
            :current-slug="workspace.settings.slug"
          />
          <div class="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <Button type="submit" class="max-sm:w-full" :loading="isSaving" :disabled="!isDirty || form.name.trim().length < 2 || !slugAvailable">Save</Button>
            <Button type="button" variant="ghost" class="max-sm:w-full" :disabled="!workspace.settings.slug" @click="copyLink"><Copy /> Copy link</Button>
            <span v-if="form.slug !== workspace.settings.slug" class="text-xs text-muted-foreground">Old links that use the previous address stop working.</span>
          </div>
        </form>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>Organization logo</CardTitle>
        <CardDescription>Shown in the sidebar and the organization switcher for everyone in {{ workspace.settings.name }}.</CardDescription>
      </CardHeader>
      <CardContent>
        <OrganizationLogoField />
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>Theme colour</CardTitle>
        <CardDescription>
          Buttons, links, highlights and the sidebar take this colour for everyone in {{ workspace.settings.name }}, right away. Pick a theme, match your logo or
          use your brand colour.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <OrganizationThemeField />
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>Default colour mode</CardTitle>
        <CardDescription>
          Everyone in {{ workspace.settings.name }} sees this, and it changes right away for them. People who pick light, dark or system for themselves in
          Settings keep their own choice.
        </CardDescription>
      </CardHeader>
      <CardContent class="space-y-3">
        <div
          v-if="theme.isPersonal.value"
          class="flex flex-col gap-3 rounded-xl border border-warning/40 bg-warning/10 px-3 py-3 text-sm text-amber-800 sm:flex-row sm:items-center dark:text-warning"
        >
          <p class="min-w-0 flex-1 leading-relaxed">
            You picked <strong>{{ PERSONAL_LABEL[theme.preference.value] }}</strong> for yourself in Settings, so this default does not change what you see.
          </p>
          <Button
            variant="outline"
            size="sm"
            class="w-full shrink-0 sm:w-auto"
            @click="theme.followOrganization(workspace.settings.defaultMode)"
          >
            Follow the organization default
          </Button>
        </div>
        <div class="grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Default colour mode">
          <button
            v-for="mode in MODES"
            :key="mode.value"
            type="button"
            role="radio"
            :aria-checked="workspace.settings.defaultMode === mode.value"
            class="flex items-center gap-3 rounded-xl border p-3.5 text-left transition-all"
            :class="
              workspace.settings.defaultMode === mode.value
                ? 'border-primary bg-primary/5 ring-4 ring-primary/10'
                : 'border-border/70 hover:border-primary/30 hover:bg-accent/40'
            "
            @click="save({ defaultMode: mode.value }, `Default mode set to ${mode.label.toLowerCase()}`)"
          >
            <span class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><component :is="mode.icon" class="size-4" /></span>
            <span class="min-w-0">
              <span class="block text-sm font-medium">{{ mode.label }}</span>
              <span class="block text-xs text-muted-foreground">{{ mode.description }}</span>
            </span>
          </button>
        </div>
      </CardContent>
    </Card>

    <Card class="border-destructive/30">
      <CardHeader>
        <CardTitle class="text-destructive">Delete organization</CardTitle>
        <CardDescription>
          Permanently deletes {{ workspace.settings.name }} with all of its projects, tasks, chat and reports. People keep their accounts and any other
          organizations.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button variant="destructive" class="max-sm:w-full" @click="isDeleteOpen = true"><Trash2 /> Delete organization</Button>
      </CardContent>
    </Card>

    <Dialog v-model:open="isDeleteOpen">
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete {{ workspace.settings.name }}?</DialogTitle>
          <DialogDescription>This cannot be undone. Every project and all work in this organization will be removed for everyone.</DialogDescription>
        </DialogHeader>
        <form id="delete-organization" class="space-y-3" @submit.prevent="deleteOrganization">
          <FormField :label="`Type “${workspace.settings.name}” to confirm`" for="confirm-organization-name">
            <Input id="confirm-organization-name" v-model="confirmName" autocomplete="off" />
          </FormField>
        </form>
        <DialogFooter>
          <Button variant="ghost" @click="isDeleteOpen = false">Cancel</Button>
          <Button type="submit" form="delete-organization" variant="destructive" :loading="isDeleting" :disabled="confirmName.trim() !== workspace.settings.name">
            Delete forever
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>

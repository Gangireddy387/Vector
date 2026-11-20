<script setup lang="ts">
import { Copy, Download, Monitor, Moon, Sun, Trash2, Upload } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import FormField from '@/components/common/FormField.vue'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { useTheme } from '@/composables/useTheme'
import { getErrorMessage, getFieldErrors } from '@/lib/http'
import { useAuthStore } from '@/modules/auth/auth.store'
import OrganizationFields from '@/modules/auth/components/OrganizationFields.vue'
import { organizationUrl } from '@/modules/auth/organization-slug'
import { useWorkspaceStore } from '@/stores/workspace.store'
import type { ColorMode, OrganizationInvitePolicy, OrganizationRetention, WorkspaceSettings } from '@/types/models'
import { workspaceApi } from '../admin.api'
import OrganizationLogoField from './OrganizationLogoField.vue'
import OrganizationThemeField from './OrganizationThemeField.vue'

const workspace = useWorkspaceStore()
const auth = useAuthStore()
const theme = useTheme()
const PERSONAL_LABEL = { light: 'Light', dim: 'Dim', dark: 'Dark', auto: 'System' } as const

const RETENTION_DEFAULTS: OrganizationRetention = {
  auditLogDays: 0,
  activityDays: 0,
  notificationDays: 0,
  transcriptDays: 0,
  recordingDays: 0,
}

const INVITE_DEFAULTS: OrganizationInvitePolicy = { restrictDomains: false, allowedDomains: [] }

const RETENTION_FIELDS: { key: keyof OrganizationRetention; label: string; hint: string }[] = [
  { key: 'auditLogDays', label: 'Audit & sign-in log', hint: 'Admin Activity tab history' },
  { key: 'activityDays', label: 'Task activity', hint: 'Issue and project activity feed' },
  { key: 'notificationDays', label: 'Notifications', hint: 'Inbox items tied to this organization’s projects' },
  { key: 'transcriptDays', label: 'Meeting transcripts', hint: 'Spoken lines and transcript search' },
  { key: 'recordingDays', label: 'Meeting recordings', hint: 'Stored call recordings and files' },
]

const form = ref({ name: workspace.settings.name, slug: workspace.settings.slug ?? '' })
const retentionForm = ref<OrganizationRetention>({
  ...RETENTION_DEFAULTS,
  ...(workspace.settings.retention ?? {}),
})
const inviteForm = ref({
  restrictDomains: Boolean(workspace.settings.invitePolicy?.restrictDomains),
  domainsText: (workspace.settings.invitePolicy?.allowedDomains ?? []).join(', '),
})
const slugAvailable = ref(true)
const fieldErrors = ref<Record<string, string>>({})
const isSaving = ref(false)
const isSavingRetention = ref(false)
const isSavingInvite = ref(false)

watch(
  () => [workspace.settings.name, workspace.settings.slug] as const,
  ([name, slug]) => (form.value = { name, slug: slug ?? '' }),
)

watch(
  () => workspace.settings.retention,
  (value) => {
    retentionForm.value = { ...RETENTION_DEFAULTS, ...(value ?? {}) }
  },
  { deep: true },
)

watch(
  () => workspace.settings.invitePolicy,
  (value) => {
    inviteForm.value = {
      restrictDomains: Boolean(value?.restrictDomains),
      domainsText: (value?.allowedDomains ?? []).join(', '),
    }
  },
  { deep: true },
)

const parsedInviteDomains = computed(() =>
  [
    ...new Set(
      inviteForm.value.domainsText
        .split(/[\s,;]+/)
        .map((item) => item.trim().toLowerCase().replace(/^@/, ''))
        .filter(Boolean),
    ),
  ].slice(0, 25),
)

const isDirty = computed(() => form.value.name.trim() !== workspace.settings.name || form.value.slug !== workspace.settings.slug)
const isRetentionDirty = computed(() => {
  const current = { ...RETENTION_DEFAULTS, ...(workspace.settings.retention ?? {}) }
  return RETENTION_FIELDS.some(({ key }) => Number(retentionForm.value[key] || 0) !== Number(current[key] || 0))
})
const isInviteDirty = computed(() => {
  const current = { ...INVITE_DEFAULTS, ...(workspace.settings.invitePolicy ?? {}) }
  return (
    inviteForm.value.restrictDomains !== current.restrictDomains ||
    parsedInviteDomains.value.join(',') !== current.allowedDomains.join(',')
  )
})

async function saveRetention() {
  isSavingRetention.value = true
  try {
    const retention = Object.fromEntries(
      RETENTION_FIELDS.map(({ key }) => [key, Math.max(0, Math.min(3650, Math.floor(Number(retentionForm.value[key]) || 0)))]),
    ) as OrganizationRetention
    await workspace.update({ retention })
    retentionForm.value = { ...retention }
    toast.success('Data retention saved', { description: 'A nightly job removes older data. 0 keeps everything.' })
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    isSavingRetention.value = false
  }
}

async function saveInvitePolicy() {
  isSavingInvite.value = true
  fieldErrors.value = {}
  try {
    const invitePolicy: OrganizationInvitePolicy = {
      restrictDomains: inviteForm.value.restrictDomains,
      allowedDomains: parsedInviteDomains.value,
    }
    await workspace.update({ invitePolicy })
    inviteForm.value = {
      restrictDomains: invitePolicy.restrictDomains,
      domainsText: invitePolicy.allowedDomains.join(', '),
    }
    toast.success(
      invitePolicy.restrictDomains ? 'Invitation domains limited' : 'Invitation domain limit off',
      {
        description: invitePolicy.restrictDomains
          ? `Only ${invitePolicy.allowedDomains.join(', ')} can be invited.`
          : 'Anyone with an email can be invited (subject to your plan).',
      },
    )
  } catch (error) {
    fieldErrors.value = getFieldErrors(error)
    toast.error(getErrorMessage(error))
  } finally {
    isSavingInvite.value = false
  }
}
const isExporting = ref(false)
const isImporting = ref(false)
const isImportOpen = ref(false)
const importFile = ref<File | null>(null)
const importInput = ref<HTMLInputElement | null>(null)

async function exportBackup() {
  isExporting.value = true
  try {
    await workspaceApi.exportBackup(workspace.settings.slug)
    toast.success('Backup downloaded', {
      description: 'JSON includes projects and tasks. Copy the server upload folder separately for file binaries.',
    })
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    isExporting.value = false
  }
}

function pickImportFile(event: Event) {
  const input = event.target as HTMLInputElement
  importFile.value = input.files?.[0] ?? null
  if (importFile.value) isImportOpen.value = true
  input.value = ''
}

async function confirmImport() {
  if (!importFile.value) return
  isImporting.value = true
  try {
    const result = await workspaceApi.importBackup(importFile.value)
    isImportOpen.value = false
    importFile.value = null
    const keyNote = result.remappedKeys.length
      ? ` Keys remapped: ${result.remappedKeys.map((row) => `${row.from}→${row.to}`).join(', ')}.`
      : ''
    toast.success(`Imported ${result.projectsCreated} project(s), ${result.issuesCreated} task(s).${keyNote}`, {
      description:
        result.skipped.attachments > 0
          ? `${result.skipped.attachments} attachment metadata rows skipped (binaries are not in the JSON).`
          : undefined,
    })
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    isImporting.value = false
  }
}

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

/** Public viral preview — workday loop + org name, no private data. */
async function copyInvitePreview() {
  if (!workspace.settings.slug) return
  await navigator.clipboard.writeText(`${window.location.origin}/invite/${workspace.settings.slug}`)
  toast.success('Invite preview link copied', {
    description: 'Share this to show your workday loop. People still need a real invite to join.',
  })
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
          <div
            class="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center"
            :class="isDirty && 'rounded-lg border border-primary/30 bg-primary/5 p-2.5'"
          >
            <Button type="submit" class="max-sm:w-full" :loading="isSaving" :disabled="!isDirty || form.name.trim().length < 2 || !slugAvailable">Save</Button>
            <span v-if="isDirty" class="text-xs font-medium text-primary">Unsaved changes</span>
            <Button type="button" variant="ghost" class="max-sm:w-full" :disabled="!workspace.settings.slug" @click="copyLink"><Copy /> Copy link</Button>
            <Button type="button" variant="outline" class="max-sm:w-full" :disabled="!workspace.settings.slug" @click="copyInvitePreview">
              <Copy /> Copy invite preview
            </Button>
            <span v-if="form.slug !== workspace.settings.slug" class="text-xs text-muted-foreground">Old links that use the previous address stop working.</span>
          </div>
        </form>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>Security</CardTitle>
        <CardDescription>Require every member to turn on two-factor authentication before they can use {{ workspace.settings.name }}.</CardDescription>
      </CardHeader>
      <CardContent>
        <label class="flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-border/70 px-3.5 py-3">
          <span class="min-w-0">
            <span class="block text-sm font-medium">Require two-factor authentication</span>
            <span class="mt-0.5 block text-xs text-muted-foreground">
              Members without MFA are sent to Account settings → Security until they enable it. Admins can still turn this off.
            </span>
          </span>
          <Switch
            class="mt-0.5"
            :model-value="Boolean(workspace.settings.requireMfa)"
            :disabled="isSaving"
            @update:model-value="(value: boolean) => save({ requireMfa: value }, value ? 'Two-factor authentication required' : 'Two-factor requirement turned off')"
          />
        </label>
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

    <Card>
      <CardHeader>
        <CardTitle>Invitation domains</CardTitle>
        <CardDescription>
          Limit who can be invited into {{ workspace.settings.name }} by email domain (for example
          <code class="text-xs">company.com</code>). Applies to People invites and to project invites that bring someone new into the organization.
        </CardDescription>
      </CardHeader>
      <CardContent class="space-y-4">
        <label class="flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-border/70 px-3.5 py-3">
          <span class="min-w-0">
            <span class="block text-sm font-medium">Restrict invites to listed domains</span>
            <span class="mt-0.5 block text-xs text-muted-foreground">
              People already in the organization can still be added to projects. Turning this on requires at least one domain.
            </span>
          </span>
          <Switch
            class="mt-0.5"
            :model-value="inviteForm.restrictDomains"
            :disabled="isSavingInvite"
            @update:model-value="(value: boolean) => (inviteForm.restrictDomains = value)"
          />
        </label>
        <FormField label="Allowed domains" for="invite-domains" :error="fieldErrors['invitePolicy.allowedDomains']">
          <Input
            id="invite-domains"
            v-model="inviteForm.domainsText"
            placeholder="company.com, partner.org"
            :disabled="isSavingInvite"
          />
          <p class="mt-1 text-[11px] text-muted-foreground">Comma-separated. Example: acme.com, acme.co.uk</p>
        </FormField>
        <div class="flex flex-wrap items-center gap-2">
          <Button type="button" variant="brand" class="max-sm:w-full" :loading="isSavingInvite" :disabled="!isInviteDirty" @click="saveInvitePolicy">
            Save invitation policy
          </Button>
          <span v-if="isInviteDirty" class="text-xs font-medium text-primary">Unsaved changes</span>
        </div>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>Data retention</CardTitle>
        <CardDescription>
          How long {{ workspace.settings.name }} keeps audit logs, activity, notifications, transcripts and recordings. Use
          <strong>0</strong> to keep forever. A nightly job deletes anything older.
        </CardDescription>
      </CardHeader>
      <CardContent class="space-y-4">
        <div class="grid gap-3 sm:grid-cols-2">
          <FormField v-for="field in RETENTION_FIELDS" :key="field.key" :label="field.label" :for="`retention-${field.key}`">
            <div class="flex items-center gap-2">
              <Input
                :id="`retention-${field.key}`"
                v-model.number="retentionForm[field.key]"
                type="number"
                min="0"
                max="3650"
                class="max-w-[8rem]"
                :disabled="isSavingRetention"
              />
              <span class="text-xs text-muted-foreground">days</span>
            </div>
            <p class="mt-1 text-[11px] text-muted-foreground">{{ field.hint }}</p>
          </FormField>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <Button type="button" variant="brand" class="max-sm:w-full" :loading="isSavingRetention" :disabled="!isRetentionDirty" @click="saveRetention">
            Save retention
          </Button>
          <span v-if="isRetentionDirty" class="text-xs font-medium text-primary">Unsaved changes</span>
        </div>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>Backup &amp; restore</CardTitle>
        <CardDescription>
          Download a JSON backup of {{ workspace.settings.name }}: people, departments, projects, tasks, comments, links, automations and
          attachment metadata. Restore merges into this organization — it creates new projects (keys get a suffix if taken) and matches
          people by email. Binary files stay on the server — also copy the upload directory when you leave the host.
        </CardDescription>
      </CardHeader>
      <CardContent class="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Button variant="outline" class="max-sm:w-full" :loading="isExporting" @click="exportBackup">
          <Download /> Download backup
        </Button>
        <Button variant="outline" class="max-sm:w-full" :disabled="isImporting" @click="importInput?.click()">
          <Upload /> Restore from backup
        </Button>
        <input ref="importInput" type="file" accept="application/json,.json" class="hidden" @change="pickImportFile" />
      </CardContent>
    </Card>

    <Dialog v-model:open="isImportOpen">
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Restore backup?</DialogTitle>
          <DialogDescription>
            This creates new projects and tasks in {{ workspace.settings.name }}. It does not replace existing data, create users, or
            restore file binaries.
            <span v-if="importFile" class="mt-2 block font-mono text-xs text-foreground">{{ importFile.name }}</span>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter class="gap-2 sm:gap-0">
          <Button type="button" variant="outline" :disabled="isImporting" @click="isImportOpen = false">Cancel</Button>
          <Button type="button" :loading="isImporting" @click="confirmImport">Restore</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

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

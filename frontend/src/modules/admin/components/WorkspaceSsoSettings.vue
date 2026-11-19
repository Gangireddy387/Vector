<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import FormField from '@/components/common/FormField.vue'
import { SelectField, type SelectFieldOption } from '@/components/forms'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { getErrorMessage, getFieldErrors } from '@/lib/http'
import { useWorkspaceStore } from '@/stores/workspace.store'
import type { OrganizationSsoSettings } from '@/types/models'

const workspace = useWorkspaceStore()

const PROVIDER_OPTIONS: SelectFieldOption[] = [
  { value: 'microsoft', label: 'Microsoft' },
  { value: 'google', label: 'Google' },
]

const available = computed(() => Boolean(workspace.settings.sso?.available))
const current = computed<OrganizationSsoSettings>(() => ({
  available: available.value,
  enabled: Boolean(workspace.settings.sso?.enabled),
  enforce: Boolean(workspace.settings.sso?.enforce),
  provider: workspace.settings.sso?.provider === 'google' ? 'google' : 'microsoft',
  allowedDomains: workspace.settings.sso?.allowedDomains ?? [],
  microsoftTenant: workspace.settings.sso?.microsoftTenant ?? null,
}))

const form = ref({
  enabled: current.value.enabled,
  enforce: current.value.enforce,
  provider: (current.value.provider ?? 'microsoft') as 'google' | 'microsoft',
  domainsText: current.value.allowedDomains.join(', '),
  microsoftTenant: current.value.microsoftTenant ?? '',
})
const fieldErrors = ref<Record<string, string>>({})
const isSaving = ref(false)

watch(
  current,
  (next) => {
    form.value = {
      enabled: next.enabled,
      enforce: next.enforce,
      provider: (next.provider ?? 'microsoft') as 'google' | 'microsoft',
      domainsText: next.allowedDomains.join(', '),
      microsoftTenant: next.microsoftTenant ?? '',
    }
  },
  { deep: true },
)

const parsedDomains = computed(() =>
  [
    ...new Set(
      form.value.domainsText
        .split(/[\s,;]+/)
        .map((item) => item.trim().toLowerCase().replace(/^@/, ''))
        .filter(Boolean),
    ),
  ].slice(0, 25),
)

const isDirty = computed(() => {
  const saved = current.value
  return (
    form.value.enabled !== saved.enabled ||
    form.value.enforce !== saved.enforce ||
    form.value.provider !== (saved.provider ?? 'microsoft') ||
    parsedDomains.value.join(',') !== saved.allowedDomains.join(',') ||
    (form.value.microsoftTenant.trim() || null) !== (saved.microsoftTenant || null)
  )
})

async function save() {
  if (!available.value) return
  isSaving.value = true
  fieldErrors.value = {}
  try {
    await workspace.update({
      sso: {
        enabled: form.value.enabled,
        enforce: form.value.enabled && form.value.enforce,
        provider: form.value.provider,
        allowedDomains: parsedDomains.value,
        microsoftTenant: form.value.provider === 'microsoft' ? form.value.microsoftTenant.trim() || null : null,
      },
    })
    toast.success('SSO settings saved')
  } catch (error) {
    fieldErrors.value = getFieldErrors(error)
    if (!Object.keys(fieldErrors.value).length) toast.error(getErrorMessage(error))
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle>Enterprise SSO</CardTitle>
      <CardDescription>
        <template v-if="available">
          Require Google or Microsoft sign-in for company email domains. Optional Microsoft tenant lock uses your Azure AD
          directory ID.
        </template>
        <template v-else>Included on Enterprise (or when the portal turns the SSO feature on for this organization).</template>
      </CardDescription>
    </CardHeader>
    <CardContent v-if="!available" class="text-sm text-muted-foreground">
      Ask the portal administrator to enable Enterprise SSO on this organization’s plan.
    </CardContent>
    <CardContent v-else class="space-y-4">
      <label class="flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-border/70 px-3.5 py-3">
        <span class="min-w-0">
          <span class="block text-sm font-medium">Enable SSO</span>
          <span class="mt-0.5 block text-xs text-muted-foreground">Turn on domain and provider rules for this organization.</span>
        </span>
        <Switch v-model="form.enabled" class="mt-0.5" :disabled="isSaving" />
      </label>

      <label
        class="flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-border/70 px-3.5 py-3"
        :class="!form.enabled && 'opacity-60'"
      >
        <span class="min-w-0">
          <span class="block text-sm font-medium">Require SSO (block passwords)</span>
          <span class="mt-0.5 block text-xs text-muted-foreground">
            People with an allowed email domain must use Continue with {{ form.provider === 'google' ? 'Google' : 'Microsoft' }}.
          </span>
        </span>
        <Switch v-model="form.enforce" class="mt-0.5" :disabled="isSaving || !form.enabled" />
      </label>

      <FormField label="Sign-in provider" for="sso-provider">
        <SelectField id="sso-provider" v-model="form.provider" :options="PROVIDER_OPTIONS" :disabled="isSaving || !form.enabled" />
      </FormField>

      <FormField
        label="Allowed email domains"
        for="sso-domains"
        hint="Comma-separated, e.g. acme.com, acme.co.uk. Required when SSO is enforced."
        :error="fieldErrors['sso.allowedDomains']"
      >
        <Input
          id="sso-domains"
          v-model="form.domainsText"
          placeholder="company.com"
          :disabled="isSaving || !form.enabled"
          autocomplete="off"
        />
      </FormField>

      <FormField
        v-if="form.provider === 'microsoft'"
        label="Microsoft tenant ID"
        for="sso-tenant"
        hint="Azure AD directory (tenant) GUID. Leave blank to allow any Microsoft account that matches the domains."
        :error="fieldErrors['sso.microsoftTenant']"
      >
        <Input
          id="sso-tenant"
          v-model="form.microsoftTenant"
          placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
          :disabled="isSaving || !form.enabled"
          autocomplete="off"
        />
      </FormField>

      <Button type="button" :loading="isSaving" :disabled="!isDirty" @click="save">Save SSO settings</Button>
    </CardContent>
  </Card>
</template>

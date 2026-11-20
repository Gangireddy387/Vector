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

type SsoProvider = 'google' | 'microsoft' | 'oidc'

const PROVIDER_OPTIONS: SelectFieldOption[] = [
  { value: 'microsoft', label: 'Microsoft' },
  { value: 'google', label: 'Google' },
  { value: 'oidc', label: 'OpenID Connect (generic)' },
]

const available = computed(() => Boolean(workspace.settings.sso?.available))
const current = computed<OrganizationSsoSettings>(() => {
  const provider = workspace.settings.sso?.provider
  return {
    available: available.value,
    enabled: Boolean(workspace.settings.sso?.enabled),
    enforce: Boolean(workspace.settings.sso?.enforce),
    provider: provider === 'google' || provider === 'microsoft' || provider === 'oidc' ? provider : 'microsoft',
    allowedDomains: workspace.settings.sso?.allowedDomains ?? [],
    microsoftTenant: workspace.settings.sso?.microsoftTenant ?? null,
    oidc: workspace.settings.sso?.oidc ?? null,
  }
})

const form = ref({
  enabled: current.value.enabled,
  enforce: current.value.enforce,
  provider: (current.value.provider ?? 'microsoft') as SsoProvider,
  domainsText: current.value.allowedDomains.join(', '),
  microsoftTenant: current.value.microsoftTenant ?? '',
  oidcIssuer: current.value.oidc?.issuer ?? '',
  oidcClientId: current.value.oidc?.clientId ?? '',
  oidcClientSecret: '',
  oidcScopes: current.value.oidc?.scopes ?? 'openid email profile',
  oidcEmailClaim: current.value.oidc?.emailClaim ?? 'email',
  oidcNameClaim: current.value.oidc?.nameClaim ?? 'name',
})
const fieldErrors = ref<Record<string, string>>({})
const isSaving = ref(false)

watch(
  current,
  (next) => {
    form.value = {
      enabled: next.enabled,
      enforce: next.enforce,
      provider: (next.provider ?? 'microsoft') as SsoProvider,
      domainsText: next.allowedDomains.join(', '),
      microsoftTenant: next.microsoftTenant ?? '',
      oidcIssuer: next.oidc?.issuer ?? '',
      oidcClientId: next.oidc?.clientId ?? '',
      oidcClientSecret: '',
      oidcScopes: next.oidc?.scopes ?? 'openid email profile',
      oidcEmailClaim: next.oidc?.emailClaim ?? 'email',
      oidcNameClaim: next.oidc?.nameClaim ?? 'name',
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

const providerLabel = computed(() => {
  if (form.value.provider === 'google') return 'Google'
  if (form.value.provider === 'microsoft') return 'Microsoft'
  return 'SSO'
})

const isDirty = computed(() => {
  const saved = current.value
  const oidcDirty =
    form.value.provider === 'oidc' &&
    (form.value.oidcIssuer.trim() !== (saved.oidc?.issuer || '') ||
      form.value.oidcClientId.trim() !== (saved.oidc?.clientId || '') ||
      form.value.oidcScopes.trim() !== (saved.oidc?.scopes || 'openid email profile') ||
      form.value.oidcEmailClaim.trim() !== (saved.oidc?.emailClaim || 'email') ||
      form.value.oidcNameClaim.trim() !== (saved.oidc?.nameClaim || 'name') ||
      Boolean(form.value.oidcClientSecret.trim()))
  return (
    form.value.enabled !== saved.enabled ||
    form.value.enforce !== saved.enforce ||
    form.value.provider !== (saved.provider ?? 'microsoft') ||
    parsedDomains.value.join(',') !== saved.allowedDomains.join(',') ||
    (form.value.microsoftTenant.trim() || null) !== (saved.microsoftTenant || null) ||
    oidcDirty
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
        ...(form.value.provider === 'oidc'
          ? {
              oidc: {
                issuer: form.value.oidcIssuer.trim() || null,
                clientId: form.value.oidcClientId.trim() || null,
                scopes: form.value.oidcScopes.trim() || 'openid email profile',
                emailClaim: form.value.oidcEmailClaim.trim() || 'email',
                nameClaim: form.value.oidcNameClaim.trim() || 'name',
                ...(form.value.oidcClientSecret.trim()
                  ? { clientSecret: form.value.oidcClientSecret.trim() }
                  : { clientSecret: '' }),
              },
            }
          : {}),
      },
    })
    form.value.oidcClientSecret = ''
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
          Require Google, Microsoft, or a generic OpenID Connect IdP for company email domains. Optional Microsoft tenant
          lock uses your Azure AD directory ID.
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
            People with an allowed email domain must use Continue with {{ providerLabel }}.
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

      <template v-if="form.provider === 'oidc'">
        <FormField
          label="Issuer URL"
          for="sso-oidc-issuer"
          hint="Your IdP’s OpenID issuer (https), e.g. https://login.example.com. Discovery uses /.well-known/openid-configuration."
          :error="fieldErrors['sso.oidc.issuer']"
        >
          <Input
            id="sso-oidc-issuer"
            v-model="form.oidcIssuer"
            placeholder="https://idp.example.com"
            :disabled="isSaving || !form.enabled"
            autocomplete="off"
          />
        </FormField>
        <FormField label="Client ID" for="sso-oidc-client-id" :error="fieldErrors['sso.oidc.clientId']">
          <Input
            id="sso-oidc-client-id"
            v-model="form.oidcClientId"
            placeholder="vector-app"
            :disabled="isSaving || !form.enabled"
            autocomplete="off"
          />
        </FormField>
        <FormField
          label="Client secret"
          for="sso-oidc-client-secret"
          :hint="
            current.oidc?.clientSecretConfigured
              ? 'Leave blank to keep the stored secret.'
              : 'Required the first time you enable OpenID Connect.'
          "
          :error="fieldErrors['sso.oidc.clientSecret']"
        >
          <Input
            id="sso-oidc-client-secret"
            v-model="form.oidcClientSecret"
            type="password"
            placeholder="••••••••"
            :disabled="isSaving || !form.enabled"
            autocomplete="new-password"
          />
        </FormField>
        <FormField
          label="Scopes"
          for="sso-oidc-scopes"
          hint="Space-separated. Must include openid; email and profile are recommended."
          :error="fieldErrors['sso.oidc.scopes']"
        >
          <Input
            id="sso-oidc-scopes"
            v-model="form.oidcScopes"
            placeholder="openid email profile"
            :disabled="isSaving || !form.enabled"
            autocomplete="off"
          />
        </FormField>
        <FormField
          label="Email claim"
          for="sso-oidc-email-claim"
          hint="IdP claim mapped to the user’s email (e.g. email, preferred_username, upn)."
          :error="fieldErrors['sso.oidc.emailClaim']"
        >
          <Input
            id="sso-oidc-email-claim"
            v-model="form.oidcEmailClaim"
            placeholder="email"
            :disabled="isSaving || !form.enabled"
            autocomplete="off"
          />
        </FormField>
        <FormField
          label="Name claim"
          for="sso-oidc-name-claim"
          hint="IdP claim mapped to the display name (e.g. name, given_name)."
          :error="fieldErrors['sso.oidc.nameClaim']"
        >
          <Input
            id="sso-oidc-name-claim"
            v-model="form.oidcNameClaim"
            placeholder="name"
            :disabled="isSaving || !form.enabled"
            autocomplete="off"
          />
        </FormField>
      </template>

      <Button type="button" :loading="isSaving" :disabled="!isDirty" @click="save">Save SSO settings</Button>
    </CardContent>
  </Card>
</template>

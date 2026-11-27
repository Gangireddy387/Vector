<script setup lang="ts">
import { Download, History, KeyRound, Shield } from 'lucide-vue-next'
import { onMounted, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import EmptyState from '@/components/common/EmptyState.vue'
import Toolbar from '@/components/common/Toolbar.vue'
import UserAvatar from '@/components/common/UserAvatar.vue'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDateTime, timeAgo } from '@/lib/format'
import { getErrorMessage } from '@/lib/http'
import { type WorkspaceAuditEntry, workspaceApi } from '../admin.api'

type AuditCategory = 'all' | 'auth' | 'admin'

const entries = ref<WorkspaceAuditEntry[]>([])
const category = ref<AuditCategory>('all')
const isLoading = ref(true)
const isLoadingMore = ref(false)
const isExporting = ref(false)
const errorMessage = ref('')
const hasMore = ref(false)

const FILTERS: { value: AuditCategory; label: string; hint: string }[] = [
  { value: 'all', label: 'All', hint: 'Everything' },
  { value: 'admin', label: 'Organization', hint: 'People, settings, plan' },
  { value: 'auth', label: 'Sign-in & security', hint: 'SSO, MFA, sessions' },
]

const ACTION_LABELS: Record<string, string> = {
  'member.invited': 'Invited a member',
  'member.role_changed': 'Changed a member’s role',
  'member.custom_role_changed': 'Changed a member’s custom role',
  'member.deactivated': 'Deactivated a member',
  'member.reactivated': 'Reactivated a member',
  'member.removed': 'Removed a member',
  'settings.updated': 'Updated organization settings',
  'settings.logo_updated': 'Updated the organization logo',
  'settings.logo_removed': 'Removed the organization logo',
  'plan.upgrade_requested': 'Requested a plan upgrade',
  'plan.changed': 'Changed the plan',
  'webhook.created': 'Created a webhook',
  'webhook.updated': 'Updated a webhook',
  'webhook.deleted': 'Deleted a webhook',
  'embed.created': 'Created workspace embed keys',
  'embed.secret_rotated': 'Rotated embed secret key',
  'embed.enabled': 'Enabled workspace embed app',
  'embed.disabled': 'Disabled workspace embed app',
  'embed.deleted': 'Deleted workspace embed app',
  'embed.connect': 'Connected partner app (admin)',
  'embed.session': 'Opened workspace via embed',
  'scim.token_created': 'Created a SCIM token',
  'scim.token_revoked': 'Revoked a SCIM token',
  backup_exported: 'Exported a workspace backup',
  backup_imported: 'Imported a workspace backup',
  'auth.login': 'Signed in',
  'auth.password_changed': 'Changed password',
  'auth.sessions_revoked': 'Signed out other sessions',
  'auth.mfa_enabled': 'Turned on two-factor authentication',
  'auth.mfa_disabled': 'Turned off two-factor authentication',
  'auth.mfa_recovery_regenerated': 'Regenerated MFA recovery codes',
  'auth.api_token_created': 'Created an API token',
  'auth.api_token_revoked': 'Revoked an API token',
}

const METHOD_LABELS: Record<string, string> = {
  password: 'password',
  google: 'Google',
  microsoft: 'Microsoft',
  oidc: 'OpenID Connect',
}

function describe(entry: WorkspaceAuditEntry) {
  const label = ACTION_LABELS[entry.action] ?? entry.action
  const meta = entry.meta ?? {}
  if (entry.action === 'member.invited' && meta.email) return `${label}: ${meta.email}${meta.role ? ` as ${meta.role}` : ''}`
  if (entry.action === 'member.role_changed' && meta.email) return `${label}: ${meta.email} (${meta.from} → ${meta.to})`
  if (entry.action === 'member.custom_role_changed' && meta.email) return `${label}: ${meta.email}`
  if ((entry.action === 'member.deactivated' || entry.action === 'member.reactivated' || entry.action === 'member.removed') && meta.email) {
    return `${label}: ${meta.email}`
  }
  if (entry.action === 'settings.updated' && Array.isArray(meta.fields)) {
    const fields = meta.fields as string[]
    if (fields.includes('sso')) return `${label}: SSO`
    if (fields.includes('requireMfa')) return `${label}: require MFA`
    return `${label}: ${fields.join(', ')}`
  }
  if (entry.action === 'plan.upgrade_requested' && meta.target) return `${label}: ${meta.target}`
  if (entry.action === 'plan.changed') {
    const from = meta.fromPlanName ?? 'none'
    const to = meta.toPlanName ?? 'unknown'
    return `${label}: ${from} → ${to}`
  }
  if (entry.action === 'auth.login') {
    const method = METHOD_LABELS[String(meta.method ?? 'password')] ?? String(meta.method ?? 'password')
    const parts = [label, `via ${method}`]
    if (meta.mfa) parts.push(meta.recovery ? 'MFA recovery code' : 'MFA')
    if (meta.ip) parts.push(`from ${meta.ip}`)
    return parts.join(' · ')
  }
  if (entry.action === 'auth.api_token_created' && meta.name) return `${label}: ${meta.name}`
  if ((entry.action === 'auth.sessions_revoked' || entry.action.startsWith('auth.')) && meta.ip) {
    return `${label} · from ${meta.ip}`
  }
  if ((entry.action.startsWith('webhook.') || entry.action.startsWith('scim.')) && meta.name) return `${label}: ${meta.name}`
  return label
}

function isAuth(entry: WorkspaceAuditEntry) {
  return entry.action.startsWith('auth.')
}

async function load(reset = true) {
  if (reset) {
    isLoading.value = true
    errorMessage.value = ''
  } else {
    isLoadingMore.value = true
  }
  try {
    const before = reset ? undefined : entries.value.at(-1)?.createdAt
    const params = {
      limit: 40,
      before,
      category: category.value === 'all' ? undefined : category.value,
    }
    const { entries: next } = await workspaceApi.auditLog(params)
    entries.value = reset ? next : [...entries.value, ...next]
    hasMore.value = next.length >= 40
  } catch (error) {
    errorMessage.value = getErrorMessage(error)
  } finally {
    isLoading.value = false
    isLoadingMore.value = false
  }
}

async function exportLog(format: 'csv' | 'jsonl') {
  isExporting.value = true
  try {
    await workspaceApi.exportAuditLog({
      category: category.value === 'all' ? undefined : category.value,
      format,
    })
    toast.success(format === 'jsonl' ? 'SIEM JSONL downloaded' : 'Audit log CSV downloaded')
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    isExporting.value = false
  }
}

watch(category, () => void load())
onMounted(() => void load())
</script>

<template>
  <Card>
    <CardHeader class="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
      <div class="space-y-1.5">
        <CardTitle>Audit log</CardTitle>
        <CardDescription>
          Organization changes plus sign-in and security events (password, SSO, MFA, sessions and API tokens). Export
          CSV for spreadsheets or CloudEvents JSONL for SIEM tools. Subscribe to
          <code class="text-xs">workspace.audit.created</code> webhooks for live streaming.
        </CardDescription>
      </div>
      <Toolbar variant="wrap" dense class="w-auto shrink-0">
        <Button variant="outline" size="sm" :loading="isExporting" :disabled="isLoading" @click="exportLog('csv')">
          <Download /> Export CSV
        </Button>
        <Button variant="outline" size="sm" :loading="isExporting" :disabled="isLoading" @click="exportLog('jsonl')">
          <Download /> Export JSONL
        </Button>
      </Toolbar>
    </CardHeader>
    <CardContent class="space-y-3">
      <Toolbar variant="wrap" dense role="tablist" aria-label="Audit categories">
        <button
          v-for="item in FILTERS"
          :key="item.value"
          type="button"
          role="tab"
          :aria-selected="category === item.value"
          class="rounded-lg border px-2.5 py-1.5 text-left text-xs transition-colors sm:px-3 sm:text-sm"
          :class="
            category === item.value
              ? 'border-primary/40 bg-primary/10 font-medium text-foreground'
              : 'border-border/70 text-muted-foreground hover:border-primary/25 hover:bg-accent/40'
          "
          @click="category = item.value"
        >
          <span class="flex items-center gap-1.5">
            <KeyRound v-if="item.value === 'auth'" class="size-3.5" />
            <Shield v-else-if="item.value === 'admin'" class="size-3.5" />
            <History v-else class="size-3.5" />
            {{ item.label }}
          </span>
          <span class="mt-0.5 block text-[10px] text-muted-foreground max-sm:hidden">{{ item.hint }}</span>
        </button>
      </Toolbar>

      <div v-if="isLoading" class="space-y-2">
        <Skeleton v-for="index in 6" :key="index" class="h-14 w-full" />
      </div>

      <div v-else-if="errorMessage" class="flex flex-wrap items-center justify-between gap-2 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
        <p>{{ errorMessage }}</p>
        <Button variant="outline" size="sm" @click="load()">Retry</Button>
      </div>

      <EmptyState
        v-else-if="!entries.length"
        :icon="category === 'auth' ? KeyRound : History"
        :title="category === 'auth' ? 'No sign-in events yet' : 'No activity yet'"
        :description="
          category === 'auth'
            ? 'Password and SSO sign-ins, MFA changes and session revokes will show up here.'
            : 'Invites, role changes, settings updates and sign-in events will show up here.'
        "
        class="py-12"
      />

      <ul v-else class="divide-y divide-border/60 overflow-hidden rounded-lg border border-border">
        <li v-for="entry in entries" :key="entry.id" class="flex items-start gap-3 px-3 py-3">
          <UserAvatar :user="entry.actor" size="sm" class="mt-0.5" />
          <div class="min-w-0 flex-1">
            <p class="text-sm">
              <span
                v-if="isAuth(entry)"
                class="mr-1.5 inline-flex items-center rounded bg-sky-500/15 px-1.5 py-px text-[10px] font-semibold text-sky-700 dark:text-sky-300"
              >
                Security
              </span>
              {{ describe(entry) }}
            </p>
            <p class="mt-0.5 text-xs text-muted-foreground">
              {{ entry.actor?.name ?? 'System' }}
              ·
              <time :datetime="entry.createdAt" :title="formatDateTime(entry.createdAt)">{{ timeAgo(entry.createdAt) }}</time>
              <template v-if="entry.meta?.userAgent">
                ·
                <span class="truncate" :title="String(entry.meta.userAgent)">{{ String(entry.meta.userAgent).slice(0, 48) }}{{ String(entry.meta.userAgent).length > 48 ? '…' : '' }}</span>
              </template>
            </p>
          </div>
        </li>
      </ul>

      <div v-if="hasMore" class="flex justify-center pt-1">
        <Button variant="outline" size="sm" :loading="isLoadingMore" @click="load(false)">Load older</Button>
      </div>
    </CardContent>
  </Card>
</template>

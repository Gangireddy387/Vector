<script setup lang="ts">
import { Download, History } from 'lucide-vue-next'
import { onMounted, ref } from 'vue'
import { toast } from 'vue-sonner'
import EmptyState from '@/components/common/EmptyState.vue'
import UserAvatar from '@/components/common/UserAvatar.vue'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDateTime, timeAgo } from '@/lib/format'
import { getErrorMessage } from '@/lib/http'
import { type WorkspaceAuditEntry, workspaceApi } from '../admin.api'

const entries = ref<WorkspaceAuditEntry[]>([])
const isLoading = ref(true)
const isLoadingMore = ref(false)
const isExporting = ref(false)
const errorMessage = ref('')
const hasMore = ref(false)

const ACTION_LABELS: Record<string, string> = {
  'member.invited': 'Invited a member',
  'member.role_changed': 'Changed a member’s role',
  'member.deactivated': 'Deactivated a member',
  'member.reactivated': 'Reactivated a member',
  'member.removed': 'Removed a member',
  'settings.updated': 'Updated organization settings',
  'settings.logo_updated': 'Updated the organization logo',
  'settings.logo_removed': 'Removed the organization logo',
  'plan.upgrade_requested': 'Requested a plan upgrade',
  'plan.changed': 'Changed the plan',
}

function describe(entry: WorkspaceAuditEntry) {
  const label = ACTION_LABELS[entry.action] ?? entry.action
  const meta = entry.meta ?? {}
  if (entry.action === 'member.invited' && meta.email) return `${label}: ${meta.email}${meta.role ? ` as ${meta.role}` : ''}`
  if (entry.action === 'member.role_changed' && meta.email) return `${label}: ${meta.email} (${meta.from} → ${meta.to})`
  if ((entry.action === 'member.deactivated' || entry.action === 'member.reactivated' || entry.action === 'member.removed') && meta.email) {
    return `${label}: ${meta.email}`
  }
  if (entry.action === 'settings.updated' && Array.isArray(meta.fields)) return `${label}: ${meta.fields.join(', ')}`
  if (entry.action === 'plan.upgrade_requested' && meta.target) return `${label}: ${meta.target}`
  if (entry.action === 'plan.changed') {
    const from = meta.fromPlanName ?? 'none'
    const to = meta.toPlanName ?? 'unknown'
    return `${label}: ${from} → ${to}`
  }
  return label
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
    const { entries: next } = await workspaceApi.auditLog({ limit: 40, before })
    entries.value = reset ? next : [...entries.value, ...next]
    hasMore.value = next.length >= 40
  } catch (error) {
    errorMessage.value = getErrorMessage(error)
  } finally {
    isLoading.value = false
    isLoadingMore.value = false
  }
}

async function exportCsv() {
  isExporting.value = true
  try {
    await workspaceApi.exportAuditLogCsv()
    toast.success('Audit log downloaded')
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    isExporting.value = false
  }
}

onMounted(() => void load())
</script>

<template>
  <Card>
    <CardHeader class="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
      <div class="space-y-1.5">
        <CardTitle>Audit log</CardTitle>
        <CardDescription>Admin actions in this organization — invites, role changes, settings and plan updates.</CardDescription>
      </div>
      <Button variant="outline" size="sm" :loading="isExporting" :disabled="isLoading" @click="exportCsv">
        <Download /> Export CSV
      </Button>
    </CardHeader>
    <CardContent class="space-y-3">
      <div v-if="isLoading" class="space-y-2">
        <Skeleton v-for="index in 6" :key="index" class="h-14 w-full" />
      </div>

      <div v-else-if="errorMessage" class="flex flex-wrap items-center justify-between gap-2 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
        <p>{{ errorMessage }}</p>
        <Button variant="outline" size="sm" @click="load()">Retry</Button>
      </div>

      <EmptyState
        v-else-if="!entries.length"
        :icon="History"
        title="No activity yet"
        description="Invites, role changes, deactivations and settings updates will show up here."
        class="py-12"
      />

      <ul v-else class="divide-y divide-border/60 overflow-hidden rounded-lg border border-border">
        <li v-for="entry in entries" :key="entry.id" class="flex items-start gap-3 px-3 py-3">
          <UserAvatar :user="entry.actor" size="sm" class="mt-0.5" />
          <div class="min-w-0 flex-1">
            <p class="text-sm">{{ describe(entry) }}</p>
            <p class="mt-0.5 text-xs text-muted-foreground">
              {{ entry.actor?.name ?? 'System' }}
              ·
              <time :datetime="entry.createdAt" :title="formatDateTime(entry.createdAt)">{{ timeAgo(entry.createdAt) }}</time>
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

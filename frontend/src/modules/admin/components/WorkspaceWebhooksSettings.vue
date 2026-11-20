<script setup lang="ts">
import { Check, Copy, Plus, Send, Trash2 } from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'
import { toast } from 'vue-sonner'
import FormField from '@/components/common/FormField.vue'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { getErrorMessage } from '@/lib/http'
import { useAuthStore } from '@/modules/auth/auth.store'
import { workspaceApi, type WebhookEndpointRow } from '../admin.api'

const EVENT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'issue.created', label: 'Issue created' },
  { value: 'issue.updated', label: 'Issue updated' },
  { value: 'issue.deleted', label: 'Issue deleted' },
  { value: 'comment.created', label: 'Comment created' },
  { value: 'issue.due_soon', label: 'Issue due soon' },
  { value: 'sprint.started', label: 'Sprint started' },
  { value: 'sprint.completed', label: 'Sprint completed' },
  { value: 'project.member_added', label: 'Project member added' },
  { value: 'workspace.audit.created', label: 'Audit event (SIEM)' },
]

const auth = useAuthStore()
const available = computed(() => auth.hasFeature('webhooks'))

const endpoints = ref<WebhookEndpointRow[]>([])
const loading = ref(false)
const creating = ref(false)
const testingId = ref<string | null>(null)
const deletingId = ref<string | null>(null)

const formName = ref('My integration')
const formUrl = ref('')
const formEvents = ref<string[]>(['issue.created', 'issue.updated', 'comment.created'])
const createdSecret = ref<string | null>(null)
const copied = ref(false)

function toggleEvent(value: string, on: boolean | 'indeterminate') {
  const checked = on === true
  if (checked) {
    if (!formEvents.value.includes(value)) formEvents.value = [...formEvents.value, value]
  } else {
    formEvents.value = formEvents.value.filter((event) => event !== value)
  }
}

async function load() {
  if (!available.value) return
  loading.value = true
  try {
    const data = await workspaceApi.webhooks()
    endpoints.value = data.endpoints
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void load()
})

async function createEndpoint() {
  if (!formUrl.value.trim() || formEvents.value.length === 0) {
    toast.error('Enter an HTTPS URL and select at least one event')
    return
  }
  creating.value = true
  createdSecret.value = null
  copied.value = false
  try {
    const row = await workspaceApi.createWebhook({
      name: formName.value.trim() || 'My integration',
      url: formUrl.value.trim(),
      events: formEvents.value,
    })
    createdSecret.value = row.secret
    endpoints.value = [
      {
        id: row.id,
        name: row.name,
        url: row.url,
        secretPrefix: row.secretPrefix,
        events: row.events,
        enabled: row.enabled,
        lastDeliveryAt: row.lastDeliveryAt,
        lastStatus: row.lastStatus,
        lastError: row.lastError,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      },
      ...endpoints.value,
    ]
    formUrl.value = ''
    toast.success('Webhook created — copy the signing secret now')
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    creating.value = false
  }
}

async function copySecret() {
  if (!createdSecret.value) return
  try {
    await navigator.clipboard.writeText(createdSecret.value)
    copied.value = true
    toast.success('Signing secret copied')
  } catch {
    toast.error('Could not copy to clipboard')
  }
}

async function setEnabled(endpoint: WebhookEndpointRow, enabled: boolean) {
  try {
    const updated = await workspaceApi.updateWebhook(endpoint.id, { enabled })
    endpoints.value = endpoints.value.map((row) => (row.id === endpoint.id ? { ...row, ...updated } : row))
  } catch (error) {
    toast.error(getErrorMessage(error))
  }
}

async function testDelivery(endpoint: WebhookEndpointRow) {
  testingId.value = endpoint.id
  try {
    const result = await workspaceApi.testWebhook(endpoint.id)
    endpoints.value = endpoints.value.map((row) => (row.id === endpoint.id ? { ...row, ...result } : row))
    toast.success(`Test delivered (${result.status})`)
  } catch (error) {
    toast.error(getErrorMessage(error))
    void load()
  } finally {
    testingId.value = null
  }
}

async function remove(endpointId: string) {
  deletingId.value = endpointId
  try {
    await workspaceApi.deleteWebhook(endpointId)
    endpoints.value = endpoints.value.filter((row) => row.id !== endpointId)
    toast.success('Webhook removed')
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    deletingId.value = null
  }
}

function eventLabel(value: string) {
  return EVENT_OPTIONS.find((option) => option.value === value)?.label ?? value
}
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle>Outbound webhooks</CardTitle>
      <CardDescription>
        <template v-if="available">
          Receive signed HTTPS POSTs when work changes. Verify
          <code class="text-xs">X-Vector-Signature</code> with the secret shown once at create.
        </template>
        <template v-else>Included on Pro and Enterprise (or when the portal turns webhooks on).</template>
      </CardDescription>
    </CardHeader>
    <CardContent v-if="!available" class="text-sm text-muted-foreground">
      Ask the portal administrator to enable outbound webhooks on this organization’s plan.
    </CardContent>
    <CardContent v-else class="space-y-5">
      <div v-if="createdSecret" class="rounded-xl border border-amber-500/40 bg-amber-500/5 px-3.5 py-3">
        <p class="text-sm font-medium">Signing secret (copy now)</p>
        <p class="mt-1 break-all font-mono text-xs">{{ createdSecret }}</p>
        <Button type="button" variant="outline" size="sm" class="mt-2" @click="copySecret">
          <Check v-if="copied" class="size-3.5" />
          <Copy v-else class="size-3.5" />
          {{ copied ? 'Copied' : 'Copy secret' }}
        </Button>
      </div>

      <div class="space-y-3 rounded-xl border border-border/70 p-3.5">
        <p class="text-sm font-medium">Add endpoint</p>
        <FormField label="Name">
          <Input v-model="formName" maxlength="80" placeholder="CI bridge" />
        </FormField>
        <FormField label="HTTPS URL">
          <Input v-model="formUrl" type="url" placeholder="https://example.com/hooks/vector" />
        </FormField>
        <div class="space-y-2">
          <p class="text-xs font-medium text-muted-foreground">Events</p>
          <div class="grid gap-2 sm:grid-cols-2">
            <label
              v-for="option in EVENT_OPTIONS"
              :key="option.value"
              class="flex cursor-pointer items-start gap-2 text-sm"
            >
              <Checkbox
                class="mt-0.5"
                :checked="formEvents.includes(option.value)"
                @update:checked="(value) => toggleEvent(option.value, value)"
              />
              <span>{{ option.label }}</span>
            </label>
          </div>
        </div>
        <Button type="button" size="sm" :loading="creating" @click="createEndpoint">
          <Plus class="size-3.5" />
          Create webhook
        </Button>
      </div>

      <div v-if="loading" class="text-sm text-muted-foreground">Loading…</div>
      <ul v-else-if="endpoints.length" class="divide-y overflow-hidden border">
        <li v-for="endpoint in endpoints" :key="endpoint.id" class="space-y-2 bg-card px-3.5 py-3">
          <div class="flex flex-wrap items-start justify-between gap-2">
            <div class="min-w-0">
              <p class="truncate text-sm font-medium">{{ endpoint.name }}</p>
              <p class="truncate font-mono text-xs text-muted-foreground">{{ endpoint.url }}</p>
              <p class="mt-1 text-xs text-muted-foreground">
                Secret {{ endpoint.secretPrefix }}…
                <span v-if="endpoint.lastDeliveryAt">
                  · Last delivery
                  {{ new Date(endpoint.lastDeliveryAt).toLocaleString() }}
                  <template v-if="endpoint.lastStatus"> ({{ endpoint.lastStatus }})</template>
                </span>
              </p>
              <p v-if="endpoint.lastError" class="mt-0.5 text-xs text-destructive">{{ endpoint.lastError }}</p>
              <p class="mt-1 text-xs text-muted-foreground">
                {{ endpoint.events.map(eventLabel).join(', ') }}
              </p>
            </div>
            <div class="flex shrink-0 items-center gap-2">
              <Switch
                :model-value="endpoint.enabled"
                @update:model-value="(value: boolean) => setEnabled(endpoint, value)"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                :loading="testingId === endpoint.id"
                @click="testDelivery(endpoint)"
              >
                <Send class="size-3.5" />
                Test
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                :loading="deletingId === endpoint.id"
                aria-label="Delete webhook"
                @click="remove(endpoint.id)"
              >
                <Trash2 class="size-3.5 text-destructive" />
              </Button>
            </div>
          </div>
        </li>
      </ul>
      <p v-else class="text-sm text-muted-foreground">No webhook endpoints yet.</p>
    </CardContent>
  </Card>
</template>

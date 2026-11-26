<script setup lang="ts">
import { Check, Copy, Plus, Trash2 } from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'
import { toast } from 'vue-sonner'
import FormField from '@/components/common/FormField.vue'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { getErrorMessage } from '@/lib/http'
import { useAuthStore } from '@/modules/auth/auth.store'
import { workspaceApi } from '../admin.api'

type ScimTokenRow = { id: string; name: string; prefix: string; lastUsedAt: string | null; createdAt: string }

const auth = useAuthStore()
const available = computed(() => auth.hasFeature('scim'))

const tokens = ref<ScimTokenRow[]>([])
const baseUrl = ref<string | null>(null)
const loading = ref(false)
const creating = ref(false)
const tokenName = ref('IdP provisioning')
const createdToken = ref<string | null>(null)
const copied = ref(false)
const revokingId = ref<string | null>(null)

async function load() {
  if (!available.value) return
  loading.value = true
  try {
    const data = await workspaceApi.scimTokens()
    tokens.value = data.tokens
    baseUrl.value = data.baseUrl
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void load()
})

async function createToken() {
  creating.value = true
  createdToken.value = null
  copied.value = false
  try {
    const row = await workspaceApi.createScimToken(tokenName.value.trim() || 'IdP provisioning')
    createdToken.value = row.token
    baseUrl.value = row.baseUrl
    tokens.value = [{ id: row.id, name: row.name, prefix: row.prefix, lastUsedAt: row.lastUsedAt, createdAt: row.createdAt }, ...tokens.value]
    toast.success('SCIM token created — copy it now; it will not be shown again')
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    creating.value = false
  }
}

async function copyToken() {
  if (!createdToken.value) return
  try {
    await navigator.clipboard.writeText(createdToken.value)
    copied.value = true
    toast.success('Token copied')
  } catch {
    toast.error('Could not copy to clipboard')
  }
}

async function copyBaseUrl() {
  if (!baseUrl.value) return
  try {
    await navigator.clipboard.writeText(baseUrl.value)
    toast.success('SCIM base URL copied')
  } catch {
    toast.error('Could not copy to clipboard')
  }
}

async function revoke(tokenId: string) {
  revokingId.value = tokenId
  try {
    await workspaceApi.revokeScimToken(tokenId)
    tokens.value = tokens.value.filter((row) => row.id !== tokenId)
    toast.success('SCIM token revoked')
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    revokingId.value = null
  }
}
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle>SCIM provisioning</CardTitle>
      <CardDescription>
        <template v-if="available">
          Sync people and groups from Okta, Entra ID, or another SCIM 2.0 IdP. Users map to organization members; Groups map
          to Teams (created under a “SCIM” department).
        </template>
        <template v-else>Included on Enterprise (or when the portal turns SCIM on for this organization).</template>
      </CardDescription>
    </CardHeader>
    <CardContent v-if="!available" class="text-sm text-muted-foreground">
      Ask the portal administrator to enable SCIM provisioning on this organization’s plan.
    </CardContent>
    <CardContent v-else class="space-y-4">
      <div v-if="baseUrl" class="rounded-xl border border-border/70 px-3.5 py-3">
        <p class="text-sm font-medium">Tenant URL</p>
        <p class="mt-1 break-all font-mono text-xs text-muted-foreground">{{ baseUrl }}</p>
        <p class="mt-1 text-xs text-muted-foreground">Users: {{ baseUrl }}/Users · Groups: {{ baseUrl }}/Groups</p>
        <Button type="button" variant="outline" size="sm" class="mt-2" @click="copyBaseUrl">
          <Copy class="size-3.5" />
          Copy base URL
        </Button>
      </div>

      <div class="flex flex-col gap-2 sm:flex-row sm:items-end">
        <FormField label="Token name" for="scim-token-name" class="min-w-0 flex-1">
          <Input id="scim-token-name" v-model="tokenName" placeholder="Okta" :disabled="creating" autocomplete="off" />
        </FormField>
        <Button type="button" :loading="creating" :disabled="loading" @click="createToken">
          <Plus class="size-4" />
          Generate token
        </Button>
      </div>

      <div v-if="createdToken" class="rounded-xl border border-primary/30 bg-primary/5 px-3.5 py-3">
        <p class="text-sm font-medium">New token (shown once)</p>
        <p class="mt-1 break-all font-mono text-xs">{{ createdToken }}</p>
        <Button type="button" variant="outline" size="sm" class="mt-2" @click="copyToken">
          <Check v-if="copied" class="size-3.5" />
          <Copy v-else class="size-3.5" />
          {{ copied ? 'Copied' : 'Copy token' }}
        </Button>
      </div>

      <div v-if="tokens.length" class="space-y-2">
        <p class="text-sm font-medium">Active tokens</p>
        <ul class="divide-y divide-border/70 rounded-xl border border-border/70">
          <li v-for="row in tokens" :key="row.id" class="flex items-center justify-between gap-3 px-3.5 py-2.5">
            <div class="min-w-0">
              <p class="truncate text-sm font-medium">{{ row.name }}</p>
              <p class="truncate font-mono text-xs text-muted-foreground">{{ row.prefix }}…</p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              class="shrink-0 text-destructive"
              :loading="revokingId === row.id"
              :aria-label="`Revoke ${row.name}`"
              @click="revoke(row.id)"
            >
              <Trash2 class="size-4" />
            </Button>
          </li>
        </ul>
      </div>
      <p v-else-if="!loading" class="text-sm text-muted-foreground">No SCIM tokens yet.</p>
    </CardContent>
  </Card>
</template>

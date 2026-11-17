<script setup lang="ts">
import { Copy, KeyRound, Trash2 } from 'lucide-vue-next'
import { onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { toast } from 'vue-sonner'
import FormField from '@/components/common/FormField.vue'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { useConfirm } from '@/composables/useConfirm'
import { formatDateTime, timeAgo } from '@/lib/format'
import { getErrorMessage } from '@/lib/http'
import { authApi, type ApiTokenInfo } from '@/modules/auth/auth.api'

const confirm = useConfirm()
const tokens = ref<ApiTokenInfo[] | null>(null)
const name = ref('')
const isCreating = ref(false)
const createdSecret = ref<string | null>(null)
const busyId = ref<string | null>(null)

async function load() {
  try {
    tokens.value = await authApi.listApiTokens()
  } catch (error) {
    tokens.value = []
    toast.error(getErrorMessage(error))
  }
}

onMounted(() => void load())

async function createToken() {
  isCreating.value = true
  try {
    const result = await authApi.createApiToken({ name: name.value.trim(), expiresInDays: 90 })
    createdSecret.value = result.token
    name.value = ''
    await load()
    toast.success('API token created', { description: 'Copy it now — it won’t be shown again.' })
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    isCreating.value = false
  }
}

async function copySecret() {
  if (!createdSecret.value) return
  await navigator.clipboard.writeText(createdSecret.value)
  toast.success('Token copied')
}

async function revoke(token: ApiTokenInfo) {
  const ok = await confirm({
    title: `Revoke “${token.name}”?`,
    description: 'Scripts using this token will stop working immediately.',
    confirmLabel: 'Revoke',
    destructive: true,
  })
  if (!ok) return
  busyId.value = token.id
  try {
    await authApi.revokeApiToken(token.id)
    tokens.value = (tokens.value ?? []).filter((item) => item.id !== token.id)
    toast.success('Token revoked')
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    busyId.value = null
  }
}
</script>

<template>
  <Card class="gap-3">
    <CardHeader class="border-b border-border/60 pb-3">
      <CardTitle class="flex items-center gap-2"><KeyRound class="size-4" /> API tokens</CardTitle>
      <CardDescription>
        Personal Bearer tokens for scripts and integrations. Use
        <code class="rounded bg-muted px-1 py-0.5 text-[11px]">Authorization: Bearer vtk_…</code>
        and the same organization header as the app. Quickstart:
        <RouterLink :to="{ name: 'developers' }" class="font-medium text-primary hover:underline">Developers</RouterLink>.
      </CardDescription>
    </CardHeader>
    <CardContent class="space-y-3">
      <div v-if="createdSecret" class="space-y-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3.5 py-3">
        <p class="text-sm font-medium">Copy this token now</p>
        <p class="break-all font-mono text-xs">{{ createdSecret }}</p>
        <Button size="sm" variant="outline" @click="copySecret"><Copy /> Copy</Button>
      </div>

      <form class="flex flex-wrap items-end gap-2" @submit.prevent="createToken">
        <FormField label="Token name" for="api-token-name" class="min-w-[12rem] flex-1">
          <Input id="api-token-name" v-model="name" placeholder="CI deploy" maxlength="80" required />
        </FormField>
        <Button type="submit" variant="outline" :loading="isCreating" :disabled="name.trim().length < 2">Create token</Button>
      </form>
      <p class="text-xs text-muted-foreground">New tokens expire in 90 days. You can have up to 20.</p>

      <div v-if="tokens === null" class="space-y-2">
        <Skeleton class="h-12 w-full rounded-xl" />
        <Skeleton class="h-12 w-full rounded-xl" />
      </div>
      <p v-else-if="!tokens.length" class="text-sm text-muted-foreground">No tokens yet.</p>
      <ul v-else class="divide-y divide-border/70 overflow-hidden rounded-xl border border-border/70">
        <li v-for="token in tokens" :key="token.id" class="flex flex-wrap items-center gap-3 px-3.5 py-3">
          <span class="min-w-0 flex-1">
            <span class="block text-sm font-medium">{{ token.name }}</span>
            <span class="mt-0.5 block text-xs text-muted-foreground">
              {{ token.prefix }}…
              · created
              <time :datetime="token.createdAt" :title="formatDateTime(token.createdAt)">{{ timeAgo(token.createdAt) }}</time>
              <template v-if="token.lastUsedAt">
                · last used
                <time :datetime="token.lastUsedAt" :title="formatDateTime(token.lastUsedAt)">{{ timeAgo(token.lastUsedAt) }}</time>
              </template>
              <template v-if="token.expiresAt">
                · expires
                <time :datetime="token.expiresAt">{{ formatDateTime(token.expiresAt) }}</time>
              </template>
            </span>
          </span>
          <Button size="sm" variant="ghost" :loading="busyId === token.id" @click="revoke(token)"><Trash2 /> Revoke</Button>
        </li>
      </ul>
    </CardContent>
  </Card>
</template>

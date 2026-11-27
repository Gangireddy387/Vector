<script setup lang="ts">
import { Check, Copy, AppWindow, KeyRound, Link2, Plus, RefreshCw, Trash2 } from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'
import { toast } from 'vue-sonner'
import FormField from '@/components/common/FormField.vue'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { useConfirm } from '@/composables/useConfirm'
import { getErrorMessage } from '@/lib/http'
import { useAuthStore } from '@/modules/auth/auth.store'
import { workspaceApi, type EmbedAppRow } from '../admin.api'

const auth = useAuthStore()
const confirm = useConfirm()
const available = computed(() => auth.hasFeature('embedWorkspace'))

const apps = ref<EmbedAppRow[]>([])
const loading = ref(false)
const creating = ref(false)
const formName = ref('Partner app')
const revealedSecret = ref<string | null>(null)
const revealedForId = ref<string | null>(null)
const copied = ref('')
const showDeveloperHelp = ref(false)

/**
 * Absolute API base for partners to paste.
 * Prefer VITE_PUBLIC_API_BASE (e.g. http://localhost:4000/api) so partner servers are not blocked by Vite’s self-signed HTTPS.
 */
const apiBase = computed(() => {
  const publicBase = String(import.meta.env.VITE_PUBLIC_API_BASE || '').trim()
  if (/^https?:\/\//i.test(publicBase)) return publicBase.replace(/\/$/, '')
  const raw = String(import.meta.env.VITE_API_URL || '/api').trim() || '/api'
  if (/^https?:\/\//i.test(raw)) return raw.replace(/\/$/, '')
  const path = raw.startsWith('/') ? raw : `/${raw}`
  return `${window.location.origin}${path}`.replace(/\/$/, '')
})

const appUrl = computed(() => window.location.origin)
const connectUrl = computed(() => `${apiBase.value}/embed/connect`)
const loaderUrl = computed(() => `${appUrl.value}/embed.js`)

const shareFields = computed(() => [
  {
    key: 'appUrl',
    label: 'Website address',
    plain: 'Where Vector opens in the browser.',
    value: appUrl.value,
  },
  {
    key: 'apiBase',
    label: 'API address',
    plain: 'Where the partner app sends the connect request.',
    value: apiBase.value,
  },
  {
    key: 'connectUrl',
    label: 'Connect link',
    plain: 'Full address for the partner connect form (email, password, keys).',
    value: connectUrl.value,
  },
])

const snippet = computed(() => {
  const sk = revealedSecret.value || 'sk_live_YOUR_SECRET'
  const realPk = apps.value[0]?.publishableKey || 'pk_live_YOUR_KEY'
  return `const res = await fetch('${connectUrl.value}', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'admin@company.com',
    password: 'your-password',
    publishableKey: '${realPk}',
    secretKey: '${sk}',
  }),
});
const { embedUrl } = await res.json();
// Load ${loaderUrl.value} then:
VectorEmbed.mount('#vector-root', { url: embedUrl });`
})

async function load() {
  if (!available.value) return
  loading.value = true
  try {
    apps.value = (await workspaceApi.embedApps()).apps
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void load()
})

async function copyText(value: string, key: string, label?: string) {
  await navigator.clipboard.writeText(value)
  copied.value = key
  toast.success(label ? `${label} copied` : 'Copied')
  setTimeout(() => {
    if (copied.value === key) copied.value = ''
  }, 1500)
}

async function createApp() {
  creating.value = true
  revealedSecret.value = null
  try {
    const row = await workspaceApi.createEmbedApp({ name: formName.value.trim() || 'Partner app' })
    revealedSecret.value = row.secretKey
    revealedForId.value = row.id
    const { secretKey: _, ...publicRow } = row
    apps.value = [publicRow, ...apps.value]
    toast.success('Keys created — copy the secret key now')
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    creating.value = false
  }
}

async function rotateSecret(app: EmbedAppRow) {
  const ok = await confirm({
    title: `Make a new secret for “${app.name}”?`,
    description: 'The old secret stops working right away. Give the new secret to your partner.',
    confirmLabel: 'Make new secret',
    destructive: true,
  })
  if (!ok) return
  try {
    const row = await workspaceApi.rotateEmbedSecret(app.id)
    revealedSecret.value = row.secretKey
    revealedForId.value = app.id
    apps.value = apps.value.map((item) => (item.id === app.id ? { ...item, secretPrefix: row.secretPrefix } : item))
    toast.success('New secret ready — copy it now')
  } catch (error) {
    toast.error(getErrorMessage(error))
  }
}

async function toggleEnabled(app: EmbedAppRow, enabled: boolean) {
  try {
    const row = await workspaceApi.updateEmbedApp(app.id, { enabled })
    apps.value = apps.value.map((item) => (item.id === app.id ? row : item))
  } catch (error) {
    toast.error(getErrorMessage(error))
  }
}

async function removeApp(app: EmbedAppRow) {
  const ok = await confirm({
    title: `Remove “${app.name}”?`,
    description: 'Partners using these keys will no longer be able to open Vector.',
    confirmLabel: 'Remove',
    destructive: true,
  })
  if (!ok) return
  try {
    await workspaceApi.deleteEmbedApp(app.id)
    apps.value = apps.value.filter((item) => item.id !== app.id)
    if (revealedForId.value === app.id) {
      revealedSecret.value = null
      revealedForId.value = null
    }
    toast.success('Removed')
  } catch (error) {
    toast.error(getErrorMessage(error))
  }
}
</script>

<template>
  <div class="space-y-4">
    <Card>
      <CardHeader class="space-y-1.5">
        <CardTitle class="flex items-center gap-2 text-base"><AppWindow class="size-4" /> Connect Vector to another app</CardTitle>
        <CardDescription class="text-[13px] leading-relaxed">
          Share the addresses and keys below with your partner. Their admin signs in once with email and password, then
          invites the team in Vector.
        </CardDescription>
      </CardHeader>
      <CardContent class="space-y-5">
        <p v-if="!available" class="text-sm text-muted-foreground">This feature is not on your current plan.</p>

        <template v-else>
          <!-- Steps -->
          <ol class="grid gap-2 sm:grid-cols-3">
            <li class="rounded-lg border border-border/80 bg-muted/25 px-3 py-2.5">
              <p class="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Step 1</p>
              <p class="mt-1 text-[13px] font-medium text-foreground">Copy addresses</p>
              <p class="mt-0.5 text-xs leading-snug text-muted-foreground">Website and API links for the partner.</p>
            </li>
            <li class="rounded-lg border border-border/80 bg-muted/25 px-3 py-2.5">
              <p class="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Step 2</p>
              <p class="mt-1 text-[13px] font-medium text-foreground">Create keys</p>
              <p class="mt-0.5 text-xs leading-snug text-muted-foreground">Name the partner app and create two keys.</p>
            </li>
            <li class="rounded-lg border border-border/80 bg-muted/25 px-3 py-2.5">
              <p class="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Step 3</p>
              <p class="mt-1 text-[13px] font-medium text-foreground">Partner connects</p>
              <p class="mt-0.5 text-xs leading-snug text-muted-foreground">Admin email, password, and both keys.</p>
            </li>
          </ol>

          <!-- Addresses -->
          <section class="space-y-2.5">
            <div class="flex items-center gap-2">
              <Link2 class="size-3.5 text-muted-foreground" />
              <h3 class="text-sm font-semibold text-foreground">Addresses to share</h3>
            </div>
            <div class="overflow-hidden rounded-xl border border-border/80">
              <div
                v-for="(field, index) in shareFields"
                :key="field.key"
                class="grid gap-2 px-3 py-3 sm:grid-cols-[9.5rem_minmax(0,1fr)_auto] sm:items-center sm:gap-3"
                :class="index > 0 && 'border-t border-border/70'"
              >
                <div class="min-w-0">
                  <p class="text-[13px] font-medium text-foreground">{{ field.label }}</p>
                  <p class="text-[11px] leading-snug text-muted-foreground">{{ field.plain }}</p>
                </div>
                <code
                  class="block min-w-0 truncate rounded-md bg-muted/50 px-2.5 py-2 font-mono text-[12px] text-foreground"
                  :title="field.value"
                >{{ field.value }}</code>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  class="w-full sm:w-auto"
                  @click="copyText(field.value, field.key, field.label)"
                >
                  <Check v-if="copied === field.key" class="size-3.5" />
                  <Copy v-else class="size-3.5" />
                  Copy
                </Button>
              </div>
            </div>
          </section>

          <!-- Keys -->
          <section class="space-y-2.5">
            <div class="flex items-center gap-2">
              <KeyRound class="size-3.5 text-muted-foreground" />
              <h3 class="text-sm font-semibold text-foreground">Keys for a partner</h3>
            </div>

            <div v-if="revealedSecret" class="rounded-xl border border-amber-500/35 bg-amber-500/10 px-3 py-3">
              <p class="text-[13px] font-medium text-foreground">Secret key — copy now</p>
              <p class="mt-0.5 text-[11px] text-muted-foreground">Shown only once. Keep it private.</p>
              <div class="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <code class="block truncate rounded-md bg-background px-2.5 py-2 font-mono text-[12px]">{{ revealedSecret }}</code>
                <Button type="button" size="sm" variant="outline" @click="copyText(revealedSecret!, 'secret', 'Secret key')">
                  <Check v-if="copied === 'secret'" class="size-3.5" />
                  <Copy v-else class="size-3.5" />
                  Copy secret
                </Button>
              </div>
            </div>

            <div class="grid gap-2 rounded-xl border border-border/80 p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
              <FormField label="Partner app name" for="embed-app-name">
                <Input id="embed-app-name" v-model="formName" placeholder="e.g. HRMS, Payroll portal" />
              </FormField>
              <Button type="button" variant="brand" class="w-full sm:w-auto" :loading="creating" @click="createApp">
                <Plus class="size-3.5" /> Create keys
              </Button>
            </div>

            <p v-if="loading" class="text-sm text-muted-foreground">Loading…</p>
            <div
              v-else-if="!apps.length"
              class="rounded-xl border border-dashed border-border/80 px-4 py-8 text-center text-sm text-muted-foreground"
            >
              No partner keys yet. Create keys, then share them with your partner.
            </div>

            <ul v-else class="space-y-2">
              <li v-for="app in apps" :key="app.id" class="rounded-xl border border-border/80 p-3">
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <div class="min-w-0">
                    <p class="font-medium text-foreground">{{ app.name }}</p>
                    <p class="text-[11px] text-muted-foreground">
                      {{ app.enabled ? 'Connection on' : 'Connection off' }}
                      · Secret starts with {{ app.secretPrefix }}…
                    </p>
                  </div>
                  <div class="flex items-center gap-2">
                    <span class="text-xs text-muted-foreground">{{ app.enabled ? 'On' : 'Off' }}</span>
                    <Switch :checked="app.enabled" @update:checked="(value) => toggleEnabled(app, value)" />
                  </div>
                </div>

                <div class="mt-3 grid gap-2 sm:grid-cols-[5.5rem_minmax(0,1fr)_auto] sm:items-center">
                  <p class="text-[12px] font-medium text-muted-foreground">Public key</p>
                  <code class="block truncate rounded-md bg-muted/50 px-2.5 py-2 font-mono text-[11px]" :title="app.publishableKey">
                    {{ app.publishableKey }}
                  </code>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    class="w-full sm:w-auto"
                    @click="copyText(app.publishableKey, `pk-${app.id}`, 'Public key')"
                  >
                    <Check v-if="copied === `pk-${app.id}`" class="size-3.5" />
                    <Copy v-else class="size-3.5" />
                    Copy
                  </Button>
                </div>

                <div class="mt-3 flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="outline" @click="rotateSecret(app)">
                    <RefreshCw class="size-3.5" /> New secret key
                  </Button>
                  <Button type="button" size="sm" variant="ghost" class="text-destructive" @click="removeApp(app)">
                    <Trash2 class="size-3.5" /> Remove
                  </Button>
                </div>
              </li>
            </ul>
          </section>

          <!-- Developer help (collapsed) -->
          <section class="rounded-xl border border-border/80">
            <button
              type="button"
              class="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-[13px] font-medium text-foreground"
              @click="showDeveloperHelp = !showDeveloperHelp"
            >
              For developers (optional)
              <span class="text-xs font-normal text-muted-foreground">{{ showDeveloperHelp ? 'Hide' : 'Show' }}</span>
            </button>
            <div v-if="showDeveloperHelp" class="space-y-2 border-t border-border/70 px-3 py-3">
              <p class="text-xs text-muted-foreground">
                Partner form fields: admin email, password, public key, secret key →
                <code class="text-[11px]">POST</code> to the connect link. Loader:
                <code class="text-[11px]">{{ loaderUrl }}</code>
              </p>
              <div class="flex items-center justify-between gap-2">
                <p class="text-[12px] font-medium">Example code</p>
                <Button type="button" size="sm" variant="outline" @click="copyText(snippet, 'snippet', 'Example code')">
                  <Check v-if="copied === 'snippet'" class="size-3.5" />
                  <Copy v-else class="size-3.5" />
                  Copy
                </Button>
              </div>
              <pre class="overflow-x-auto rounded-lg bg-muted/40 p-3 text-[11px] leading-relaxed whitespace-pre-wrap">{{ snippet }}</pre>
            </div>
          </section>
        </template>
      </CardContent>
    </Card>
  </div>
</template>

<script setup lang="ts">
import { Check, Copy, AppWindow, CircleCheck, Clock, Code2, KeyRound, Link2, Plus, RefreshCw, Trash2 } from 'lucide-vue-next'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { toast } from 'vue-sonner'
import FormField from '@/components/common/FormField.vue'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useConfirm } from '@/composables/useConfirm'
import { formatDateTime, timeAgo } from '@/lib/format'
import { getErrorMessage } from '@/lib/http'
import { useAuthStore } from '@/modules/auth/auth.store'
import { workspaceApi, type EmbedAppRow, type EmbedSettings } from '../admin.api'

type EmbedTab = 'addresses' | 'keys' | 'connect' | 'developers'

const auth = useAuthStore()
const confirm = useConfirm()
const available = computed(() => auth.hasFeature('embedWorkspace'))

const apps = ref<EmbedAppRow[]>([])
const settings = ref<EmbedSettings | null>(null)
const loading = ref(false)
const refreshing = ref(false)
const savingSession = ref(false)
const creating = ref(false)
const formName = ref('Partner app')
const revealedSecret = ref<string | null>(null)
const revealedForId = ref<string | null>(null)
const copied = ref('')
const activeTab = ref<EmbedTab>('addresses')
const tabInitialized = ref(false)

const connectedApps = computed(() => apps.value.filter((app) => Boolean(app.lastUsedAt) && app.enabled))
const anyConnected = computed(() => connectedApps.value.length > 0)
const hasKeys = computed(() => apps.value.length > 0)
const latestConnectAt = computed(() => {
  const times = connectedApps.value
    .map((app) => (app.lastUsedAt ? new Date(app.lastUsedAt).getTime() : 0))
    .filter((t) => t > 0)
  if (!times.length) return null
  return new Date(Math.max(...times)).toISOString()
})

function suggestedTab(): EmbedTab {
  if (!hasKeys.value) return 'keys'
  if (!anyConnected.value) return 'connect'
  return 'connect'
}

function connectionLabel(app: EmbedAppRow) {
  if (!app.enabled) return 'Connection off'
  if (app.lastUsedAt) return `Connected · last open ${timeAgo(app.lastUsedAt)}`
  return 'Waiting for partner to connect'
}

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
const sessionLengthLabel = computed(() => settings.value?.sessionExpiresInLabel || '7 days')

const PRESET_VALUES = new Set(['1h', '12h', '1d', '7d', '30d'])
const sessionMode = ref<'preset' | 'custom'>('preset')
const sessionPreset = ref('7d')
const customAmount = ref(2)
const customUnit = ref<'m' | 'h' | 'd'>('d')

function parseSessionValue(value: string) {
  const match = /^(\d+)([mhd])$/.exec(value)
  if (!match) return null
  return { amount: Number(match[1]), unit: match[2] as 'm' | 'h' | 'd' }
}

function applySettingsToForm(next: EmbedSettings) {
  settings.value = next
  if (PRESET_VALUES.has(next.sessionExpiresIn)) {
    sessionMode.value = 'preset'
    sessionPreset.value = next.sessionExpiresIn
    return
  }
  const parsed = parseSessionValue(next.sessionExpiresIn)
  sessionMode.value = 'custom'
  sessionPreset.value = 'custom'
  if (parsed) {
    customAmount.value = parsed.amount
    customUnit.value = parsed.unit
  }
}

function onSessionSelect(value: string) {
  if (value === 'custom') {
    sessionMode.value = 'custom'
    sessionPreset.value = 'custom'
    return
  }
  sessionMode.value = 'preset'
  sessionPreset.value = value
}

const customSessionValue = computed(() => `${Math.max(1, Number(customAmount.value) || 1)}${customUnit.value}`)

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

async function load(opts?: { quiet?: boolean }) {
  if (!available.value) return
  if (opts?.quiet) refreshing.value = true
  else loading.value = true
  try {
    const data = await workspaceApi.embedApps()
    apps.value = data.apps
    applySettingsToForm(data.settings)
    if (!tabInitialized.value) {
      activeTab.value = suggestedTab()
      tabInitialized.value = true
    }
  } catch (error) {
    if (!opts?.quiet) toast.error(getErrorMessage(error))
  } finally {
    loading.value = false
    refreshing.value = false
  }
}

let pollTimer: ReturnType<typeof setInterval> | null = null

function startPolling() {
  stopPolling()
  pollTimer = setInterval(() => {
    if (!available.value || document.hidden) return
    if (apps.value.length && !anyConnected.value) void load({ quiet: true })
  }, 12_000)
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

async function saveSessionLength() {
  const sessionExpiresIn = sessionMode.value === 'custom' ? customSessionValue.value : sessionPreset.value
  if (sessionMode.value === 'custom') {
    const amount = Number(customAmount.value)
    if (!Number.isFinite(amount) || amount < 1) {
      toast.error('Enter a custom length of at least 1')
      return
    }
    if (customUnit.value === 'm' && amount < 15) {
      toast.error('Custom minutes must be at least 15')
      return
    }
    if (customUnit.value === 'd' && amount > 90) {
      toast.error('Custom days can be at most 90')
      return
    }
  }
  savingSession.value = true
  try {
    applySettingsToForm(await workspaceApi.updateEmbedSettings({ sessionExpiresIn }))
    toast.success(`Connect sessions now last ${settings.value?.sessionExpiresInLabel}`)
  } catch (error) {
    toast.error(getErrorMessage(error))
    await load()
  } finally {
    savingSession.value = false
  }
}

onMounted(() => {
  void load().then(() => startPolling())
})

onUnmounted(() => {
  stopPolling()
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
    if (enabled) {
      toast.success(`“${app.name}” keys are on — partner can connect again`)
    } else {
      toast.success(`“${app.name}” turned off — partner sessions ended`)
    }
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
      <CardHeader class="space-y-1.5 border-b border-border/60 pb-4">
        <CardTitle class="flex items-center gap-2 text-base">
          <AppWindow class="size-4" />
          Connect Vector to another app
        </CardTitle>
        <CardDescription class="text-[13px] leading-relaxed">
          Use the tabs below: share addresses, create keys, then wait for the partner to connect.
        </CardDescription>
      </CardHeader>

      <CardContent class="space-y-4 pt-5">
        <p v-if="!available" class="text-sm text-muted-foreground">This feature is not on your current plan.</p>

        <template v-else>
          <!-- Status always visible -->
          <section
            class="rounded-xl border px-3.5 py-3"
            :class="
              anyConnected
                ? 'border-emerald-500/35 bg-emerald-500/10'
                : hasKeys
                  ? 'border-amber-500/35 bg-amber-500/10'
                  : 'border-border/80 bg-muted/25'
            "
          >
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div class="min-w-0 flex items-center gap-2.5">
                <CircleCheck
                  v-if="anyConnected"
                  class="size-4 shrink-0 text-emerald-600 dark:text-emerald-400"
                />
                <Clock v-else class="size-4 shrink-0 text-muted-foreground" />
                <div class="min-w-0">
                  <p class="text-[13px] font-semibold text-foreground">
                    <template v-if="anyConnected">Connection established</template>
                    <template v-else-if="hasKeys">Waiting for partner to connect</template>
                    <template v-else>No connection yet</template>
                  </p>
                  <p class="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                    <template v-if="anyConnected && latestConnectAt">
                      Partner opened Vector
                      <time :datetime="latestConnectAt" :title="formatDateTime(latestConnectAt)">{{
                        timeAgo(latestConnectAt)
                      }}</time
                      >.
                      <span v-if="connectedApps.length > 1"> {{ connectedApps.length }} apps have connected.</span>
                    </template>
                    <template v-else-if="hasKeys">
                      Keys are ready. Open the Connect tab when you want session settings.
                    </template>
                    <template v-else> Start on the Addresses tab, then create keys. </template>
                  </p>
                </div>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                class="shrink-0"
                :loading="refreshing"
                :disabled="loading"
                @click="load({ quiet: true })"
              >
                <RefreshCw class="size-3.5" />
                Refresh status
              </Button>
            </div>
          </section>

          <Tabs v-model="activeTab" class="space-y-4">
            <TabsList
              class="h-auto min-h-10 w-full flex-wrap justify-start gap-1 rounded-xl border border-border/60 bg-muted/30 p-1.5"
            >
              <TabsTrigger value="addresses" class="h-9 flex-1 gap-1.5 px-3 sm:flex-none">
                <span
                  class="flex size-5 items-center justify-center rounded-full text-[10px] font-semibold"
                  :class="activeTab === 'addresses' ? 'bg-primary-foreground/20' : 'bg-muted-foreground/15'"
                >
                  <Check class="size-3" />
                </span>
                <Link2 class="size-3.5 shrink-0" />
                <span class="truncate">Addresses</span>
              </TabsTrigger>
              <TabsTrigger value="keys" class="h-9 flex-1 gap-1.5 px-3 sm:flex-none">
                <span
                  class="flex size-5 items-center justify-center rounded-full text-[10px] font-semibold"
                  :class="
                    hasKeys
                      ? activeTab === 'keys'
                        ? 'bg-primary-foreground/20'
                        : 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-400'
                      : activeTab === 'keys'
                        ? 'bg-primary-foreground/20'
                        : 'bg-muted-foreground/15'
                  "
                >
                  <Check v-if="hasKeys" class="size-3" />
                  <template v-else>2</template>
                </span>
                <KeyRound class="size-3.5 shrink-0" />
                <span class="truncate">Keys</span>
              </TabsTrigger>
              <TabsTrigger value="connect" class="h-9 flex-1 gap-1.5 px-3 sm:flex-none">
                <span
                  class="flex size-5 items-center justify-center rounded-full text-[10px] font-semibold"
                  :class="
                    anyConnected
                      ? activeTab === 'connect'
                        ? 'bg-primary-foreground/20'
                        : 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-400'
                      : activeTab === 'connect'
                        ? 'bg-primary-foreground/20'
                        : 'bg-muted-foreground/15'
                  "
                >
                  <Check v-if="anyConnected" class="size-3" />
                  <template v-else>3</template>
                </span>
                <Clock class="size-3.5 shrink-0" />
                <span class="truncate">Connect</span>
              </TabsTrigger>
              <TabsTrigger value="developers" class="h-9 flex-1 gap-1.5 px-3 sm:flex-none">
                <Code2 class="size-3.5 shrink-0" />
                <span class="truncate">Developers</span>
              </TabsTrigger>
            </TabsList>

            <!-- Addresses -->
            <TabsContent value="addresses" class="mt-0 space-y-3">
              <div class="rounded-xl border border-border/80">
                <div class="border-b border-border/70 bg-muted/20 px-3.5 py-3">
                  <p class="text-sm font-semibold text-foreground">Addresses to share</p>
                  <p class="mt-0.5 text-xs text-muted-foreground">Copy these three links and send them to your partner.</p>
                </div>
                <div>
                  <div
                    v-for="(field, index) in shareFields"
                    :key="field.key"
                    class="grid gap-2 px-3.5 py-3 sm:grid-cols-[11rem_minmax(0,1fr)_auto] sm:items-center sm:gap-3"
                    :class="index > 0 && 'border-t border-border/70'"
                  >
                    <div class="min-w-0">
                      <p class="text-[13px] font-medium text-foreground">{{ field.label }}</p>
                      <p class="text-[11px] leading-snug text-muted-foreground">{{ field.plain }}</p>
                    </div>
                    <code
                      class="block min-w-0 truncate rounded-md border border-border/60 bg-muted/40 px-2.5 py-2 font-mono text-[12px] text-foreground"
                      :title="field.value"
                      >{{ field.value }}</code
                    >
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
              </div>
              <div class="flex justify-end">
                <Button type="button" variant="brand" size="sm" @click="activeTab = 'keys'">
                  Next: Create keys
                </Button>
              </div>
            </TabsContent>

            <!-- Keys -->
            <TabsContent value="keys" class="mt-0 space-y-3">
              <div class="space-y-3 rounded-xl border border-border/80 p-3.5">
                <div>
                  <p class="text-sm font-semibold text-foreground">Keys for a partner</p>
                  <p class="mt-0.5 text-xs text-muted-foreground">
                    Create a public key and secret key. Share both with the partner securely.
                  </p>
                </div>

                <div v-if="revealedSecret" class="rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 py-3">
                  <p class="text-[13px] font-medium text-foreground">Secret key — copy now</p>
                  <p class="mt-0.5 text-[11px] text-muted-foreground">Shown only once. Keep it private.</p>
                  <div class="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                    <code
                      class="block truncate rounded-md border border-border/60 bg-background px-2.5 py-2 font-mono text-[12px]"
                      >{{ revealedSecret }}</code
                    >
                    <Button type="button" size="sm" variant="outline" @click="copyText(revealedSecret!, 'secret', 'Secret key')">
                      <Check v-if="copied === 'secret'" class="size-3.5" />
                      <Copy v-else class="size-3.5" />
                      Copy secret
                    </Button>
                  </div>
                </div>

                <div class="grid gap-2 rounded-lg border border-border/70 bg-muted/15 p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                  <FormField label="Partner app name" for="embed-app-name">
                    <Input id="embed-app-name" v-model="formName" placeholder="e.g. HRMS, Payroll portal" />
                  </FormField>
                  <Button type="button" variant="brand" class="w-full sm:w-auto" :loading="creating" @click="createApp">
                    <Plus class="size-3.5" />
                    Create keys
                  </Button>
                </div>

                <p v-if="loading" class="text-sm text-muted-foreground">Loading…</p>
                <div
                  v-else-if="!apps.length"
                  class="rounded-lg border border-dashed border-border/80 px-4 py-7 text-center text-sm text-muted-foreground"
                >
                  No partner keys yet. Create keys, then share them with your partner.
                </div>

                <ul v-else class="space-y-2.5">
                  <li v-for="app in apps" :key="app.id" class="rounded-lg border border-border/80 bg-background p-3">
                    <div class="flex flex-wrap items-center justify-between gap-2">
                      <div class="min-w-0">
                        <div class="flex flex-wrap items-center gap-2">
                          <p class="font-medium text-foreground">{{ app.name }}</p>
                          <span
                            class="rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase"
                            :class="
                              app.enabled && app.lastUsedAt
                                ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                                : app.enabled
                                  ? 'bg-amber-500/15 text-amber-800 dark:text-amber-400'
                                  : 'bg-muted text-muted-foreground'
                            "
                          >
                            {{ app.enabled && app.lastUsedAt ? 'Connected' : app.enabled ? 'Not connected' : 'Off' }}
                          </span>
                        </div>
                        <p class="mt-0.5 text-[11px] text-muted-foreground">
                          {{ connectionLabel(app) }} · Secret starts with {{ app.secretPrefix }}…
                        </p>
                        <p
                          v-if="app.lastUsedAt"
                          class="mt-0.5 text-[11px] text-muted-foreground"
                          :title="formatDateTime(app.lastUsedAt)"
                        >
                          Last successful connect
                          <time :datetime="app.lastUsedAt">{{ formatDateTime(app.lastUsedAt) }}</time>
                        </p>
                      </div>
                      <div class="flex flex-col items-end gap-0.5">
                        <div class="flex items-center gap-2">
                          <span class="text-xs text-muted-foreground">{{ app.enabled ? 'Access on' : 'Access off' }}</span>
                          <Switch
                            :model-value="app.enabled"
                            :aria-label="app.enabled ? 'Turn off partner access' : 'Turn on partner access'"
                            @update:model-value="(value) => toggleEnabled(app, Boolean(value))"
                          />
                        </div>
                        <p class="max-w-[11rem] text-right text-[10px] leading-snug text-muted-foreground">
                          {{ app.enabled ? 'Off ends partner sessions right away' : 'Turn on to allow connect again' }}
                        </p>
                      </div>
                    </div>

                    <div class="mt-3 grid gap-2 sm:grid-cols-[5.5rem_minmax(0,1fr)_auto] sm:items-center">
                      <p class="text-[12px] font-medium text-muted-foreground">Public key</p>
                      <code
                        class="block truncate rounded-md border border-border/60 bg-muted/40 px-2.5 py-2 font-mono text-[11px]"
                        :title="app.publishableKey"
                      >
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

                    <div class="mt-3 flex flex-wrap gap-2 border-t border-border/60 pt-3">
                      <Button type="button" size="sm" variant="outline" @click="rotateSecret(app)">
                        <RefreshCw class="size-3.5" />
                        New secret key
                      </Button>
                      <Button type="button" size="sm" variant="ghost" class="text-destructive" @click="removeApp(app)">
                        <Trash2 class="size-3.5" />
                        Remove
                      </Button>
                    </div>
                  </li>
                </ul>
              </div>
              <div class="flex flex-wrap justify-between gap-2">
                <Button type="button" variant="outline" size="sm" @click="activeTab = 'addresses'">Back</Button>
                <Button type="button" variant="brand" size="sm" @click="activeTab = 'connect'">Next: Connect</Button>
              </div>
            </TabsContent>

            <!-- Connect -->
            <TabsContent value="connect" class="mt-0 space-y-3">
              <div class="space-y-4 rounded-xl border border-border/80 p-3.5">
                <div>
                  <p class="text-sm font-semibold text-foreground">Partner connect &amp; session</p>
                  <p class="mt-0.5 text-xs text-muted-foreground">
                    Partner uses admin email, password, and both keys. Choose how long that session stays open.
                  </p>
                </div>

                <div
                  class="rounded-lg border px-3 py-2.5 text-xs leading-relaxed"
                  :class="
                    anyConnected
                      ? 'border-emerald-500/30 bg-emerald-500/10 text-foreground'
                      : 'border-border/70 bg-muted/20 text-muted-foreground'
                  "
                >
                  <template v-if="anyConnected && latestConnectAt">
                    <span class="font-medium text-foreground">Connected.</span>
                    Partner last opened Vector
                    <time :datetime="latestConnectAt" :title="formatDateTime(latestConnectAt)">{{
                      timeAgo(latestConnectAt)
                    }}</time
                    >.
                  </template>
                  <template v-else-if="hasKeys">
                    Waiting on the partner. Ask them to submit email, password, public key, and secret key to the connect
                    link.
                  </template>
                  <template v-else> Finish the Keys tab first — create keys, then the partner can connect. </template>
                </div>

                <div class="space-y-2.5">
                  <div>
                    <p class="text-[13px] font-medium text-foreground">How long a connect stays open</p>
                    <p class="mt-0.5 text-xs text-muted-foreground">
                      After connect, Vector stays signed in for this long. Current:
                      <span class="font-medium text-foreground">{{ sessionLengthLabel }}</span
                      >.
                    </p>
                  </div>
                  <div class="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                    <FormField label="Session length" for="embed-session-length">
                      <select
                        id="embed-session-length"
                        :value="sessionMode === 'custom' ? 'custom' : sessionPreset"
                        class="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30"
                        @change="onSessionSelect(($event.target as HTMLSelectElement).value)"
                      >
                        <option
                          v-for="option in settings?.sessionOptions || []"
                          :key="option.value"
                          :value="option.value"
                        >
                          {{ option.label }}
                        </option>
                      </select>
                    </FormField>
                    <Button
                      type="button"
                      variant="outline"
                      class="w-full sm:w-auto"
                      :loading="savingSession"
                      @click="saveSessionLength"
                    >
                      Save length
                    </Button>
                  </div>
                  <div v-if="sessionMode === 'custom'" class="grid grid-cols-[minmax(0,1fr)_8rem] gap-2 sm:max-w-md">
                    <FormField label="Custom amount" for="embed-session-amount">
                      <Input
                        id="embed-session-amount"
                        v-model.number="customAmount"
                        type="number"
                        min="1"
                        max="90"
                        inputmode="numeric"
                      />
                    </FormField>
                    <FormField label="Unit" for="embed-session-unit">
                      <select
                        id="embed-session-unit"
                        v-model="customUnit"
                        class="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30"
                      >
                        <option value="m">Minutes</option>
                        <option value="h">Hours</option>
                        <option value="d">Days</option>
                      </select>
                    </FormField>
                    <p class="col-span-2 text-[11px] text-muted-foreground">Minimum 15 minutes, maximum 90 days.</p>
                  </div>
                </div>
              </div>
              <div class="flex justify-start">
                <Button type="button" variant="outline" size="sm" @click="activeTab = 'keys'">Back</Button>
              </div>
            </TabsContent>

            <!-- Developers -->
            <TabsContent value="developers" class="mt-0">
              <div class="space-y-3 rounded-xl border border-border/80 p-3.5">
                <div>
                  <p class="text-sm font-semibold text-foreground">For developers</p>
                  <p class="mt-0.5 text-xs text-muted-foreground">
                    Partner form fields: admin email, password, public key, secret key →
                    <code class="text-[11px]">POST</code> to the connect link. Loader:
                    <code class="text-[11px]">{{ loaderUrl }}</code>
                  </p>
                </div>
                <div class="flex items-center justify-between gap-2">
                  <p class="text-[12px] font-medium">Example code</p>
                  <Button type="button" size="sm" variant="outline" @click="copyText(snippet, 'snippet', 'Example code')">
                    <Check v-if="copied === 'snippet'" class="size-3.5" />
                    <Copy v-else class="size-3.5" />
                    Copy
                  </Button>
                </div>
                <pre class="overflow-x-auto rounded-lg bg-muted/40 p-3 text-[11px] leading-relaxed whitespace-pre-wrap">{{
                  snippet
                }}</pre>
              </div>
            </TabsContent>
          </Tabs>
        </template>
      </CardContent>
    </Card>
  </div>
</template>

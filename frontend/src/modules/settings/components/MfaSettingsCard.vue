<script setup lang="ts">
import { Copy, ShieldCheck, ShieldOff } from 'lucide-vue-next'
import QRCode from 'qrcode'
import { computed, reactive, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import FormField from '@/components/common/FormField.vue'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { getErrorMessage } from '@/lib/http'
import { authApi } from '@/modules/auth/auth.api'
import PasswordInput from '@/modules/auth/components/PasswordInput.vue'
import { useAuthStore } from '@/modules/auth/auth.store'

const auth = useAuthStore()
const enabled = computed(() => Boolean(auth.user?.mfaEnabled))

const setup = ref<{ secret: string; otpauthUrl: string } | null>(null)
const qrDataUrl = ref<string | null>(null)
const recoveryCodes = ref<string[] | null>(null)
const confirmCode = ref('')
const disableForm = reactive({ password: '', code: '', recoveryCode: '', useRecovery: false })
const regenForm = reactive({ password: '', code: '' })
const busy = ref(false)

watch(
  () => setup.value?.otpauthUrl,
  async (url) => {
    qrDataUrl.value = null
    if (!url) return
    try {
      qrDataUrl.value = await QRCode.toDataURL(url, {
        errorCorrectionLevel: 'M',
        margin: 2,
        width: 200,
        color: { dark: '#0f172a', light: '#ffffff' },
      })
    } catch {
      qrDataUrl.value = null
    }
  },
)

async function startSetup() {
  busy.value = true
  try {
    setup.value = await authApi.setupMfa()
    recoveryCodes.value = null
    confirmCode.value = ''
    toast.success('Scan the QR code with your authenticator app')
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    busy.value = false
  }
}

async function confirmSetup() {
  busy.value = true
  try {
    const result = await authApi.confirmMfa(confirmCode.value.trim())
    auth.user = { ...auth.user!, ...result.user, mfaEnabled: true, mfaSetupRequired: false }
    recoveryCodes.value = result.recoveryCodes
    setup.value = null
    confirmCode.value = ''
    toast.success('Two-factor authentication is on')
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    busy.value = false
  }
}

async function disable() {
  busy.value = true
  try {
    const payload = disableForm.useRecovery
      ? { password: disableForm.password, recoveryCode: disableForm.recoveryCode.trim() }
      : { password: disableForm.password, code: disableForm.code.trim() }
    const user = await authApi.disableMfa(payload)
    auth.user = { ...auth.user!, ...user, mfaEnabled: false }
    Object.assign(disableForm, { password: '', code: '', recoveryCode: '', useRecovery: false })
    recoveryCodes.value = null
    toast.success('Two-factor authentication is off')
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    busy.value = false
  }
}

async function regenerate() {
  busy.value = true
  try {
    recoveryCodes.value = await authApi.regenerateMfaRecovery({ password: regenForm.password, code: regenForm.code.trim() })
    Object.assign(regenForm, { password: '', code: '' })
    toast.success('New recovery codes created — save them now')
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    busy.value = false
  }
}

async function copySecret() {
  if (!setup.value) return
  await navigator.clipboard.writeText(setup.value.secret)
  toast.success('Secret copied')
}

async function copyCodes() {
  if (!recoveryCodes.value?.length) return
  await navigator.clipboard.writeText(recoveryCodes.value.join('\n'))
  toast.success('Recovery codes copied')
}
</script>

<template>
  <Card class="gap-3">
    <CardHeader class="border-b border-border/60 pb-3">
      <CardTitle class="flex items-center gap-2">
        <ShieldCheck class="size-4 text-primary" /> Two-factor authentication
      </CardTitle>
      <CardDescription>
        After your password, Vector asks for a code from an authenticator app (Google Authenticator, 1Password, Authy…).
      </CardDescription>
    </CardHeader>
    <CardContent class="space-y-4">
      <div class="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-muted/20 px-3.5 py-3">
        <span class="text-sm font-medium">Status</span>
        <span
          class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold"
          :class="enabled ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground'"
        >
          {{ enabled ? 'On' : 'Off' }}
        </span>
      </div>

      <div v-if="recoveryCodes?.length" class="space-y-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3.5">
        <p class="text-sm font-medium text-amber-800 dark:text-amber-200">Save these recovery codes now — they are shown only once.</p>
        <ul class="grid gap-1 font-mono text-xs sm:grid-cols-2">
          <li v-for="code in recoveryCodes" :key="code">{{ code }}</li>
        </ul>
        <Button type="button" size="sm" variant="outline" @click="copyCodes"><Copy /> Copy codes</Button>
      </div>

      <template v-if="!enabled">
        <div v-if="!setup" class="space-y-2">
          <Button type="button" variant="outline" :loading="busy" @click="startSetup">Turn on two-factor</Button>
        </div>
        <div v-else class="space-y-3">
          <p class="text-sm text-muted-foreground">Scan this QR code with your authenticator app. If you cannot scan, copy the secret instead.</p>
          <div class="flex flex-wrap items-start gap-4">
            <div class="rounded-lg border border-border bg-white p-3 shadow-soft">
              <img v-if="qrDataUrl" :src="qrDataUrl" alt="Authenticator QR code" width="200" height="200" class="block size-[200px]" />
              <div v-else class="flex size-[200px] items-center justify-center text-xs text-muted-foreground">Preparing QR…</div>
            </div>
            <div class="min-w-0 flex-1 space-y-2">
              <p class="text-xs font-medium text-muted-foreground">Manual entry secret</p>
              <div class="flex flex-wrap items-center gap-2">
                <code class="rounded-md bg-muted px-2 py-1 font-mono text-sm tracking-wider break-all">{{ setup.secret }}</code>
                <Button type="button" size="sm" variant="ghost" @click="copySecret"><Copy /> Copy</Button>
              </div>
            </div>
          </div>
          <FormField label="Code from your app" for="mfa-confirm">
            <Input id="mfa-confirm" v-model="confirmCode" inputmode="numeric" autocomplete="one-time-code" placeholder="123456" class="max-w-xs tracking-widest" />
          </FormField>
          <div class="flex flex-wrap gap-2">
            <Button type="button" variant="brand" :loading="busy" :disabled="!/^\d{6}$/.test(confirmCode.trim())" @click="confirmSetup">Confirm and enable</Button>
            <Button type="button" variant="ghost" @click="setup = null">Cancel</Button>
          </div>
        </div>
      </template>

      <template v-else>
        <form class="grid gap-3 sm:grid-cols-2" @submit.prevent="disable">
          <FormField label="Password" for="mfa-disable-password" class="sm:col-span-2">
            <PasswordInput id="mfa-disable-password" v-model="disableForm.password" autocomplete="current-password" required />
          </FormField>
          <FormField v-if="!disableForm.useRecovery" label="Authenticator code" for="mfa-disable-code">
            <Input id="mfa-disable-code" v-model="disableForm.code" inputmode="numeric" autocomplete="one-time-code" placeholder="123456" class="tracking-widest" required />
          </FormField>
          <FormField v-else label="Recovery code" for="mfa-disable-recovery">
            <Input id="mfa-disable-recovery" v-model="disableForm.recoveryCode" placeholder="XXXX-XXXX-XX" required />
          </FormField>
          <div class="flex flex-wrap items-end gap-2 sm:col-span-2">
            <Button type="submit" variant="outline" class="text-destructive" :loading="busy"><ShieldOff /> Turn off</Button>
            <button type="button" class="text-xs font-medium text-primary hover:underline" @click="disableForm.useRecovery = !disableForm.useRecovery">
              {{ disableForm.useRecovery ? 'Use authenticator code' : 'Use a recovery code' }}
            </button>
          </div>
        </form>

        <form class="grid gap-3 border-t border-border/70 pt-4 sm:grid-cols-2" @submit.prevent="regenerate">
          <p class="sm:col-span-2 text-sm text-muted-foreground">Lost your recovery codes? Create a new set (the old ones stop working).</p>
          <FormField label="Password" for="mfa-regen-password">
            <PasswordInput id="mfa-regen-password" v-model="regenForm.password" autocomplete="current-password" required />
          </FormField>
          <FormField label="Authenticator code" for="mfa-regen-code">
            <Input id="mfa-regen-code" v-model="regenForm.code" inputmode="numeric" autocomplete="one-time-code" placeholder="123456" class="tracking-widest" required />
          </FormField>
          <div class="sm:col-span-2">
            <Button type="submit" variant="outline" :loading="busy">Generate new recovery codes</Button>
          </div>
        </form>
      </template>
    </CardContent>
  </Card>
</template>

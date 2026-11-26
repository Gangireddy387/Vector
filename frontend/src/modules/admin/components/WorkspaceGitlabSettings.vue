<script setup lang="ts">
import { Check, Copy, RefreshCw } from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { formatDateTime } from '@/lib/format'
import { getErrorMessage } from '@/lib/http'
import { useAuthStore } from '@/modules/auth/auth.store'
import { workspaceApi, type GitlabIntegrationSettings } from '../admin.api'

const auth = useAuthStore()
const available = computed(() => auth.hasFeature('vcsLinks'))

const settings = ref<GitlabIntegrationSettings | null>(null)
const loading = ref(false)
const saving = ref(false)
const revealedSecret = ref<string | null>(null)
const copiedUrl = ref(false)
const copiedSecret = ref(false)

async function load() {
  if (!available.value) return
  loading.value = true
  try {
    settings.value = await workspaceApi.gitlabIntegration()
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void load()
})

async function setEnabled(enabled: boolean) {
  saving.value = true
  try {
    const next = await workspaceApi.updateGitlabIntegration({ enabled })
    settings.value = next
    revealedSecret.value = next.secret ?? null
    toast.success(enabled ? 'GitLab sync enabled — copy the secret into GitLab now' : 'GitLab sync disabled')
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    saving.value = false
  }
}

async function setMergeClosesIssue(mergeClosesIssue: boolean) {
  saving.value = true
  try {
    settings.value = await workspaceApi.updateGitlabIntegration({ mergeClosesIssue })
    toast.success(mergeClosesIssue ? 'Merged MRs will mark linked tasks Done' : 'Merged MRs will only leave a comment')
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    saving.value = false
  }
}

async function regenerate() {
  saving.value = true
  try {
    const next = await workspaceApi.regenerateGitlabSecret()
    settings.value = next
    revealedSecret.value = next.secret ?? null
    toast.success('New secret generated — update it in GitLab')
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    saving.value = false
  }
}

async function copy(text: string, which: 'url' | 'secret') {
  try {
    await navigator.clipboard.writeText(text)
    if (which === 'url') {
      copiedUrl.value = true
      setTimeout(() => {
        copiedUrl.value = false
      }, 1500)
    } else {
      copiedSecret.value = true
      setTimeout(() => {
        copiedSecret.value = false
      }, 1500)
    }
  } catch {
    toast.error('Could not copy')
  }
}
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle>GitLab sync</CardTitle>
      <CardDescription>
        Paste GitLab issue/MR URLs on tasks. Webhooks sync notes, merges, and closes into Vector.
      </CardDescription>
    </CardHeader>
    <CardContent class="space-y-5 text-sm">
      <p v-if="!available" class="text-muted-foreground">
        Not included on the current plan. Ask the portal administrator to enable
        <span class="font-medium text-foreground">GitHub & GitLab links</span>, or upgrade to Pro.
      </p>

      <template v-else>
        <div class="flex items-center justify-between gap-3 rounded-lg border p-3">
          <div>
            <p class="font-medium text-foreground">Enable inbound sync</p>
            <p class="mt-0.5 text-xs text-muted-foreground">
              GitLab will POST events to Vector for linked merge requests and issues.
            </p>
          </div>
          <Switch
            :model-value="Boolean(settings?.enabled)"
            :disabled="loading || saving"
            @update:model-value="(value: boolean) => setEnabled(value)"
          />
        </div>

        <div v-if="settings?.enabled" class="space-y-4">
          <div class="flex items-center justify-between gap-3 rounded-lg border p-3">
            <div>
              <p class="font-medium text-foreground">Mark task Done on merge</p>
              <p class="mt-0.5 text-xs text-muted-foreground">
                When a linked merge request merges, move the Vector task to the first Done status.
              </p>
            </div>
            <Switch
              :model-value="settings.mergeClosesIssue !== false"
              :disabled="loading || saving"
              @update:model-value="(value: boolean) => setMergeClosesIssue(value)"
            />
          </div>

          <div class="space-y-1.5">
            <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Webhook URL</p>
            <div class="flex gap-2">
              <code class="min-w-0 flex-1 truncate rounded-md border bg-muted/40 px-2 py-1.5 text-xs">
                {{ settings.webhookUrl }}
              </code>
              <Button type="button" size="sm" variant="outline" @click="copy(settings.webhookUrl, 'url')">
                <Check v-if="copiedUrl" class="size-3.5" />
                <Copy v-else class="size-3.5" />
              </Button>
            </div>
          </div>

          <div class="space-y-1.5">
            <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Secret token</p>
            <div v-if="revealedSecret" class="flex gap-2">
              <code class="min-w-0 flex-1 break-all rounded-md border bg-muted/40 px-2 py-1.5 text-xs">
                {{ revealedSecret }}
              </code>
              <Button type="button" size="sm" variant="outline" @click="copy(revealedSecret, 'secret')">
                <Check v-if="copiedSecret" class="size-3.5" />
                <Copy v-else class="size-3.5" />
              </Button>
            </div>
            <p v-else class="text-xs text-muted-foreground">
              Secret prefix <code class="text-foreground">{{ settings.secretPrefix || '—' }}</code> ·
              regenerate if you lost the full value.
            </p>
            <Button type="button" size="sm" variant="outline" :loading="saving" @click="regenerate">
              <RefreshCw class="size-3.5" />
              Regenerate secret
            </Button>
          </div>

          <ol class="list-decimal space-y-1 pl-4 text-muted-foreground">
            <li>In GitLab: project → Settings → Webhooks</li>
            <li>Paste the URL and Secret token above</li>
            <li>
              Triggers:
              <span class="font-medium text-foreground">Comments</span>,
              <span class="font-medium text-foreground">Issues events</span>,
              <span class="font-medium text-foreground">Merge request events</span>
            </li>
            <li>On a Vector task, paste the matching GitLab URL under Code</li>
          </ol>

          <div class="rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            <p>
              Last delivery:
              <span class="text-foreground">
                {{ settings.lastDeliveryAt ? formatDateTime(settings.lastDeliveryAt) : 'None yet' }}
              </span>
              <template v-if="settings.lastEvent"> · {{ settings.lastEvent }}</template>
            </p>
            <p v-if="settings.lastError" class="mt-1 text-destructive">{{ settings.lastError }}</p>
          </div>
        </div>

        <p v-else class="text-muted-foreground">
          You can still paste GitLab URLs on tasks. Turn sync on when you want GitLab activity to land in Vector.
        </p>
      </template>
    </CardContent>
  </Card>
</template>

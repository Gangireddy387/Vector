<script setup lang="ts">
import { ArrowLeft, GitBranch, KeyRound, Plug, Shield, Webhook } from 'lucide-vue-next'
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuthStore } from '@/modules/auth/auth.store'
import { useWorkspaceStore } from '@/stores/workspace.store'
import { workspaceApi } from '../admin.api'
import WorkspaceChannelNotificationsSettings from './WorkspaceChannelNotificationsSettings.vue'
import WorkspaceGithubSettings from './WorkspaceGithubSettings.vue'
import WorkspaceScimSettings from './WorkspaceScimSettings.vue'
import WorkspaceSsoSettings from './WorkspaceSsoSettings.vue'
import WorkspaceWebhooksSettings from './WorkspaceWebhooksSettings.vue'

type SetupKey = 'slack' | 'webhooks' | 'scim' | 'sso' | 'vcs'

const SETUP_KEYS = new Set<SetupKey>(['slack', 'webhooks', 'scim', 'sso', 'vcs'])

const auth = useAuthStore()
const workspace = useWorkspaceStore()
const route = useRoute()
const router = useRouter()

const webhookCount = ref(0)
const scimTokenCount = ref(0)
const githubEnabled = ref(false)
const statusLoaded = ref(false)

const setup = computed<SetupKey | null>(() => {
  const value = String(route.query.setup || '')
  return SETUP_KEYS.has(value as SetupKey) ? (value as SetupKey) : null
})

const catalog = computed(() => {
  const channel = workspace.settings.channelNotifications
  const sso = workspace.settings.sso
  return [
    {
      key: 'slack' as const,
      title: 'Slack & Teams',
      description: 'Post assignments, comments, due dates and sprint starts to a channel.',
      icon: Webhook,
      available: Boolean(channel?.available),
      configured: Boolean(channel?.slackConfigured || channel?.teamsConfigured),
      cta: 'Configure',
    },
    {
      key: 'webhooks' as const,
      title: 'Outbound webhooks',
      description: 'Send signed HTTPS POSTs to your own systems when work changes.',
      icon: Plug,
      available: auth.hasFeature('webhooks'),
      configured: webhookCount.value > 0,
      cta: 'Configure',
    },
    {
      key: 'scim' as const,
      title: 'SCIM provisioning',
      description: 'Sync people from Okta, Entra ID, or another SCIM 2.0 IdP.',
      icon: KeyRound,
      available: auth.hasFeature('scim'),
      configured: scimTokenCount.value > 0,
      cta: 'Configure',
    },
    {
      key: 'sso' as const,
      title: 'Enterprise SSO',
      description: 'Require Google, Microsoft, or OpenID Connect sign-in for this organization.',
      icon: Shield,
      available: Boolean(sso?.available),
      configured: Boolean(sso?.enabled),
      cta: 'Configure',
    },
    {
      key: 'vcs' as const,
      title: 'GitHub & GitLab',
      description: 'Link PR/issue URLs on tasks and sync GitHub activity into Vector comments.',
      icon: GitBranch,
      available: auth.hasFeature('vcsLinks'),
      configured: githubEnabled.value,
      cta: 'Configure',
    },
  ]
})

const activeMeta = computed(() => catalog.value.find((item) => item.key === setup.value) ?? null)

function statusLabel(item: (typeof catalog.value)[number]) {
  if (!item.available) return 'Not on plan'
  if (item.configured) return 'Configured'
  if (item.key === 'vcs') return 'Links available'
  return 'Available'
}

function statusClass(item: (typeof catalog.value)[number]) {
  if (!item.available) return 'text-muted-foreground'
  if (item.configured) return 'text-emerald-600 dark:text-emerald-400'
  if (item.key === 'vcs') return 'text-emerald-600 dark:text-emerald-400'
  return 'text-amber-700 dark:text-amber-400'
}

async function loadStatus() {
  statusLoaded.value = false
  try {
    const jobs: Promise<void>[] = []
    if (auth.hasFeature('webhooks')) {
      jobs.push(
        workspaceApi.webhooks().then((data) => {
          webhookCount.value = data.endpoints.length
        }),
      )
    } else {
      webhookCount.value = 0
    }
    if (auth.hasFeature('scim')) {
      jobs.push(
        workspaceApi.scimTokens().then((data) => {
          scimTokenCount.value = data.tokens.length
        }),
      )
    } else {
      scimTokenCount.value = 0
    }
    if (auth.hasFeature('vcsLinks')) {
      jobs.push(
        workspaceApi.githubIntegration().then((data) => {
          githubEnabled.value = Boolean(data.enabled)
        }),
      )
    } else {
      githubEnabled.value = false
    }
    await Promise.all(jobs)
  } catch {
    // Hub still works; configure screens show their own errors.
  } finally {
    statusLoaded.value = true
  }
}

onMounted(() => {
  void loadStatus()
})

watch(setup, (value, previous) => {
  if (previous && !value) void loadStatus()
})

function openSetup(key: SetupKey) {
  router.replace({ query: { ...route.query, tab: 'integrations', setup: key } })
}

function backToHub() {
  const query = { ...route.query, tab: 'integrations' }
  delete query.setup
  router.replace({ query })
}
</script>

<template>
  <div class="space-y-4">
    <template v-if="setup && activeMeta">
      <div class="flex flex-wrap items-center gap-2">
        <Button type="button" variant="ghost" size="sm" @click="backToHub">
          <ArrowLeft class="size-3.5" />
          All integrations
        </Button>
      </div>

      <WorkspaceChannelNotificationsSettings v-if="setup === 'slack'" />
      <WorkspaceWebhooksSettings v-else-if="setup === 'webhooks'" />
      <WorkspaceScimSettings v-else-if="setup === 'scim'" />
      <WorkspaceSsoSettings v-else-if="setup === 'sso'" />
      <WorkspaceGithubSettings v-else-if="setup === 'vcs'" />
    </template>

    <template v-else>
      <div>
        <h2 class="text-base font-semibold">Integrations</h2>
        <p class="mt-1 text-sm text-muted-foreground">
          Connect Vector to chat, identity providers, code hosts, and your own systems.
        </p>
      </div>

      <div class="grid gap-3 sm:grid-cols-2">
        <Card
          v-for="item in catalog"
          :key="item.key"
          class="flex flex-col"
        >
          <CardHeader class="pb-2">
            <div class="flex items-start gap-3">
              <div class="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-muted/40">
                <component :is="item.icon" class="size-4 text-muted-foreground" />
              </div>
              <div class="min-w-0 flex-1">
                <CardTitle class="text-base">{{ item.title }}</CardTitle>
                <p class="mt-1 text-xs font-medium" :class="statusClass(item)">
                  {{ statusLoaded || item.key === 'slack' || item.key === 'sso' || item.key === 'vcs' ? statusLabel(item) : '…' }}
                </p>
              </div>
            </div>
            <CardDescription class="pt-2">{{ item.description }}</CardDescription>
          </CardHeader>
          <CardContent class="mt-auto pt-0">
            <Button type="button" variant="outline" size="sm" @click="openSetup(item.key)">
              {{ item.cta }}
            </Button>
          </CardContent>
        </Card>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { Check, Gem, Minus } from 'lucide-vue-next'
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import PageFrame from '@/components/common/PageFrame.vue'
import PageHeader from '@/components/common/PageHeader.vue'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { getErrorMessage } from '@/lib/http'
import { PLAN_FEATURES } from '@/lib/plan-features'
import RequestUpgradeButton from '@/modules/admin/components/RequestUpgradeButton.vue'
import { type UpgradeTarget, workspaceApi } from '@/modules/admin/admin.api'
import { useAuthStore } from '@/modules/auth/auth.store'
import UsageMeters from '@/modules/plan/components/UsageMeters.vue'
import EmailEntitlementsCard from '@/modules/settings/components/EmailEntitlementsCard.vue'

const appFeatures = PLAN_FEATURES.filter((feature) => feature.group === 'app')

/** Read-only plan overview for every org member (billing stays admin-only). */
const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const overview = ref<Awaited<ReturnType<typeof workspaceApi.plan>> | null>(null)

async function load() {
  try {
    overview.value = await workspaceApi.plan()
  } catch (error) {
    toast.error(getErrorMessage(error))
  }
}

onMounted(async () => {
  await load()
  if (auth.isOrganizationAdmin && route.query.request) {
    void router.replace({ name: 'workspace-admin', query: { tab: 'plan', request: route.query.request } })
  }
})
watch(() => auth.organization?.entitlements, load, { deep: true })

const focusRequest = computed<UpgradeTarget | null>(() => {
  const raw = route.query.request
  return raw === 'seats' || raw === 'projects' || raw === 'pro' || raw === 'enterprise' ? raw : null
})

const planName = computed(() => overview.value?.entitlements.planName ?? auth.organization?.entitlements?.planName ?? 'Full access')
const pending = computed(() => overview.value?.upgradeRequest ?? null)
const isFreeLike = computed(() => {
  const features = overview.value?.entitlements.features
  if (!features) return false
  return !features.automations || !features.aiAssistant || !features.reports
})
const isEnterprise = computed(() => String(planName.value).toLowerCase() === 'enterprise')
</script>

<template>
  <PageFrame mode="stack">
    <PageHeader
      title="Plan"
      :description="`${auth.organization?.name ?? 'Your organization'} is on ${planName}.`"
    />

    <Card>
      <CardHeader>
        <CardTitle class="flex items-center gap-2"><Gem class="size-4 text-primary" /> {{ planName }}</CardTitle>
        <CardDescription>
          <template v-if="auth.isOrganizationAdmin">
            Admins can manage billing from
            <RouterLink :to="{ name: 'workspace-admin', query: { tab: 'plan' } }" class="font-medium text-primary hover:underline">
              Organization settings → Plan
            </RouterLink>.
          </template>
          <template v-else>
            You can request an upgrade; an organization admin or the portal team completes it.
          </template>
        </CardDescription>
      </CardHeader>
      <CardContent class="space-y-4">
        <UsageMeters
          :usage="overview?.usage ?? null"
          :limits="overview?.entitlements.limits ?? null"
          :pending="pending"
          :focus-request="focusRequest"
          :member-count="overview?.usage.members ?? 1"
          :loading="!overview"
          @update="load"
        />

        <div
          v-if="overview && (isFreeLike || pending?.target === 'pro' || focusRequest === 'pro')"
          class="flex flex-col gap-3 rounded-lg border border-dashed border-border bg-muted/30 px-4 py-3 sm:flex-row sm:items-center"
        >
          <div class="min-w-0 flex-1">
            <p class="text-sm font-medium">
              {{ pending?.target === 'pro' ? 'Pro request pending' : 'Want automation, AI and reports?' }}
            </p>
            <p class="mt-0.5 text-xs text-muted-foreground">
              <template v-if="pending?.target === 'pro'">
                Sent {{ pending.requestedByName ? `by ${pending.requestedByName}` : '' }} — waiting on the portal admin.
              </template>
              <template v-else>Pro adds automation, AI, templates, recurring tasks and reports.</template>
            </p>
          </div>
          <RequestUpgradeButton target="pro" :pending="pending" :member-count="overview.usage.members" @update="load" />
        </div>

        <div
          v-if="overview && !isEnterprise"
          class="flex flex-col gap-3 rounded-lg border border-dashed border-border bg-muted/30 px-4 py-3 sm:flex-row sm:items-center"
        >
          <div class="min-w-0 flex-1">
            <p class="text-sm font-medium">
              {{ pending?.target === 'enterprise' ? 'Enterprise request pending' : 'Need SSO, SCIM and unlimited scale?' }}
            </p>
            <p class="mt-0.5 text-xs text-muted-foreground">
              Enterprise unlocks SSO, SCIM, and unlimited people and projects.
            </p>
          </div>
          <RequestUpgradeButton target="enterprise" :pending="pending" :member-count="overview.usage.members" @update="load" />
        </div>

        <div class="flex flex-wrap gap-2">
          <Button v-if="auth.isOrganizationAdmin" size="sm" variant="outline" as-child>
            <RouterLink :to="{ name: 'workspace-admin', query: { tab: 'plan' } }">Open admin plan settings</RouterLink>
          </Button>
          <Button size="sm" variant="ghost" as-child>
            <RouterLink :to="{ name: 'pricing' }" target="_blank">Compare plans</RouterLink>
          </Button>
        </div>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>Included features</CardTitle>
        <CardDescription>Features outside your plan are hidden for everyone in the organization.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul v-if="overview" class="grid gap-2 sm:grid-cols-2">
          <li
            v-for="feature in appFeatures"
            :key="feature.key"
            class="flex items-center gap-3 border p-3"
            :class="overview.entitlements.features[feature.key] ? 'border-border/70' : 'border-dashed border-border/60 opacity-70'"
          >
            <span class="flex size-8 shrink-0 items-center justify-center bg-primary/10 text-primary">
              <component :is="feature.icon" class="size-4" />
            </span>
            <span class="min-w-0 flex-1">
              <span class="block text-sm font-medium">{{ feature.label }}</span>
              <span class="block text-xs text-muted-foreground">{{ feature.description }}</span>
            </span>
            <span
              class="flex size-6 shrink-0 items-center justify-center"
              :class="overview.entitlements.features[feature.key] ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground'"
              :aria-label="overview.entitlements.features[feature.key] ? 'Included' : 'Not included'"
            >
              <component :is="overview.entitlements.features[feature.key] ? Check : Minus" class="size-3.5" />
            </span>
          </li>
        </ul>
        <div v-else class="grid gap-2 sm:grid-cols-2">
          <Skeleton v-for="index in 6" :key="index" class="h-16" />
        </div>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>Emails</CardTitle>
        <CardDescription>Which transactional emails this plan sends.</CardDescription>
      </CardHeader>
      <CardContent>
        <EmailEntitlementsCard bare :features="overview?.entitlements.features ?? null" />
      </CardContent>
    </Card>
  </PageFrame>
</template>

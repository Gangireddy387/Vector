<script setup lang="ts">
import { Check, FolderKanban, Gem, Minus, Users } from 'lucide-vue-next'
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import PageHeader from '@/components/common/PageHeader.vue'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { getErrorMessage } from '@/lib/http'
import { PLAN_FEATURES } from '@/lib/plan-features'
import RequestUpgradeButton from '@/modules/admin/components/RequestUpgradeButton.vue'
import { type UpgradeTarget, workspaceApi } from '@/modules/admin/admin.api'
import { useAuthStore } from '@/modules/auth/auth.store'

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

const usageRows = computed(() => {
  if (!overview.value) return []
  const { limits } = overview.value.entitlements
  const { usage } = overview.value
  return [
    { key: 'seats' as const, label: 'People', icon: Users, used: usage.members, limit: limits.members },
    { key: 'projects' as const, label: 'Projects', icon: FolderKanban, used: usage.projects, limit: limits.projects },
  ].map((row) => ({
    ...row,
    percent: row.limit ? Math.min(100, Math.round((row.used / row.limit) * 100)) : 0,
  }))
})
</script>

<template>
  <div class="mx-auto w-full max-w-3xl space-y-4 p-3 sm:space-y-5 sm:p-5 lg:p-6">
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
        <div v-if="!overview" class="grid gap-3 sm:grid-cols-2"><Skeleton v-for="index in 2" :key="index" class="h-20" /></div>
        <div v-else class="grid gap-3 sm:grid-cols-2">
          <div v-for="row in usageRows" :key="row.label" class="space-y-2.5 border border-border/70 p-4">
            <div class="flex items-center justify-between text-sm">
              <span class="flex items-center gap-2 font-medium">
                <component :is="row.icon" class="size-4 text-muted-foreground" /> {{ row.label }}
              </span>
              <span class="tabular-nums text-muted-foreground">
                <span class="font-semibold text-foreground">{{ row.used }}</span> / {{ row.limit ?? 'Unlimited' }}
              </span>
            </div>
            <Progress
              v-if="row.limit"
              :model-value="row.percent"
              class="h-1.5"
              :indicator-class="row.percent >= 100 ? 'bg-destructive' : row.percent >= 80 ? 'bg-warning' : 'bg-primary'"
            />
            <div
              v-if="row.limit && (row.percent >= 80 || focusRequest === row.key)"
              class="flex flex-wrap items-center gap-2"
            >
              <p class="flex-1 text-xs" :class="row.percent >= 100 ? 'text-destructive' : 'text-amber-700 dark:text-amber-400'">
                {{ row.percent >= 100 ? 'Limit reached.' : 'Nearing the limit.' }}
              </p>
              <RequestUpgradeButton
                :target="row.key"
                size="sm"
                variant="outline"
                :pending="pending"
                :member-count="overview.usage.members"
                @update="load"
              />
            </div>
          </div>
        </div>

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
            v-for="feature in PLAN_FEATURES"
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
  </div>
</template>

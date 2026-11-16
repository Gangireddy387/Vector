<script setup lang="ts">
import { Check, FolderKanban, Gem, Minus, Users } from 'lucide-vue-next'
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { PLAN_FEATURES } from '@/lib/plan-features'
import { useAuthStore } from '@/modules/auth/auth.store'
import { workspaceApi } from '../admin.api'
import RequestUpgradeButton from './RequestUpgradeButton.vue'

/** The organization's plan as the super admin set it: limits with current usage, and included features. */
const auth = useAuthStore()
const overview = ref<Awaited<ReturnType<typeof workspaceApi.plan>> | null>(null)

const load = async () => (overview.value = await workspaceApi.plan())
onMounted(load)
watch(() => auth.organization?.entitlements, load, { deep: true })

const planName = computed(() => overview.value?.entitlements.planName ?? 'Full access')
const isFreeLike = computed(() => {
  const features = overview.value?.entitlements.features
  if (!features) return false
  return !features.chat || !features.meetings || !features.directMessages
})
const pending = computed(() => overview.value?.upgradeRequest ?? null)

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
  <div class="space-y-3.5 sm:space-y-4">
    <Card>
      <CardHeader>
        <CardTitle class="flex items-center gap-2"><Gem class="size-4 text-primary" /> {{ planName }} plan</CardTitle>
        <CardDescription>
          Your plan is set by the portal administrator. Request an upgrade here — it goes to Vector support and Super Admin.
        </CardDescription>
      </CardHeader>
      <CardContent class="space-y-4">
        <div v-if="!overview" class="grid gap-3 sm:grid-cols-2"><Skeleton v-for="index in 2" :key="index" class="h-20" /></div>
        <div v-else class="grid gap-3 sm:grid-cols-2">
          <div v-for="row in usageRows" :key="row.label" class="space-y-2.5 border border-border/70 p-4">
            <div class="flex items-center justify-between text-sm">
              <span class="flex items-center gap-2 font-medium"><component :is="row.icon" class="size-4 text-muted-foreground" /> {{ row.label }}</span>
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
            <div v-if="row.limit && row.percent >= 80" class="flex flex-wrap items-center gap-2">
              <p class="flex-1 text-xs" :class="row.percent >= 100 ? 'text-destructive' : 'text-amber-700 dark:text-amber-400'">
                {{ row.percent >= 100 ? 'Limit reached.' : 'Nearing the limit.' }} Request more from the portal.
              </p>
              <RequestUpgradeButton :target="row.key" size="sm" variant="outline" :pending="pending" @update="load" />
            </div>
          </div>
        </div>

        <div
          v-if="overview && (isFreeLike || pending)"
          class="flex flex-col gap-3 rounded-lg border border-dashed border-border bg-muted/30 px-4 py-3 sm:flex-row sm:items-center"
        >
          <div class="min-w-0 flex-1">
            <p class="text-sm font-medium">{{ pending ? 'Upgrade request pending' : 'Need collaboration features?' }}</p>
            <p class="mt-0.5 text-xs text-muted-foreground">
              <template v-if="pending">
                Sent {{ pending.requestedByName ? `by ${pending.requestedByName}` : '' }} — the portal admin will change your plan.
              </template>
              <template v-else>
                Request Pro for standup, Messages, meetings and calendar. You’ll also get a Support thread.
              </template>
            </p>
          </div>
          <div class="flex flex-wrap gap-2">
            <RequestUpgradeButton target="pro" :pending="pending" @update="load" />
            <Button v-if="pending" size="sm" variant="outline" as-child>
              <RouterLink :to="{ name: 'workspace-admin', query: { tab: 'support' } }">Open support</RouterLink>
            </Button>
          </div>
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
            <span class="flex size-8 shrink-0 items-center justify-center bg-primary/10 text-primary"><component :is="feature.icon" class="size-4" /></span>
            <span class="min-w-0 flex-1">
              <span class="block text-sm font-medium">{{ feature.label }}</span>
              <span class="block text-xs text-muted-foreground">{{ feature.description }}</span>
              <span v-if="overview.entitlements.customFeatures?.includes(feature.key)" class="mt-0.5 block text-[11px] font-medium text-brand">
                {{ overview.entitlements.features[feature.key] ? 'Added' : 'Turned off' }} for your organization
              </span>
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
      </CardContent>
    </Card>
  </div>
</template>

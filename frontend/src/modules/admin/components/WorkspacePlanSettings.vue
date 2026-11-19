<script setup lang="ts">
import { Check, CreditCard, FolderKanban, Gem, LoaderCircle, Minus, Sunrise, Users } from 'lucide-vue-next'
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { getErrorMessage } from '@/lib/http'
import { PLAN_FEATURES } from '@/lib/plan-features'
import { useAuthStore } from '@/modules/auth/auth.store'
import { type UpgradeTarget, workspaceApi } from '../admin.api'
import RequestUpgradeButton from './RequestUpgradeButton.vue'

/** The organization's plan as the super admin set it: limits with current usage, and included features. */
const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const overview = ref<Awaited<ReturnType<typeof workspaceApi.plan>> | null>(null)
const nudgeStats = ref<Awaited<ReturnType<typeof workspaceApi.workdayNudgeMetrics>> | null>(null)
const nudgeLoading = ref(true)
const billingInfo = ref<Awaited<ReturnType<typeof workspaceApi.billingStatus>> | null>(null)
const isOpeningPortal = ref(false)

const emptyNudgeStats = {
  sent: 0,
  opened: 0,
  openRate: 0,
  readWithoutClick: 0,
  byDay: {
    '2': { sent: 0, opened: 0, openRate: 0 },
    '7': { sent: 0, opened: 0, openRate: 0 },
  },
}

const load = async () => {
  overview.value = await workspaceApi.plan()
  if (auth.isOrganizationAdmin) {
    billingInfo.value = await workspaceApi.billingStatus().catch(() => null)
  }
  nudgeLoading.value = true
  nudgeStats.value = await workspaceApi.workdayNudgeMetrics().catch(() => emptyNudgeStats)
  nudgeLoading.value = false
}
onMounted(async () => {
  const billing = String(route.query.billing ?? '')
  if (billing === 'success') {
    toast.success('Pro activated', { description: 'Trial or subscription is live as soon as Stripe confirms — refresh if features are still locked.' })
    await auth.refreshSession()
    void router.replace({ query: { ...route.query, billing: undefined } })
  } else if (billing === 'cancel') {
    toast.message('Checkout cancelled')
    void router.replace({ query: { ...route.query, billing: undefined } })
  } else if (billing === 'portal') {
    toast.message('Back from billing', { description: 'Plan updates from Stripe apply within a few seconds.' })
    await auth.refreshSession()
    void router.replace({ query: { ...route.query, billing: undefined } })
  }
  await load()
})
watch(() => auth.organization?.entitlements, load, { deep: true })

async function openBillingPortal() {
  if (!auth.isOrganizationAdmin) {
    toast.message('Ask an organization admin', { description: 'Only admins can manage billing.' })
    return
  }
  isOpeningPortal.value = true
  try {
    const { url } = await workspaceApi.startBillingPortal()
    window.location.assign(url)
  } catch (error) {
    toast.error(getErrorMessage(error))
    isOpeningPortal.value = false
  }
}

/** Deep-link from plan-limit toasts (?request=seats|projects|pro). */
const focusRequest = computed<UpgradeTarget | null>(() => {
  const raw = route.query.request
  return raw === 'seats' || raw === 'projects' || raw === 'pro' ? raw : null
})

const planName = computed(() => overview.value?.entitlements.planName ?? 'Full access')
/** Still on a thin plan: missing Pro automation/AI/reports (workday loop is already on Free). */
const isFreeLike = computed(() => {
  const features = overview.value?.entitlements.features
  if (!features) return false
  return !features.automations || !features.aiAssistant || !features.reports
})
const pending = computed(() => overview.value?.upgradeRequest ?? null)
const canManageBilling = computed(() => Boolean(billingInfo.value?.portalEnabled && auth.isOrganizationAdmin))

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
          <template v-if="canManageBilling">
            Manage your card, invoices and cancellation in Stripe. Limits below still apply until you change plan.
          </template>
          <template v-else>
            Upgrade with card when Checkout is on, or request an upgrade for the portal administrator.
          </template>
        </CardDescription>
      </CardHeader>
      <CardContent class="space-y-4">
        <div v-if="canManageBilling" class="flex flex-col gap-3 rounded-lg border border-border bg-card px-4 py-3 sm:flex-row sm:items-center">
          <div class="min-w-0 flex-1">
            <p class="text-sm font-medium">Billing</p>
            <p class="mt-0.5 text-xs text-muted-foreground">
              <template v-if="billingInfo?.hasSubscription">
                {{ billingInfo.billedSeats ? `${billingInfo.billedSeats} paid seats` : 'Active subscription' }}
                — update payment method, seats, invoices, or cancel.
              </template>
              <template v-else>Stripe customer on file — open the portal to manage payment details.</template>
            </p>
          </div>
          <div class="flex flex-wrap gap-2">
            <RequestUpgradeButton
              v-if="billingInfo?.hasSubscription"
              target="seats"
              size="sm"
              variant="outline"
              label="Change seats"
              :member-count="overview?.usage.members ?? 1"
              @update="load"
            />
            <Button size="sm" variant="outline" :disabled="isOpeningPortal" @click="openBillingPortal">
              <LoaderCircle v-if="isOpeningPortal" class="animate-spin" />
              <CreditCard v-else />
              Manage billing
            </Button>
          </div>
        </div>

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
            <div
              v-if="row.limit && (row.percent >= 80 || focusRequest === row.key)"
              class="flex flex-wrap items-center gap-2 rounded-md"
              :class="focusRequest === row.key && 'ring-2 ring-primary/30 ring-offset-2 ring-offset-background'"
            >
              <p class="flex-1 text-xs" :class="row.percent >= 100 ? 'text-destructive' : 'text-amber-700 dark:text-amber-400'">
                {{ row.percent >= 100 ? 'Limit reached.' : 'Nearing the limit.' }}
                {{ row.key === 'seats' && billingInfo?.checkoutEnabled ? 'Buy more seats or ask the portal admin.' : 'Request more from the portal.' }}
              </p>
              <RequestUpgradeButton
                :target="row.key"
                size="sm"
                variant="outline"
                :pending="pending"
                :member-count="overview?.usage.members ?? 1"
                @update="load"
              />
            </div>
          </div>
        </div>

        <div
          v-if="overview && (isFreeLike || pending || focusRequest === 'pro')"
          class="flex flex-col gap-3 rounded-lg border border-dashed border-border bg-muted/30 px-4 py-3 sm:flex-row sm:items-center"
          :class="focusRequest === 'pro' && 'ring-2 ring-primary/30'"
        >
          <div class="min-w-0 flex-1">
            <p class="text-sm font-medium">{{ pending ? 'Upgrade request pending' : 'Want automation, AI and reports?' }}</p>
            <p class="mt-0.5 text-xs text-muted-foreground">
              <template v-if="pending">
                Sent {{ pending.requestedByName ? `by ${pending.requestedByName}` : '' }} — the portal admin will change your plan.
              </template>
              <template v-else>
                Free already covers the workday loop. Pro is billed per seat and adds automation, AI, templates, recurring tasks and reports.
              </template>
            </p>
          </div>
          <div class="flex flex-wrap gap-2">
            <RequestUpgradeButton target="pro" :pending="pending" :member-count="overview?.usage.members ?? 1" @update="load" />
            <Button v-if="pending" size="sm" variant="outline" as-child>
              <RouterLink :to="{ name: 'workspace-admin', query: { tab: 'support' } }">Open support</RouterLink>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle class="flex items-center gap-2"><Sunrise class="size-4 text-primary" /> Workday nudges</CardTitle>
        <CardDescription>
          Day 2 and day 7 habit reminders. Open rate counts real opens (Open / navigate) — not “mark all read.”
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div v-if="nudgeLoading && !nudgeStats" class="grid gap-3 sm:grid-cols-3"><Skeleton v-for="index in 3" :key="index" class="h-16" /></div>
        <div v-else class="space-y-3">
          <div class="grid gap-3 sm:grid-cols-3">
            <div class="border border-border/70 p-3">
              <p class="text-xs text-muted-foreground">Sent</p>
              <p class="mt-1 text-xl font-semibold tabular-nums">{{ nudgeStats?.sent ?? 0 }}</p>
            </div>
            <div class="border border-border/70 p-3">
              <p class="text-xs text-muted-foreground">Opened</p>
              <p class="mt-1 text-xl font-semibold tabular-nums">{{ nudgeStats?.opened ?? 0 }}</p>
            </div>
            <div class="border border-border/70 p-3">
              <p class="text-xs text-muted-foreground">Open rate</p>
              <p class="mt-1 text-xl font-semibold tabular-nums">{{ nudgeStats?.openRate ?? 0 }}%</p>
            </div>
          </div>
          <ul class="grid gap-2 sm:grid-cols-2">
            <li v-for="day in ['2', '7']" :key="day" class="flex items-center justify-between border border-border/70 px-3 py-2 text-sm">
              <span class="font-medium">Day {{ day }}</span>
              <span class="tabular-nums text-muted-foreground">
                {{ nudgeStats?.byDay[day]?.opened ?? 0 }}/{{ nudgeStats?.byDay[day]?.sent ?? 0 }}
                · {{ nudgeStats?.byDay[day]?.openRate ?? 0 }}%
              </span>
            </li>
          </ul>
          <p v-if="(nudgeStats?.sent ?? 0) === 0" class="text-xs text-muted-foreground">
            No day-2/day-7 nudges sent yet for this org. Numbers fill in after those reminders go out.
          </p>
          <p v-else-if="(nudgeStats?.readWithoutClick ?? 0) > 0" class="text-xs text-muted-foreground">
            {{ nudgeStats?.readWithoutClick }} marked read without opening — those do not count toward open rate.
          </p>
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

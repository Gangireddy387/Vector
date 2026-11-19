<script setup lang="ts">
import { Check, CreditCard, Gem, LoaderCircle, Minus, Sunrise } from 'lucide-vue-next'
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { getErrorMessage } from '@/lib/http'
import { PLAN_FEATURES } from '@/lib/plan-features'
import { useAuthStore } from '@/modules/auth/auth.store'
import UsageMeters from '@/modules/plan/components/UsageMeters.vue'
import EmailEntitlementsCard from '@/modules/settings/components/EmailEntitlementsCard.vue'
import { type UpgradeTarget, workspaceApi } from '../admin.api'
import RequestUpgradeButton from './RequestUpgradeButton.vue'

const appFeatures = PLAN_FEATURES.filter((feature) => feature.group === 'app')

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
    const plan = String(route.query.plan ?? 'pro')
    const label = plan === 'enterprise' ? 'Enterprise' : 'Pro'
    toast.success(`${label} activated`, {
      description: 'Trial or subscription is live as soon as Stripe confirms — refresh if features are still locked.',
    })
    await auth.refreshSession()
    void router.replace({ query: { ...route.query, billing: undefined, plan: undefined } })
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

/** Deep-link from plan-limit toasts (?request=seats|projects|pro|enterprise). */
const focusRequest = computed<UpgradeTarget | null>(() => {
  const raw = route.query.request
  return raw === 'seats' || raw === 'projects' || raw === 'pro' || raw === 'enterprise' ? raw : null
})

const planName = computed(() => overview.value?.entitlements.planName ?? 'Full access')
/** Still on a thin plan: missing Pro automation/AI/reports (workday loop is already on Free). */
const isFreeLike = computed(() => {
  const features = overview.value?.entitlements.features
  if (!features) return false
  return !features.automations || !features.aiAssistant || !features.reports
})
const isEnterprise = computed(() => String(planName.value).toLowerCase() === 'enterprise')
const isProLike = computed(() => {
  const features = overview.value?.entitlements.features
  if (!features || isFreeLike.value || isEnterprise.value) return false
  return Boolean(features.automations && features.aiAssistant)
})
const pending = computed(() => overview.value?.upgradeRequest ?? null)
const canManageBilling = computed(() => Boolean(billingInfo.value?.portalEnabled && auth.isOrganizationAdmin))
const showEnterpriseUpgrade = computed(
  () => overview.value && !isEnterprise.value && (isProLike.value || isFreeLike.value || focusRequest.value === 'enterprise' || pending.value?.target === 'enterprise'),
)

const seatNearHint = computed(() =>
  billingInfo.value?.checkoutEnabled ? 'Buy more seats or ask the portal admin.' : 'Request more from the portal.',
)
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

        <UsageMeters
          :usage="overview?.usage ?? null"
          :limits="overview?.entitlements.limits ?? null"
          :pending="pending"
          :focus-request="focusRequest"
          :member-count="overview?.usage.members ?? 1"
          :loading="!overview"
          :seat-near-hint="seatNearHint"
          project-near-hint="Request more from the portal."
          @update="load"
        />

        <div
          v-if="overview && (isFreeLike || pending?.target === 'pro' || focusRequest === 'pro')"
          class="flex flex-col gap-3 rounded-lg border border-dashed border-border bg-muted/30 px-4 py-3 sm:flex-row sm:items-center"
          :class="focusRequest === 'pro' && 'ring-2 ring-primary/30'"
        >
          <div class="min-w-0 flex-1">
            <p class="text-sm font-medium">{{ pending?.target === 'pro' ? 'Pro request pending' : 'Want automation, AI and reports?' }}</p>
            <p class="mt-0.5 text-xs text-muted-foreground">
              <template v-if="pending?.target === 'pro'">
                Sent {{ pending.requestedByName ? `by ${pending.requestedByName}` : '' }} — the portal admin will change your plan.
              </template>
              <template v-else>
                Free already covers the workday loop. Pro is billed per seat and adds automation, AI, templates, recurring tasks and reports.
              </template>
            </p>
          </div>
          <div class="flex flex-wrap gap-2">
            <RequestUpgradeButton target="pro" :pending="pending" :member-count="overview?.usage.members ?? 1" @update="load" />
            <Button v-if="pending?.target === 'pro'" size="sm" variant="outline" as-child>
              <RouterLink :to="{ name: 'workspace-admin', query: { tab: 'support' } }">Open support</RouterLink>
            </Button>
          </div>
        </div>

        <div
          v-if="showEnterpriseUpgrade"
          class="flex flex-col gap-3 rounded-lg border border-dashed border-border bg-muted/30 px-4 py-3 sm:flex-row sm:items-center"
          :class="focusRequest === 'enterprise' && 'ring-2 ring-primary/30'"
        >
          <div class="min-w-0 flex-1">
            <p class="text-sm font-medium">
              {{ pending?.target === 'enterprise' ? 'Enterprise request pending' : 'Need SSO, SCIM and unlimited scale?' }}
            </p>
            <p class="mt-0.5 text-xs text-muted-foreground">
              <template v-if="pending?.target === 'enterprise'">
                Sent {{ pending.requestedByName ? `by ${pending.requestedByName}` : '' }} — the portal admin will change your plan.
              </template>
              <template v-else>
                Enterprise is billed per seat and unlocks SSO, SCIM provisioning, and unlimited people and projects.
              </template>
            </p>
          </div>
          <div class="flex flex-wrap gap-2">
            <RequestUpgradeButton target="enterprise" :pending="pending" :member-count="overview?.usage.members ?? 1" @update="load" />
            <Button v-if="pending?.target === 'enterprise'" size="sm" variant="outline" as-child>
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
            v-for="feature in appFeatures"
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

    <Card>
      <CardHeader>
        <CardTitle>Emails</CardTitle>
        <CardDescription>Which transactional emails this plan sends through SendGrid.</CardDescription>
      </CardHeader>
      <CardContent>
        <EmailEntitlementsCard bare :features="overview?.entitlements.features ?? null" />
      </CardContent>
    </Card>
  </div>
</template>

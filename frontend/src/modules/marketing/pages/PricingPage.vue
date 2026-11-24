<script setup lang="ts">
import { Check, X } from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import PageHeader from '@/components/common/PageHeader.vue'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { http } from '@/lib/http'
import { PLAN_FEATURES, type PlanFeatureKey } from '@/lib/plan-features'

interface PublicPlan {
  name: string
  description: string | null
  priceLabel: string | null
  maxMembers: number | null
  maxProjects: number | null
  isDefault: boolean
  position: number
}

interface MarketingPlan {
  name: string
  price: string
  description: string
  highlight?: boolean
  members: string
  projects: string
  included: PlanFeatureKey[]
  always: string[]
}

/** Fallback if the public pricing API is unreachable — mirrors DEFAULT_PLANS. */
const FALLBACK_PLANS: MarketingPlan[] = [
  {
    name: 'Free',
    price: 'Free',
    description: 'Run the full workday loop before you pay.',
    members: 'Up to 5 people',
    projects: 'Up to 2 projects',
    included: ['attachments', 'timeTracking', 'chat', 'directMessages', 'teamChat', 'meetings', 'calendar'],
    always: ['Tasks, board & backlog', 'Standup, chat & messages', 'Meetings & calendar'],
  },
  {
    name: 'Pro',
    price: '₹999 / month',
    description: 'For growing teams that want to automate their work. Includes a free trial when card checkout is on.',
    highlight: true,
    members: 'Up to 25 people',
    projects: 'Up to 20 projects',
    included: PLAN_FEATURES.map((feature) => feature.key),
    always: ['Everything in Free', 'Automation, templates & recurring', 'Reports & AI'],
  },
  {
    name: 'Enterprise',
    price: '₹2499 / month',
    description: 'Everything with no limits — SSO, SCIM, and self-serve checkout when Stripe Enterprise pricing is on.',
    members: 'Unlimited people',
    projects: 'Unlimited projects',
    included: PLAN_FEATURES.map((feature) => feature.key),
    always: ['Everything in Pro', 'SSO & SCIM', 'Unlimited seats & projects'],
  },
]

const plans = ref<MarketingPlan[]>(FALLBACK_PLANS)
const currency = ref<'INR' | 'USD'>('INR')
const isLoading = ref(true)

const limitLabel = (value: number | null, noun: string) =>
  value === null ? `Unlimited ${noun}` : `Up to ${value} ${noun}`

function toMarketingPlan(plan: PublicPlan): MarketingPlan {
  const fallback = FALLBACK_PLANS.find((item) => item.name.toLowerCase() === plan.name.toLowerCase())
  const isPro = plan.name.toLowerCase() === 'pro'
  const isEnterprise = plan.name.toLowerCase() === 'enterprise'
  return {
    name: plan.name,
    price: plan.priceLabel?.trim() || fallback?.price || 'Contact us',
    description: plan.description?.trim() || fallback?.description || '',
    highlight: isPro,
    members: limitLabel(plan.maxMembers, 'people'),
    projects: limitLabel(plan.maxProjects, 'projects'),
    included: fallback?.included ?? (isPro || isEnterprise ? PLAN_FEATURES.map((feature) => feature.key) : []),
    always: fallback?.always ?? [],
  }
}

onMounted(async () => {
  try {
    const { data } = await http.get<{
      pricing: { currency: 'INR' | 'USD' }
      plans: PublicPlan[]
    }>('/pricing')
    currency.value = data.pricing.currency
    if (data.plans?.length) plans.value = data.plans.map(toMarketingPlan)
  } catch {
    /* keep fallback cards */
  } finally {
    isLoading.value = false
  }
})

const appFeatures = PLAN_FEATURES.filter((feature) => feature.group === 'app')
const freePlan = computed(() => plans.value.find((plan) => plan.name.toLowerCase() === 'free') ?? plans.value[0]!)

function planHas(plan: MarketingPlan, key: PlanFeatureKey) {
  if (plan.name.toLowerCase() === 'enterprise' || plan.name.toLowerCase() === 'pro') return true
  return plan.included.includes(key)
}
</script>

<template>
  <div class="mx-auto w-full max-w-[90rem] space-y-8 p-4 sm:p-6 lg:p-8">
    <PageHeader
      title="Pricing"
      description="Free includes the workday loop (standup, chat, messages, meetings). Automation, reports and AI unlock on Pro — with a free trial when card checkout is on."
    >
      <template #actions>
        <Button variant="outline" as-child><RouterLink :to="{ name: 'landing' }">About</RouterLink></Button>
        <Button variant="outline" as-child><RouterLink :to="{ name: 'register' }">Create free account</RouterLink></Button>
        <Button as-child><RouterLink :to="{ name: 'login' }">Sign in</RouterLink></Button>
      </template>
    </PageHeader>

    <p class="text-center text-xs text-muted-foreground">
      Prices shown in {{ currency === 'USD' ? 'US dollars (USD)' : 'Indian rupees (INR)' }}.
    </p>

    <div v-if="isLoading" class="grid gap-4 lg:grid-cols-3">
      <Skeleton v-for="index in 3" :key="index" class="h-72 w-full rounded-xl" />
    </div>

    <div v-else class="grid gap-4 lg:grid-cols-3">
      <article
        v-for="plan in plans"
        :key="plan.name"
        class="flex flex-col rounded-xl border bg-card p-5 shadow-soft"
        :class="plan.highlight && 'border-primary/50 ring-1 ring-primary/30'"
      >
        <p class="text-sm font-medium text-muted-foreground">{{ plan.name }}</p>
        <p class="mt-1 text-2xl font-semibold tracking-tight">{{ plan.price }}</p>
        <p class="mt-2 text-sm text-muted-foreground">{{ plan.description }}</p>
        <ul class="mt-4 space-y-1.5 text-sm">
          <li>{{ plan.members }}</li>
          <li>{{ plan.projects }}</li>
          <li v-for="item in plan.always" :key="item" class="flex gap-2">
            <Check class="mt-0.5 size-4 shrink-0 text-success" />
            <span>{{ item }}</span>
          </li>
        </ul>
        <Button class="mt-5 w-full" :variant="plan.highlight ? 'default' : 'outline'" as-child>
          <RouterLink :to="{ name: 'register' }">
            {{ plan.name.toLowerCase() === 'free' ? 'Start free' : plan.name.toLowerCase() === 'pro' ? 'Try Pro free' : `Try ${plan.name}` }}
          </RouterLink>
        </Button>
      </article>
    </div>

    <section class="overflow-hidden rounded-xl border bg-card shadow-soft">
      <header class="border-b px-4 py-3">
        <h2 class="text-sm font-semibold">Feature comparison</h2>
        <p class="text-xs text-muted-foreground">Core board and tasks are on every plan. These switches are plan-gated.</p>
      </header>
      <ul class="divide-y lg:hidden">
        <li v-for="feature in appFeatures" :key="feature.key" class="px-4 py-3">
          <p class="font-medium">{{ feature.label }}</p>
          <p class="text-xs text-muted-foreground">{{ feature.description }}</p>
          <div class="mt-2 grid grid-cols-3 gap-2 text-xs">
            <span class="flex items-center gap-1.5">
              <Check v-if="planHas(freePlan, feature.key)" class="size-3.5 text-success" />
              <X v-else class="size-3.5 text-muted-foreground/50" />
              Free
            </span>
            <span class="flex items-center gap-1.5"><Check class="size-3.5 text-success" /> Pro</span>
            <span class="flex items-center gap-1.5"><Check class="size-3.5 text-success" /> Enterprise</span>
          </div>
        </li>
      </ul>
      <div class="hidden lg:block">
        <table class="w-full text-left text-sm">
          <thead class="bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th class="px-4 py-2.5 font-medium">Feature</th>
              <th class="px-3 py-2.5 font-medium">Free</th>
              <th class="px-3 py-2.5 font-medium">Pro</th>
              <th class="px-3 py-2.5 font-medium">Enterprise</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="feature in appFeatures" :key="feature.key" class="border-t border-border/70">
              <td class="px-4 py-2.5">
                <p class="font-medium">{{ feature.label }}</p>
                <p class="text-xs text-muted-foreground">{{ feature.description }}</p>
              </td>
              <td class="px-3 py-2.5">
                <Check v-if="planHas(freePlan, feature.key)" class="size-4 text-success" />
                <X v-else class="size-4 text-muted-foreground/50" />
              </td>
              <td class="px-3 py-2.5"><Check class="size-4 text-success" /></td>
              <td class="px-3 py-2.5"><Check class="size-4 text-success" /></td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <p class="text-center text-xs text-muted-foreground">
      See the
      <RouterLink :to="{ name: 'workday-preview' }" class="font-medium text-primary hover:underline">workday preview</RouterLink>
      or
      <RouterLink :to="{ name: 'register' }" class="font-medium text-primary hover:underline">create a Free workspace</RouterLink>.
    </p>
  </div>
</template>

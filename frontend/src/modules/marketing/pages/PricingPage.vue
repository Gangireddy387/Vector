<script setup lang="ts">
import { Check, X } from 'lucide-vue-next'
import { RouterLink } from 'vue-router'
import PageHeader from '@/components/common/PageHeader.vue'
import { Button } from '@/components/ui/button'
import { PLAN_FEATURES, type PlanFeatureKey } from '@/lib/plan-features'

/** Mirrors backend DEFAULT_PLANS — marketing honesty without a public plans API. */
const PLANS: Array<{
  name: string
  price: string
  description: string
  highlight?: boolean
  members: string
  projects: string
  included: PlanFeatureKey[]
  always: string[]
}> = [
  {
    name: 'Free',
    price: 'Free',
    description: 'For small teams getting started.',
    members: 'Up to 5 people',
    projects: 'Up to 2 projects',
    included: ['attachments', 'timeTracking'],
    always: ['Tasks, board & backlog', 'Projects & members', 'Inbox'],
  },
  {
    name: 'Pro',
    price: '₹999 / month',
    description: 'For growing teams that want to automate their work.',
    highlight: true,
    members: 'Up to 25 people',
    projects: 'Up to 20 projects',
    included: PLAN_FEATURES.map((feature) => feature.key),
    always: ['Everything in Free', 'Chat, standup & messages', 'Automation, reports & AI'],
  },
  {
    name: 'Enterprise',
    price: 'Contact us',
    description: 'Everything, with no limits.',
    members: 'Unlimited people',
    projects: 'Unlimited projects',
    included: PLAN_FEATURES.map((feature) => feature.key),
    always: ['Everything in Pro', 'Custom limits & support'],
  },
]

const appFeatures = PLAN_FEATURES.filter((feature) => feature.group === 'app')

function planHas(plan: (typeof PLANS)[number], key: PlanFeatureKey) {
  if (plan.name === 'Enterprise' || plan.name === 'Pro') return true
  return plan.included.includes(key)
}
</script>

<template>
  <div class="mx-auto w-full max-w-[90rem] space-y-8 p-4 sm:p-6 lg:p-8">
    <PageHeader
      title="Pricing"
      description="Free covers the core work loop. Collaboration, automation, reports and AI unlock on Pro — no surprises after sign-up."
    >
      <template #actions>
        <Button variant="outline" as-child><RouterLink :to="{ name: 'developers' }">API</RouterLink></Button>
        <Button variant="outline" as-child><RouterLink :to="{ name: 'register' }">Create free account</RouterLink></Button>
        <Button as-child><RouterLink :to="{ name: 'login' }">Sign in</RouterLink></Button>
      </template>
    </PageHeader>

    <div class="grid gap-4 lg:grid-cols-3">
      <article
        v-for="plan in PLANS"
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
          <RouterLink :to="plan.name === 'Enterprise' ? { name: 'register' } : { name: 'register' }">
            {{ plan.name === 'Free' ? 'Start free' : plan.name === 'Pro' ? 'Start free, upgrade later' : 'Talk to us' }}
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
              <Check v-if="planHas(PLANS[0]!, feature.key)" class="size-3.5 text-success" />
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
                <Check v-if="planHas(PLANS[0]!, feature.key)" class="size-4 text-success" />
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

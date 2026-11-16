<script setup lang="ts">
import { Check, Gem, Lock, Sparkles } from 'lucide-vue-next'
import { computed } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import CollabGuide from '@/components/common/CollabGuide.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import { Button } from '@/components/ui/button'
import { featureLabel, PLAN_FEATURES, type PlanFeatureKey } from '@/lib/plan-features'
import { useAuthStore } from '@/modules/auth/auth.store'

/** Collab unlocks people feel missing on Free — listed so the gate explains the product, not a dead end. */
const PRO_COLLAB: PlanFeatureKey[] = ['chat', 'directMessages', 'teamChat', 'meetings', 'calendar', 'aiAssistant', 'reports']

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const keys = computed(() => {
  const raw = route.query.feature
  const list = Array.isArray(raw) ? raw : raw ? [raw] : []
  return list.filter((key): key is PlanFeatureKey => PLAN_FEATURES.some((feature) => feature.key === key))
})

const primary = computed(() => keys.value[0] ?? null)
const title = computed(() => (primary.value ? featureLabel(primary.value) : 'This feature'))
const plan = computed(() => auth.organization?.entitlements?.planName ?? 'current plan')

const description = computed(() => {
  const detail = PLAN_FEATURES.find((feature) => feature.key === primary.value)?.description
  if (keys.value.length > 1) {
    return `Your ${plan.value} plan does not include ${keys.value.map(featureLabel).join(' or ')}. Upgrade to unlock collaboration for the whole organization.`
  }
  return detail
    ? `${detail}. Not on your ${plan.value} plan — ask the portal administrator to upgrade.`
    : `Your ${plan.value} plan does not include this. Ask the portal administrator to upgrade.`
})

const unlocks = computed(() =>
  PRO_COLLAB.map((key) => {
    const feature = PLAN_FEATURES.find((item) => item.key === key)!
    return {
      key,
      label: feature.label,
      description: feature.description,
      icon: feature.icon,
      locked: !auth.hasFeature(key),
      requested: keys.value.includes(key),
    }
  }),
)
</script>

<template>
  <div class="mx-auto flex min-h-full w-full max-w-2xl flex-1 flex-col justify-center gap-6 p-6">
    <EmptyState :icon="Lock" :title="`${title} isn’t on your plan`" :description="description" class="py-8">
      <div class="flex flex-wrap justify-center gap-2">
        <Button variant="outline" @click="router.push({ name: 'home' })">Back to Home</Button>
        <Button v-if="auth.isOrganizationAdmin" as-child>
          <RouterLink :to="{ name: 'workspace-admin', query: { tab: 'plan' } }"><Sparkles /> View plan</RouterLink>
        </Button>
      </div>
    </EmptyState>

    <section class="overflow-hidden rounded-xl border border-border bg-card shadow-soft">
      <header class="flex h-11 items-center gap-2 border-b border-border px-4">
        <Gem class="size-4 text-primary" />
        <h2 class="text-sm font-semibold">How collaboration fits</h2>
        <span class="text-xs text-muted-foreground">Workday loop</span>
      </header>
      <div class="p-1">
        <CollabGuide />
      </div>
    </section>

    <section class="overflow-hidden rounded-xl border border-border bg-card shadow-soft">
      <header class="flex h-11 items-center gap-2 border-b border-border px-4">
        <Gem class="size-4 text-primary" />
        <h2 class="text-sm font-semibold">What Pro unlocks</h2>
        <span class="text-xs text-muted-foreground">You’re on {{ plan }}</span>
      </header>
      <ul class="divide-y divide-border/70">
        <li
          v-for="item in unlocks"
          :key="item.key"
          class="flex items-start gap-3 px-4 py-3"
          :class="item.requested && 'bg-primary/[0.04]'"
        >
          <span
            class="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg"
            :class="item.locked ? 'bg-muted text-muted-foreground' : 'bg-success/15 text-success'"
          >
            <component :is="item.locked ? item.icon : Check" class="size-4" />
          </span>
          <span class="min-w-0 flex-1">
            <span class="flex flex-wrap items-center gap-2 text-[13px] font-medium">
              {{ item.label }}
              <span v-if="item.requested" class="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">Requested</span>
              <span v-else-if="!item.locked" class="rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-semibold text-success">On your plan</span>
            </span>
            <span class="mt-0.5 block text-[12px] text-muted-foreground">{{ item.description }}</span>
          </span>
        </li>
      </ul>
      <footer v-if="!auth.isOrganizationAdmin" class="border-t border-border px-4 py-3 text-[12px] text-muted-foreground">
        Ask an organization admin to open Organization settings → Plan and request an upgrade from the portal administrator.
      </footer>
    </section>
  </div>
</template>

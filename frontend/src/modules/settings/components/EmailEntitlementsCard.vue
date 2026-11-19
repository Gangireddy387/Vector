<script setup lang="ts">
import { Check, Lock, Mail, Minus } from 'lucide-vue-next'
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ALWAYS_SENT_EMAILS, PLAN_FEATURE_GROUPS, PLAN_FEATURES, type PlanFeatureKey } from '@/lib/plan-features'
import RequestUpgradeButton from '@/modules/admin/components/RequestUpgradeButton.vue'
import { useAuthStore } from '@/modules/auth/auth.store'

const props = withDefaults(
  defineProps<{
    /** Override session entitlements (e.g. from GET /workspace/plan). */
    features?: Partial<Record<PlanFeatureKey, boolean>> | null
    /** Show as a Card (settings) or bare section (nested in plan pages). */
    bare?: boolean
  }>(),
  { features: null, bare: false },
)

const auth = useAuthStore()
const emailGroup = PLAN_FEATURE_GROUPS.find((group) => group.value === 'email')
const emailFeatures = PLAN_FEATURES.filter((feature) => feature.group === 'email')

const resolved = computed(() => {
  const fromProp = props.features
  const fromSession = auth.organization?.entitlements?.features
  return fromProp ?? fromSession ?? null
})

const isOn = (key: PlanFeatureKey) => Boolean(resolved.value?.[key])
const lockedCount = computed(() => emailFeatures.filter((feature) => !isOn(feature.key)).length)
const planLink = computed(() =>
  auth.isOrganizationAdmin
    ? { name: 'workspace-admin' as const, query: { tab: 'plan' } }
    : { name: 'org-plan' as const },
)
</script>

<template>
  <component :is="bare ? 'section' : Card" :class="bare ? 'space-y-3' : 'gap-3'">
    <CardHeader v-if="!bare" class="border-b border-border/60 pb-3">
      <CardTitle class="flex items-center gap-2"><Mail class="size-4 text-primary" /> Emails on your plan</CardTitle>
      <CardDescription>
        {{ emailGroup?.hint }}
        <template v-if="lockedCount"> · {{ lockedCount }} locked</template>
      </CardDescription>
    </CardHeader>

    <component :is="bare ? 'div' : CardContent" class="space-y-3">
      <ul class="space-y-2">
        <li
          v-for="feature in emailFeatures"
          :key="feature.key"
          class="rounded-lg border p-3"
          :class="isOn(feature.key) ? 'border-border/70' : 'border-dashed border-border/60 bg-muted/20'"
        >
          <div class="flex items-start gap-3">
            <span
              class="mt-0.5 flex size-8 shrink-0 items-center justify-center"
              :class="isOn(feature.key) ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'"
            >
              <component :is="feature.icon" class="size-4" />
            </span>
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <p class="text-sm font-medium">{{ feature.label }}</p>
                <span
                  class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
                  :class="isOn(feature.key) ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground'"
                >
                  <component :is="isOn(feature.key) ? Check : Lock" class="size-3" />
                  {{ isOn(feature.key) ? 'Included' : 'Not on plan' }}
                </span>
              </div>
              <p class="mt-0.5 text-xs text-muted-foreground">{{ feature.description }}</p>
              <ul v-if="feature.includes?.length" class="mt-2 space-y-1">
                <li v-for="item in feature.includes" :key="item.name" class="text-xs">
                  <span class="font-medium text-foreground/90">{{ item.name }}</span>
                  <span class="text-muted-foreground"> — {{ item.detail }}</span>
                </li>
              </ul>
              <p v-if="!isOn(feature.key) && feature.whenOff" class="mt-2 text-xs text-amber-800 dark:text-amber-200">
                {{ feature.whenOff }}
              </p>
            </div>
            <span
              class="flex size-6 shrink-0 items-center justify-center"
              :class="isOn(feature.key) ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground'"
              :aria-label="isOn(feature.key) ? 'Included' : 'Not included'"
            >
              <component :is="isOn(feature.key) ? Check : Minus" class="size-3.5" />
            </span>
          </div>
        </li>
      </ul>

      <div class="rounded-lg border border-dashed border-border/80 bg-muted/30 p-3">
        <p class="text-xs font-semibold">Always sent on every plan</p>
        <ul class="mt-1.5 grid gap-1.5 sm:grid-cols-2">
          <li v-for="email in ALWAYS_SENT_EMAILS" :key="email.name" class="text-xs">
            <span class="font-medium text-foreground/90">{{ email.name }}</span>
            <span class="block text-muted-foreground">{{ email.detail }}</span>
          </li>
        </ul>
      </div>

      <div v-if="lockedCount" class="flex flex-wrap items-center gap-2">
        <RequestUpgradeButton target="pro" size="sm" />
        <Button size="sm" variant="outline" as-child>
          <RouterLink :to="planLink">View plan</RouterLink>
        </Button>
      </div>
    </component>
  </component>
</template>

<script setup lang="ts">
import { Lock, Sparkles } from 'lucide-vue-next'
import { computed } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import EmptyState from '@/components/common/EmptyState.vue'
import { Button } from '@/components/ui/button'
import { featureLabel, PLAN_FEATURES, type PlanFeatureKey } from '@/lib/plan-features'
import { useAuthStore } from '@/modules/auth/auth.store'

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
const description = computed(() => {
  const detail = PLAN_FEATURES.find((feature) => feature.key === primary.value)?.description
  const plan = auth.organization?.entitlements?.planName ?? 'current plan'
  if (keys.value.length > 1) {
    return `Your ${plan} does not include ${keys.value.map(featureLabel).join(' or ')}. Ask your portal administrator to upgrade.`
  }
  return detail
    ? `${detail}. Not on your ${plan} — ask the portal administrator to upgrade.`
    : `Your ${plan} does not include this. Ask the portal administrator to upgrade.`
})
</script>

<template>
  <div class="mx-auto flex w-full max-w-lg flex-1 items-center justify-center p-6">
    <EmptyState :icon="Lock" :title="`${title} isn’t on your plan`" :description="description" class="py-16">
      <div class="flex flex-wrap justify-center gap-2">
        <Button variant="outline" @click="router.push({ name: 'home' })">Back to Home</Button>
        <Button v-if="auth.isOrganizationAdmin" variant="default" as-child>
          <RouterLink :to="{ name: 'workspace-admin', query: { tab: 'plan' } }"><Sparkles /> View plan</RouterLink>
        </Button>
      </div>
    </EmptyState>
  </div>
</template>

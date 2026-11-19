<script setup lang="ts">
import { Lock } from 'lucide-vue-next'
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import CollabGuide from '@/components/common/CollabGuide.vue'
import { Button } from '@/components/ui/button'
import { type PlanFeatureKey } from '@/lib/plan-features'
import RequestUpgradeButton from '@/modules/admin/components/RequestUpgradeButton.vue'
import { useAuthStore } from '@/modules/auth/auth.store'

/** Pro differentiators still locked on Free after the workday loop is included. */
const CORE: PlanFeatureKey[] = ['aiAssistant', 'automations', 'recurringTasks', 'templates', 'reports']

const auth = useAuthStore()
const lockedCore = computed(() => CORE.filter((key) => !auth.hasFeature(key)))
const planName = computed(() => auth.organization?.entitlements?.planName ?? 'Free')
const show = computed(() => lockedCore.value.length >= 1)
</script>

<template>
  <section v-if="show" class="overflow-hidden rounded-xl border border-dashed border-border bg-card/80 shadow-soft">
    <header class="flex h-12 items-center gap-2 border-b border-border/70 px-4">
      <Lock class="size-4 text-muted-foreground" />
      <h2 class="text-sm font-semibold">More on Pro — you’re on {{ planName }}</h2>
      <span class="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
        {{ lockedCore.length }} locked
      </span>
    </header>
    <div class="space-y-3 px-4 py-3">
      <p class="text-[12.5px] text-muted-foreground">
        Free already includes standup, chat, messages and meetings. Pro adds automation, AI, templates, recurring work and reports.
      </p>
      <CollabGuide dense />
      <div class="flex flex-wrap gap-2">
        <RequestUpgradeButton target="pro" />
        <Button size="sm" variant="outline" as-child>
          <RouterLink :to="{ name: 'org-plan' }">View plan</RouterLink>
        </Button>
        <Button size="sm" variant="outline" as-child>
          <RouterLink :to="{ name: 'feature-locked', query: { feature: lockedCore } }">See what’s gated</RouterLink>
        </Button>
      </div>
    </div>
  </section>
</template>

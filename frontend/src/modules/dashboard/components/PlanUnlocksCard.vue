<script setup lang="ts">
import { Gem, Lock } from 'lucide-vue-next'
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import CollabGuide from '@/components/common/CollabGuide.vue'
import { Button } from '@/components/ui/button'
import { type PlanFeatureKey } from '@/lib/plan-features'
import { useAuthStore } from '@/modules/auth/auth.store'

/** Free (and thin) plans: explain collab gates so Home never feels broken or empty. */
const CORE: PlanFeatureKey[] = ['chat', 'directMessages', 'teamChat', 'meetings']

const auth = useAuthStore()
const lockedCore = computed(() => CORE.filter((key) => !auth.hasFeature(key)))
const planName = computed(() => auth.organization?.entitlements?.planName ?? 'Free')
const show = computed(() => lockedCore.value.length >= 1)
</script>

<template>
  <section v-if="show" class="overflow-hidden rounded-xl border border-dashed border-border bg-card/80 shadow-soft">
    <header class="flex h-12 items-center gap-2 border-b border-border/70 px-4">
      <Lock class="size-4 text-muted-foreground" />
      <h2 class="text-sm font-semibold">Collaboration on {{ planName }}</h2>
      <span class="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
        {{ lockedCore.length }} locked
      </span>
    </header>
    <div class="space-y-3 px-4 py-3">
      <p class="text-[12.5px] text-muted-foreground">
        Mid-loop gates aren’t dead ends — standup, Messages and meetings unlock on Pro so the whole org can run the same workday.
      </p>
      <CollabGuide dense />
      <div class="flex flex-wrap gap-2">
        <Button v-if="auth.isOrganizationAdmin" size="sm" as-child>
          <RouterLink :to="{ name: 'workspace-admin', query: { tab: 'plan' } }"><Gem /> Upgrade plan</RouterLink>
        </Button>
        <Button size="sm" variant="outline" as-child>
          <RouterLink :to="{ name: 'feature-locked', query: { feature: lockedCore } }">See what’s gated</RouterLink>
        </Button>
      </div>
    </div>
  </section>
</template>

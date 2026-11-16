<script setup lang="ts">
import { Gem, Lock, MessageCircle, MessagesSquare, Sparkles, Video } from 'lucide-vue-next'
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { Button } from '@/components/ui/button'
import { type PlanFeatureKey, featureLabel } from '@/lib/plan-features'
import { useAuthStore } from '@/modules/auth/auth.store'

/** Collab features Free plans usually lack — shown so Home doesn’t feel empty without explanation. */
const COLLAB: Array<{ key: PlanFeatureKey; icon: typeof Video; blurb: string }> = [
  { key: 'chat', icon: MessagesSquare, blurb: 'Project Work chat and daily standups' },
  { key: 'directMessages', icon: MessageCircle, blurb: 'Private one-to-one Messages' },
  { key: 'teamChat', icon: MessageCircle, blurb: 'Team and department channels' },
  { key: 'meetings', icon: Video, blurb: 'Video meetings and action-item follow-ups' },
  { key: 'calendar', icon: Sparkles, blurb: 'Calendar with due dates synced' },
  { key: 'aiAssistant', icon: Sparkles, blurb: 'Daily briefing and draft help' },
]

const auth = useAuthStore()

const locked = computed(() => COLLAB.filter((item) => !auth.hasFeature(item.key)))
const planName = computed(() => auth.organization?.entitlements?.planName ?? 'Free')
const show = computed(() => locked.value.length >= 2)
</script>

<template>
  <section v-if="show" class="overflow-hidden rounded-xl border border-dashed border-border bg-card/80 shadow-soft">
    <header class="flex h-12 items-center gap-2 border-b border-border/70 px-4">
      <Lock class="size-4 text-muted-foreground" />
      <h2 class="text-sm font-semibold">Unlock collaboration</h2>
      <span class="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{{ planName }}</span>
    </header>
    <div class="space-y-3 px-4 py-3">
      <p class="text-[12.5px] text-muted-foreground">
        Your plan is light on team chat, meetings and standups. These stay locked until an admin upgrades — so Home isn’t broken, just gated.
      </p>
      <ul class="grid gap-2 sm:grid-cols-2">
        <li v-for="item in locked.slice(0, 6)" :key="item.key" class="flex items-start gap-2.5 rounded-lg border border-border/70 bg-muted/20 px-3 py-2">
          <span class="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
            <component :is="item.icon" class="size-3.5" />
          </span>
          <span class="min-w-0">
            <span class="block text-[12.5px] font-medium">{{ featureLabel(item.key) }}</span>
            <span class="block text-[11.5px] text-muted-foreground">{{ item.blurb }}</span>
          </span>
        </li>
      </ul>
      <div class="flex flex-wrap gap-2">
        <Button v-if="auth.isOrganizationAdmin" size="sm" as-child>
          <RouterLink :to="{ name: 'workspace-admin', query: { tab: 'plan' } }"><Gem /> View plan</RouterLink>
        </Button>
        <Button v-else size="sm" variant="outline" as-child>
          <RouterLink :to="{ name: 'feature-locked', query: { feature: locked.map((item) => item.key) } }">What’s locked</RouterLink>
        </Button>
      </div>
    </div>
  </section>
</template>

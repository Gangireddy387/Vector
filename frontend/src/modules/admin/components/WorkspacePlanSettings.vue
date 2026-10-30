<script setup lang="ts">
import { Check, FolderKanban, Gem, Minus, Users } from 'lucide-vue-next'
import { computed, onMounted, ref, watch } from 'vue'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { PLAN_FEATURES } from '@/lib/plan-features'
import { useAuthStore } from '@/modules/auth/auth.store'
import { workspaceApi } from '../admin.api'

/** The organization's plan as the super admin set it: limits with current usage, and included features. */
const auth = useAuthStore()
const overview = ref<Awaited<ReturnType<typeof workspaceApi.plan>> | null>(null)

const load = async () => (overview.value = await workspaceApi.plan())
onMounted(load)
// The super admin can change the plan while this page is open.
watch(() => auth.organization?.entitlements, load, { deep: true })

const usageRows = computed(() => {
  if (!overview.value) return []
  const { limits } = overview.value.entitlements
  const { usage } = overview.value
  return [
    { label: 'People', icon: Users, used: usage.members, limit: limits.members },
    { label: 'Projects', icon: FolderKanban, used: usage.projects, limit: limits.projects },
  ].map((row) => ({ ...row, percent: row.limit ? Math.min(100, Math.round((row.used / row.limit) * 100)) : 0 }))
})
</script>

<template>
  <div class="space-y-4">
    <Card>
      <CardHeader>
        <CardTitle class="flex items-center gap-2"><Gem class="size-4 text-primary" /> {{ overview?.entitlements.planName ?? 'Full access' }} plan</CardTitle>
        <CardDescription>Your plan is set by the portal administrator. Ask them if you need more people, projects or features.</CardDescription>
      </CardHeader>
      <CardContent>
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
            <p v-if="row.limit && row.used >= row.limit" class="text-xs text-destructive">Limit reached. Ask the portal administrator to upgrade.</p>
          </div>
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

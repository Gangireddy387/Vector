<script setup lang="ts">
import { Gauge } from 'lucide-vue-next'
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { Button } from '@/components/ui/button'
import { hasFiniteLimits, isNearLimit } from '@/lib/plan-usage'
import { workspaceApi } from '@/modules/admin/admin.api'
import { useAuthStore } from '@/modules/auth/auth.store'
import UsageMeters from '@/modules/plan/components/UsageMeters.vue'

/** Home widget: seat / project usage for capped plans. */
const auth = useAuthStore()
const overview = ref<Awaited<ReturnType<typeof workspaceApi.plan>> | null>(null)
const loading = ref(true)

async function load() {
  loading.value = true
  try {
    overview.value = await workspaceApi.plan()
  } catch {
    overview.value = null
  } finally {
    loading.value = false
  }
}

onMounted(load)
watch(() => auth.organization?.id, load)
watch(() => auth.organization?.entitlements, load, { deep: true })

const limits = computed(() => overview.value?.entitlements.limits ?? auth.organization?.entitlements?.limits ?? null)
const usage = computed(() => overview.value?.usage ?? null)
const planName = computed(() => overview.value?.entitlements.planName ?? auth.organization?.entitlements?.planName ?? 'Free')
const pending = computed(() => overview.value?.upgradeRequest ?? null)

const show = computed(() => {
  if (!hasFiniteLimits(limits.value)) return false
  if (loading.value) return true
  if (!usage.value || !limits.value) return false
  // Always show on Free/Pro caps; emphasize when halfway or nearer.
  return true
})

const nearAny = computed(() => {
  if (!usage.value || !limits.value) return false
  return isNearLimit(usage.value.members, limits.value.members) || isNearLimit(usage.value.projects, limits.value.projects)
})
</script>

<template>
  <section v-if="show" class="overflow-hidden rounded-xl border border-border bg-card/80 shadow-soft" :class="nearAny && 'border-amber-500/40'">
    <header class="flex h-12 items-center gap-2 border-b border-border/70 px-4">
      <Gauge class="size-4 text-muted-foreground" />
      <h2 class="text-sm font-semibold">Usage — {{ planName }}</h2>
      <span
        v-if="nearAny"
        class="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:text-amber-200"
      >
        Near limit
      </span>
      <Button size="sm" variant="ghost" class="ml-auto h-7 px-2 text-xs" as-child>
        <RouterLink :to="{ name: 'org-plan' }">View plan</RouterLink>
      </Button>
    </header>
    <div class="px-4 py-3">
      <UsageMeters
        :usage="usage"
        :limits="limits"
        :pending="pending"
        :member-count="usage?.members ?? 1"
        :loading="loading && !overview"
        compact
        @update="load"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
import { FolderKanban, Users } from 'lucide-vue-next'
import { computed } from 'vue'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { usageIndicatorClass, usagePercent, usageWarningClass, usageWarningLabel } from '@/lib/plan-usage'
import type { UpgradeRequest, UpgradeTarget } from '@/modules/admin/admin.api'
import RequestUpgradeButton from '@/modules/admin/components/RequestUpgradeButton.vue'

const props = withDefaults(
  defineProps<{
    usage: { members: number; projects: number } | null
    limits: { members: number | null; projects: number | null } | null
    pending?: UpgradeRequest | null
    focusRequest?: UpgradeTarget | null
    memberCount?: number
    loading?: boolean
    /** Extra near-limit copy for seats (admin billing context). */
    seatNearHint?: string
    /** Extra near-limit copy for projects. */
    projectNearHint?: string
    /** Single-column strip for dialogs / banners. */
    compact?: boolean
    showUpgrade?: boolean
    /** Limit which meters render (create/invite contexts). */
    only?: Array<'seats' | 'projects'>
  }>(),
  {
    pending: null,
    focusRequest: null,
    memberCount: 1,
    loading: false,
    compact: false,
    showUpgrade: true,
  },
)

const emit = defineEmits<{ update: [] }>()

const rows = computed(() => {
  if (!props.usage || !props.limits) return []
  const all = [
    { key: 'seats' as const, label: 'People', icon: Users, used: props.usage.members, limit: props.limits.members, hint: props.seatNearHint },
    { key: 'projects' as const, label: 'Projects', icon: FolderKanban, used: props.usage.projects, limit: props.limits.projects, hint: props.projectNearHint },
  ]
  const filtered = props.only?.length ? all.filter((row) => props.only!.includes(row.key)) : all
  return filtered.map((row) => ({
    ...row,
    percent: usagePercent(row.used, row.limit),
  }))
})
</script>

<template>
  <div v-if="loading" class="grid gap-3" :class="compact ? 'grid-cols-1' : 'sm:grid-cols-2'">
    <Skeleton v-for="index in compact ? 1 : 2" :key="index" class="h-20" />
  </div>
  <div v-else class="grid gap-3" :class="compact ? 'grid-cols-1' : 'sm:grid-cols-2'">
    <div
      v-for="row in rows"
      :key="row.label"
      class="space-y-2.5 border border-border/70"
      :class="compact ? 'p-3' : 'p-4'"
    >
      <div class="flex items-center justify-between text-sm">
        <span class="flex items-center gap-2 font-medium">
          <component :is="row.icon" class="size-4 text-muted-foreground" /> {{ row.label }}
        </span>
        <span class="tabular-nums text-muted-foreground">
          <span class="font-semibold text-foreground">{{ row.used }}</span> / {{ row.limit ?? 'Unlimited' }}
        </span>
      </div>
      <Progress
        v-if="row.limit"
        :model-value="row.percent"
        class="h-1.5"
        :indicator-class="usageIndicatorClass(row.percent)"
      />
      <div
        v-if="row.limit && (row.percent >= 80 || focusRequest === row.key)"
        class="flex flex-wrap items-center gap-2 rounded-md"
        :class="focusRequest === row.key && 'ring-2 ring-primary/30 ring-offset-2 ring-offset-background'"
      >
        <p class="flex-1 text-xs" :class="usageWarningClass(row.percent)">
          {{ usageWarningLabel(row.percent) }}
          <template v-if="row.hint"> {{ row.hint }}</template>
        </p>
        <RequestUpgradeButton
          v-if="showUpgrade"
          :target="row.key"
          size="sm"
          variant="outline"
          :pending="pending"
          :member-count="memberCount"
          @update="emit('update')"
        />
      </div>
    </div>
  </div>
</template>

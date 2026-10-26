<script setup lang="ts">
import { computed } from 'vue'
import UserAvatar from '@/components/common/UserAvatar.vue'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { ReportOverview } from '../reports.api'

const props = defineProps<{ rows: ReportOverview['workload']; days: number }>()
const maxOpen = computed(() => Math.max(1, ...props.rows.map((row) => row.open)))
</script>

<template>
  <Card class="gap-0 pb-0">
    <CardHeader class="pb-3">
      <CardTitle>Team workload</CardTitle>
      <CardDescription>Who is carrying what right now, and what each person finished in the last {{ days }} days.</CardDescription>
    </CardHeader>
    <CardContent class="overflow-x-auto px-0">
      <table v-if="rows.length" class="w-full min-w-[34rem] text-sm">
        <thead>
          <tr class="border-y bg-muted/40 text-left text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            <th class="px-4 py-2 font-semibold">Person</th>
            <th class="w-1/3 px-3 py-2 font-semibold">Open tasks</th>
            <th class="px-3 py-2 text-right font-semibold">Points</th>
            <th class="px-3 py-2 text-right font-semibold">Overdue</th>
            <th class="px-4 py-2 text-right font-semibold">Completed</th>
          </tr>
        </thead>
        <tbody class="divide-y">
          <tr v-for="row in rows" :key="row.user?.id ?? 'unassigned'">
            <td class="px-4 py-2.5">
              <span class="flex items-center gap-2.5">
                <UserAvatar :user="row.user" size="sm" />
                <span class="truncate" :class="!row.user && 'text-muted-foreground italic'">{{ row.user?.name ?? 'Unassigned' }}</span>
              </span>
            </td>
            <td class="px-3 py-2.5">
              <span class="flex items-center gap-2">
                <span class="h-2 flex-1 bg-muted">
                  <span class="block h-full bg-primary transition-[width] duration-500" :style="{ width: `${(row.open / maxOpen) * 100}%` }" />
                </span>
                <span class="w-6 text-right tabular-nums">{{ row.open }}</span>
              </span>
            </td>
            <td class="px-3 py-2.5 text-right text-muted-foreground tabular-nums">{{ row.openPoints || '—' }}</td>
            <td class="px-3 py-2.5 text-right tabular-nums" :class="row.overdue ? 'font-semibold text-destructive' : 'text-muted-foreground'">{{ row.overdue }}</td>
            <td class="px-4 py-2.5 text-right tabular-nums">{{ row.completedInPeriod }}</td>
          </tr>
        </tbody>
      </table>
      <p v-else class="px-4 py-8 text-center text-sm text-muted-foreground">Nobody has work matching these filters.</p>
    </CardContent>
  </Card>
</template>

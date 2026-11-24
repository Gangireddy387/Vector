<script setup lang="ts">
import { computed } from 'vue'
import ResponsiveTable from '@/components/common/ResponsiveTable.vue'
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
    <CardContent class="px-0">
      <p v-if="!rows.length" class="px-4 py-8 text-center text-sm text-muted-foreground">Nobody has work matching these filters.</p>
      <ResponsiveTable v-else>
        <template #list>
          <ul class="divide-y">
            <li v-for="row in rows" :key="row.user?.id ?? 'unassigned'" class="space-y-2 px-4 py-3">
              <span class="flex min-w-0 items-center gap-2.5">
                <UserAvatar :user="row.user" size="sm" />
                <span class="min-w-0 flex-1 truncate" :class="!row.user && 'text-muted-foreground italic'">{{ row.user?.name ?? 'Unassigned' }}</span>
                <span class="shrink-0 text-sm font-semibold tabular-nums">{{ row.open }} open</span>
              </span>
              <span class="block h-1.5 bg-muted">
                <span class="block h-full bg-primary" :style="{ width: `${(row.open / maxOpen) * 100}%` }" />
              </span>
              <span class="grid grid-cols-3 gap-2 text-xs">
                <span><span class="block text-muted-foreground">Points</span><span class="font-medium tabular-nums">{{ row.openPoints || '—' }}</span></span>
                <span><span class="block text-muted-foreground">Overdue</span><span class="font-medium tabular-nums" :class="row.overdue ? 'text-destructive' : ''">{{ row.overdue }}</span></span>
                <span><span class="block text-muted-foreground">Completed</span><span class="font-medium tabular-nums">{{ row.completedInPeriod }}</span></span>
              </span>
            </li>
          </ul>
        </template>
        <template #table>
          <table class="w-full text-sm">
            <thead>
              <tr class="border-y bg-muted/40 text-left text-xs font-medium text-muted-foreground">
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
        </template>
      </ResponsiveTable>
    </CardContent>
  </Card>
</template>

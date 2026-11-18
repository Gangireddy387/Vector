<script setup lang="ts">
import { ChevronRight } from 'lucide-vue-next'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import type { ReportOverview } from '../reports.api'

defineProps<{ rows: ReportOverview['byProject']; days: number }>()
const emit = defineEmits<{ select: [projectId: string] }>()
</script>

<template>
  <Card class="gap-0 pb-0">
    <CardHeader class="pb-3">
      <CardTitle>Projects at a glance</CardTitle>
      <CardDescription>Compare progress across projects. Click a row to focus the report on it.</CardDescription>
    </CardHeader>
    <CardContent class="px-0">
      <ul class="divide-y xl:hidden">
        <li v-for="row in rows" :key="row.project.id">
          <button
            type="button"
            class="flex w-full flex-col gap-2 px-4 py-3 text-left transition-colors hover:bg-accent/50 focus-visible:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset focus-visible:outline-none"
            @click="emit('select', row.project.id)"
          >
            <span class="flex min-w-0 items-center gap-2.5">
              <span class="flex size-7 shrink-0 items-center justify-center text-[10px] font-bold text-white" :style="{ backgroundColor: row.project.color }">
                {{ row.project.key.slice(0, 2) }}
              </span>
              <span class="min-w-0 flex-1">
                <span class="block truncate font-medium">{{ row.project.name }}</span>
                <span class="block text-xs text-muted-foreground">{{ row.total }} issues · {{ row.project.type === 'scrum' ? 'Scrum' : 'Kanban' }}</span>
              </span>
              <ChevronRight class="size-4 shrink-0 text-muted-foreground" />
            </span>
            <span class="grid grid-cols-3 gap-2 text-xs">
              <span><span class="block text-muted-foreground">Open</span><span class="font-medium tabular-nums">{{ row.open }}</span></span>
              <span><span class="block text-muted-foreground">Completed</span><span class="font-medium tabular-nums">{{ row.completedInPeriod }}</span></span>
              <span><span class="block text-muted-foreground">Overdue</span><span class="font-medium tabular-nums" :class="row.overdue ? 'text-destructive' : ''">{{ row.overdue }}</span></span>
            </span>
            <span class="flex items-center gap-2">
              <Progress :model-value="row.completionRate" class="h-1.5 flex-1" indicator-class="bg-success" />
              <span class="w-16 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{{ row.completionRate }}% · {{ row.averageCycleDays === null ? '—' : `${row.averageCycleDays}d` }}</span>
            </span>
          </button>
        </li>
      </ul>
      <div class="hidden overflow-x-auto xl:block">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-y bg-muted/40 text-left text-xs font-medium text-muted-foreground">
            <th class="px-4 py-2 font-semibold">Project</th>
            <th class="px-3 py-2 text-right font-semibold">Open</th>
            <th class="px-3 py-2 text-right font-semibold">Completed ({{ days }}d)</th>
            <th class="px-3 py-2 text-right font-semibold">Overdue</th>
            <th class="w-48 px-3 py-2 font-semibold">Progress</th>
            <th class="px-3 py-2 text-right font-semibold">Cycle time</th>
            <th class="w-8" />
          </tr>
        </thead>
        <tbody class="divide-y">
          <tr
            v-for="row in rows"
            :key="row.project.id"
            class="cursor-pointer transition-colors hover:bg-accent/50"
            tabindex="0"
            @click="emit('select', row.project.id)"
            @keydown.enter="emit('select', row.project.id)"
          >
            <td class="px-4 py-2.5">
              <span class="flex items-center gap-2.5">
                <span class="flex size-7 shrink-0 items-center justify-center text-[10px] font-bold text-white" :style="{ backgroundColor: row.project.color }">
                  {{ row.project.key.slice(0, 2) }}
                </span>
                <span class="min-w-0">
                  <span class="block truncate font-medium">{{ row.project.name }}</span>
                  <span class="block text-xs text-muted-foreground">{{ row.total }} issues · {{ row.project.type === 'scrum' ? 'Scrum' : 'Kanban' }}</span>
                </span>
              </span>
            </td>
            <td class="px-3 py-2.5 text-right tabular-nums">{{ row.open }}</td>
            <td class="px-3 py-2.5 text-right tabular-nums">{{ row.completedInPeriod }}</td>
            <td class="px-3 py-2.5 text-right tabular-nums" :class="row.overdue ? 'font-semibold text-destructive' : 'text-muted-foreground'">{{ row.overdue }}</td>
            <td class="px-3 py-2.5">
              <span class="flex items-center gap-2">
                <Progress :model-value="row.completionRate" class="h-1.5 flex-1" indicator-class="bg-success" />
                <span class="w-9 text-right text-xs tabular-nums text-muted-foreground">{{ row.completionRate }}%</span>
              </span>
            </td>
            <td class="px-3 py-2.5 text-right text-muted-foreground tabular-nums">{{ row.averageCycleDays === null ? '—' : `${row.averageCycleDays}d` }}</td>
            <td class="pr-3 text-muted-foreground"><ChevronRight class="size-4" /></td>
          </tr>
        </tbody>
      </table>
      </div>
    </CardContent>
  </Card>
</template>

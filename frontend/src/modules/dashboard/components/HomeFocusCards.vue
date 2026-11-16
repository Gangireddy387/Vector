<script setup lang="ts">
import { AlertTriangle, ArrowRight, ListTodo } from 'lucide-vue-next'
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import UserAvatar from '@/components/common/UserAvatar.vue'
import { Button } from '@/components/ui/button'
import type { DashboardData } from '../dashboard.api'

const props = defineProps<{ data: DashboardData }>()

const actions = computed(() => props.data.meetingActions ?? [])
const rollup = computed(() => props.data.standupRollup ?? [])
const rollupAttention = computed(() => rollup.value.filter((row) => row.missing.length || row.blockers.length))
const hasAnything = computed(() => actions.value.length || rollup.value.length)
</script>

<template>
  <section v-if="hasAnything" class="space-y-2.5">
    <!-- Meeting action items → tracked tasks -->
    <div v-if="actions.length" class="overflow-hidden rounded-xl border border-border bg-card shadow-soft">
      <header class="flex h-11 items-center gap-2 border-b border-border px-4">
        <ListTodo class="size-4 text-primary" />
        <h2 class="text-sm font-semibold">Meeting → tasks</h2>
        <span class="text-xs text-muted-foreground">One click into tracked work</span>
      </header>
      <ul class="divide-y divide-border/70">
        <li v-for="item in actions.slice(0, 4)" :key="item.meetingId">
          <RouterLink
            :to="{ name: 'meeting-room', params: { meetingId: item.meetingId }, query: { focus: 'actions' } }"
            class="flex items-start gap-3 px-4 py-2.5 transition-colors hover:bg-accent/50"
          >
            <div class="min-w-0 flex-1">
              <p class="truncate text-[13px] font-medium">{{ item.title }}</p>
              <p class="text-[12px] text-muted-foreground">{{ item.openCount }} open · {{ item.preview[0] }}</p>
            </div>
            <span class="mt-0.5 shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">Create tasks</span>
          </RouterLink>
        </li>
      </ul>
    </div>

    <div v-if="rollup.length" class="overflow-hidden rounded-xl border border-border bg-card shadow-soft">
      <header class="flex h-11 items-center gap-2 border-b border-border px-4">
        <AlertTriangle class="size-4 text-amber-600 dark:text-amber-400" />
        <h2 class="text-sm font-semibold">Standup rollup</h2>
        <span class="text-xs text-muted-foreground">Leads & admins</span>
        <Button variant="ghost" size="sm" class="ml-auto text-muted-foreground" as-child>
          <RouterLink :to="{ name: 'standup-rollup' }">Full view <ArrowRight /></RouterLink>
        </Button>
      </header>
      <ul class="divide-y divide-border/70">
        <li v-for="row in (rollupAttention.length ? rollupAttention : rollup).slice(0, 4)" :key="row.projectId">
          <RouterLink
            :to="{ name: 'project-standup', params: { projectId: row.projectId }, query: { date: row.date } }"
            class="flex items-start gap-3 px-4 py-2.5 transition-colors hover:bg-accent/50"
          >
            <span class="mt-1.5 size-2.5 shrink-0 rounded-[3px]" :style="{ backgroundColor: row.projectColor }" />
            <div class="min-w-0 flex-1">
              <p class="truncate text-[13px] font-medium">{{ row.projectName }}</p>
              <p class="text-[12px] text-muted-foreground">
                {{ row.posted }}/{{ row.expected }} posted
                <template v-if="row.missing.length"> · {{ row.missing.length }} missing</template>
                <template v-if="row.blockers.length"> · {{ row.blockers.length }} blocked</template>
              </p>
              <div v-if="row.missing.length" class="mt-1.5 flex -space-x-1.5">
                <UserAvatar v-for="person in row.missing.slice(0, 5)" :key="person.id" :user="person" size="xs" class="ring-2 ring-card" />
              </div>
            </div>
            <ArrowRight class="mt-1 size-3.5 shrink-0 text-muted-foreground" />
          </RouterLink>
        </li>
      </ul>
    </div>
  </section>
</template>

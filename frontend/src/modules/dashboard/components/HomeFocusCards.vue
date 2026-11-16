<script setup lang="ts">
import { AlertTriangle, ArrowRight, ClipboardList, ListTodo, MessagesSquare } from 'lucide-vue-next'
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/modules/auth/auth.store'
import { useMessagesStore } from '@/modules/messages/messages.store'
import type { DashboardData } from '../dashboard.api'

const props = defineProps<{ data: DashboardData }>()
const auth = useAuthStore()
const messages = useMessagesStore()

const standup = computed(() => props.data.standupPending ?? [])
const actions = computed(() => props.data.meetingActions ?? [])
const rollup = computed(() => (props.data.standupRollup ?? []).filter((row) => row.missing.length || row.blockers.length))
const unread = computed(() => messages.unreadTotal)
const showMessages = computed(() => auth.hasFeature('directMessages') || auth.hasFeature('teamChat'))
const hasAnything = computed(() => standup.value.length || actions.value.length || rollup.value.length || (showMessages.value && unread.value > 0))
</script>

<template>
  <section v-if="hasAnything" class="space-y-2.5">
    <!-- Post standup -->
    <div
      v-if="standup.length"
      class="flex flex-col gap-3 rounded-xl border border-primary/20 bg-primary/[0.04] px-4 py-3 sm:flex-row sm:items-center"
    >
      <span class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><ClipboardList class="size-4" /></span>
      <div class="min-w-0 flex-1">
        <p class="text-[13.5px] font-semibold">Post today’s standup</p>
        <p class="text-[12.5px] text-muted-foreground">
          Still needed in
          <template v-for="(item, index) in standup.slice(0, 3)" :key="item.projectId">
            <span v-if="index">{{ index === standup.slice(0, 3).length - 1 && standup.length <= 3 ? ' and ' : ', ' }}</span>
            {{ item.projectName }}
          </template>
          <template v-if="standup.length > 3"> and {{ standup.length - 3 }} more</template>.
        </p>
      </div>
      <Button size="sm" class="shrink-0 self-start sm:self-center" as-child>
        <RouterLink :to="{ name: 'project-standup', params: { projectId: standup[0]!.projectId }, query: { date: standup[0]!.date } }">
          Write standup <ArrowRight />
        </RouterLink>
      </Button>
    </div>

    <!-- Unread messages -->
    <RouterLink
      v-if="showMessages && unread"
      :to="{ name: 'messages' }"
      class="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-soft transition-colors hover:bg-accent/40"
    >
      <span class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground"><MessagesSquare class="size-4" /></span>
      <div class="min-w-0 flex-1">
        <p class="text-[13.5px] font-semibold">{{ unread }} unread {{ unread === 1 ? 'message' : 'messages' }}</p>
        <p class="text-[12.5px] text-muted-foreground">DMs and team chats — separate from project work chat.</p>
      </div>
      <ArrowRight class="size-4 shrink-0 text-muted-foreground" />
    </RouterLink>

    <!-- Meeting action items → tasks -->
    <div v-if="actions.length" class="overflow-hidden rounded-xl border border-border bg-card shadow-soft">
      <header class="flex h-11 items-center gap-2 border-b border-border px-4">
        <ListTodo class="size-4 text-primary" />
        <h2 class="text-sm font-semibold">Meeting follow-ups</h2>
        <span class="text-xs text-muted-foreground">Turn action items into tasks</span>
      </header>
      <ul class="divide-y divide-border/70">
        <li v-for="item in actions.slice(0, 4)" :key="item.meetingId">
          <RouterLink
            :to="{ name: 'meeting-room', params: { meetingId: item.meetingId } }"
            class="flex items-start gap-3 px-4 py-2.5 transition-colors hover:bg-accent/50"
          >
            <div class="min-w-0 flex-1">
              <p class="truncate text-[13px] font-medium">{{ item.title }}</p>
              <p class="text-[12px] text-muted-foreground">{{ item.openCount }} open · {{ item.preview[0] }}</p>
            </div>
            <ArrowRight class="mt-1 size-3.5 shrink-0 text-muted-foreground" />
          </RouterLink>
        </li>
      </ul>
    </div>

    <!-- Lead rollup -->
    <div v-if="rollup.length" class="overflow-hidden rounded-xl border border-border bg-card shadow-soft">
      <header class="flex h-11 items-center gap-2 border-b border-border px-4">
        <AlertTriangle class="size-4 text-amber-600 dark:text-amber-400" />
        <h2 class="text-sm font-semibold">Standup rollup</h2>
        <span class="text-xs text-muted-foreground">Projects you admin</span>
      </header>
      <ul class="divide-y divide-border/70">
        <li v-for="row in rollup.slice(0, 5)" :key="row.projectId">
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
                <template v-if="row.blockers.length"> · {{ row.blockers.length }} with blockers</template>
              </p>
            </div>
            <ArrowRight class="mt-1 size-3.5 shrink-0 text-muted-foreground" />
          </RouterLink>
        </li>
      </ul>
    </div>
  </section>
</template>

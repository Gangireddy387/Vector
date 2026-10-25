<script setup lang="ts">
import { AlarmClock, CircleAlert, CircleCheck, CircleDashed, Pencil } from 'lucide-vue-next'
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import RichText from '@/components/common/RichText.vue'
import UserAvatar from '@/components/common/UserAvatar.vue'
import { Button } from '@/components/ui/button'
import { formatDate } from '@/lib/format'
import type { StandupIssue, StandupMember } from '../standup.api'

const props = defineProps<{ member: StandupMember; issueKeys: string[]; previousDate: string; isMe: boolean }>()
const emit = defineEmits<{ edit: [] }>()

const update = computed(() => props.member.update)
const sections = computed(() =>
  update.value
    ? ([
        { label: `Since ${formatDate(props.previousDate, 'EEE')}`, text: update.value.yesterday },
        { label: 'Today', text: update.value.today },
      ] as const).filter((section) => section.text)
    : [],
)
const chips = (issues: StandupIssue[]) => issues.slice(0, 4)
const hasSignals = computed(() => Boolean(props.member.signals.completed.length || props.member.signals.inProgress.length || props.member.signals.overdue))
</script>

<template>
  <article class="flex flex-col border bg-card shadow-soft" :class="!update && 'border-dashed bg-card/60'">
    <header class="flex items-center gap-3 px-4 pt-3.5 pb-3">
      <UserAvatar :user="member.user" size="md" />
      <div class="min-w-0 flex-1">
        <p class="truncate text-sm font-semibold">{{ member.user.name }}<span v-if="isMe" class="font-normal text-muted-foreground"> (you)</span></p>
        <p class="truncate text-xs text-muted-foreground">{{ member.user.title || member.role }}</p>
      </div>
      <span v-if="update" class="inline-flex items-center gap-1 text-[11px] font-medium text-success" :title="`Posted ${formatDate(update.updatedAt, 'd MMM, HH:mm')}`">
        <CircleCheck class="size-3.5" /> {{ formatDate(update.updatedAt, 'HH:mm') }}
      </span>
      <span v-else class="inline-flex items-center gap-1 text-[11px] text-muted-foreground"><CircleDashed class="size-3.5" /> Not posted</span>
      <Button v-if="isMe && update" variant="ghost" size="icon-sm" aria-label="Edit your update" @click="emit('edit')"><Pencil /></Button>
    </header>

    <div class="flex-1 space-y-3 px-4 pb-3">
      <template v-if="update">
        <div v-for="section in sections" :key="section.label">
          <p class="mb-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{{ section.label }}</p>
          <RichText :source="section.text" :issue-keys="issueKeys" compact />
        </div>
        <div v-if="update.blockers" class="border border-destructive/30 bg-destructive/8 px-3 py-2">
          <p class="mb-1 flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-destructive uppercase"><CircleAlert class="size-3.5" /> Blocker</p>
          <RichText :source="update.blockers" :issue-keys="issueKeys" compact />
        </div>
      </template>
      <p v-else class="text-sm text-muted-foreground">
        {{ hasSignals ? 'No update yet. Here is what the tracker shows for them:' : `No update yet, and no tracked activity since ${formatDate(previousDate, 'EEEE')}.` }}
      </p>
    </div>

    <footer
      v-if="hasSignals"
      class="space-y-1.5 border-t bg-muted/25 px-4 py-2.5 text-xs"
    >
      <p v-if="member.signals.completed.length" class="flex flex-wrap items-center gap-1.5">
        <span class="text-muted-foreground">Completed since {{ formatDate(previousDate, 'EEE') }}:</span>
        <RouterLink
          v-for="issue in chips(member.signals.completed)"
          :key="issue.id"
          :to="{ name: 'issue', params: { issueKey: issue.key } }"
          class="font-mono font-semibold text-success hover:underline"
          :title="issue.title"
        >
          {{ issue.key }}
        </RouterLink>
        <span v-if="member.signals.completed.length > 4" class="text-muted-foreground">+{{ member.signals.completed.length - 4 }}</span>
      </p>
      <p v-if="member.signals.inProgress.length" class="flex flex-wrap items-center gap-1.5">
        <span class="text-muted-foreground">In progress:</span>
        <RouterLink
          v-for="issue in chips(member.signals.inProgress)"
          :key="issue.id"
          :to="{ name: 'issue', params: { issueKey: issue.key } }"
          class="font-mono font-semibold text-primary hover:underline"
          :title="issue.title"
        >
          {{ issue.key }}
        </RouterLink>
        <span v-if="member.signals.inProgress.length > 4" class="text-muted-foreground">+{{ member.signals.inProgress.length - 4 }}</span>
      </p>
      <p v-if="member.signals.overdue" class="flex items-center gap-1.5 font-medium text-destructive">
        <AlarmClock class="size-3.5" /> {{ member.signals.overdue }} overdue task{{ member.signals.overdue === 1 ? '' : 's' }}
      </p>
    </footer>
  </article>
</template>

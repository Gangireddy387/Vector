<script setup lang="ts">
import { ClipboardList, ListTodo, MessageCircle, Play, Video } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { Button } from '@/components/ui/button'

defineProps<{
  ctaTo: Record<string, unknown>
  ctaLabel: string
  /** Optional brand tint for invite pages. */
  brandColor?: string | null
}>()

const STEPS = [
  {
    icon: ClipboardList,
    label: 'Standup',
    detail: 'Post blockers and plans',
    sample: 'Blocked on API keys · Shipping login polish today · Need design review by noon',
  },
  {
    icon: ListTodo,
    label: 'Tasks',
    detail: 'Clear overdue and due today',
    sample: '2 overdue · 4 due today · Focus: VEC-18 Invite flow',
  },
  {
    icon: Video,
    label: 'Meetings',
    detail: 'Turn actions into tasks',
    sample: 'Standup sync 10:00 · Follow-ups become tasks automatically',
  },
  {
    icon: MessageCircle,
    label: 'Messages',
    detail: 'Close the loop with people',
    sample: '3 unread · @you in #design · DM from Priya about blockers',
  },
] as const

const active = ref(0)
const posted = ref(false)
const draft = ref('')

const activeStep = computed(() => STEPS[active.value])

function select(index: number) {
  active.value = index
  if (index !== 0) posted.value = false
}

function postStandup() {
  if (!draft.value.trim()) draft.value = STEPS[0].sample
  posted.value = true
}
</script>

<template>
  <section
    class="overflow-hidden rounded-2xl border border-border/80 bg-card/90 shadow-soft backdrop-blur"
    aria-label="Workday loop preview"
    :style="brandColor ? { borderColor: `${brandColor}55` } : undefined"
  >
    <header class="flex flex-col gap-3 border-b border-border px-4 py-3.5 sm:flex-row sm:items-center">
      <div class="min-w-0 flex-1">
        <div class="flex flex-wrap items-center gap-2">
          <h2 class="text-sm font-semibold">Start my day</h2>
          <span class="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">Interactive preview</span>
        </div>
        <p class="mt-0.5 text-xs text-muted-foreground">Click a step — no account needed.</p>
      </div>
      <Button size="sm" class="shrink-0 self-start sm:self-center" as-child>
        <RouterLink :to="ctaTo"><Play /> {{ ctaLabel }}</RouterLink>
      </Button>
    </header>

    <ol class="grid sm:grid-cols-2 lg:grid-cols-4 lg:divide-x lg:divide-border/70">
      <li
        v-for="(step, index) in STEPS"
        :key="step.label"
        class="border-b border-border/70 last:border-b-0 sm:[&:nth-last-child(-n+2)]:border-b-0 lg:border-b-0"
      >
        <button
          type="button"
          class="flex h-full w-full flex-col gap-1.5 px-4 py-3.5 text-left transition-colors"
          :class="active === index ? 'bg-primary/8' : 'hover:bg-accent/40'"
          :aria-pressed="active === index"
          @click="select(index)"
        >
          <span class="flex items-center gap-2">
            <span
              class="flex size-7 items-center justify-center rounded-md"
              :class="active === index ? 'bg-primary text-primary-foreground' : 'bg-primary/15 text-primary'"
            >
              <component :is="step.icon" class="size-3.5" />
            </span>
            <span class="text-[11px] font-medium tabular-nums text-muted-foreground">{{ index + 1 }}</span>
            <span class="text-[13px] font-semibold">{{ step.label }}</span>
          </span>
          <span class="pl-9 text-[12px] text-muted-foreground">{{ step.detail }}</span>
        </button>
      </li>
    </ol>

    <div class="space-y-3 border-t border-border px-4 py-4">
      <p class="text-xs font-medium text-muted-foreground">{{ activeStep.label }} · sample</p>
      <p class="rounded-lg border border-border/70 bg-muted/40 px-3 py-2 text-[13px] leading-relaxed">{{ activeStep.sample }}</p>

      <div v-if="active === 0" class="space-y-2">
        <label class="text-xs font-medium" for="demo-standup">Try a standup draft</label>
        <textarea
          id="demo-standup"
          v-model="draft"
          rows="3"
          class="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          placeholder="Yesterday / today / blockers…"
        />
        <div class="flex flex-wrap items-center gap-2">
          <Button size="sm" :disabled="posted" @click="postStandup">{{ posted ? 'Posted for today' : 'Post preview' }}</Button>
          <span v-if="posted" class="text-xs font-medium text-success">Posted for today — sign up to make it real.</span>
        </div>
      </div>
    </div>
  </section>
</template>

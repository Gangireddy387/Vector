<script setup lang="ts">
import { Check, PartyPopper, Sparkles, X } from 'lucide-vue-next'
import { computed, ref, toRef } from 'vue'
import { useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import Toolbar from '@/components/common/Toolbar.vue'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { useAuthStore } from '@/modules/auth/auth.store'
import { type Meeting } from '@/modules/meetings/meetings.api'
import ScheduleMeetingSheet from '@/modules/meetings/components/ScheduleMeetingSheet.vue'
import { useCreateSampleProject } from '@/modules/projects/composables/useCreateSampleProject'
import { useUiStore } from '@/stores/ui.store'
import { type OnboardingStep, useOnboarding } from '../composables/useOnboarding'
import type { DashboardData } from '../dashboard.api'

const props = defineProps<{ data: DashboardData | null }>()
const emit = defineEmits<{ createProject: []; changed: [] }>()

const auth = useAuthStore()
const ui = useUiStore()
const router = useRouter()
const { isCreatingSample, createSampleProject } = useCreateSampleProject()
const { steps, doneCount, isComplete, isVisible, hide, isAdmin, skip } = useOnboarding(toRef(props, 'data'))
const percent = computed(() => Math.round((doneCount.value / Math.max(steps.value.length, 1)) * 100))
const nextStep = computed(() => steps.value.find((step) => !step.done)?.id ?? null)
const meetingSheet = ref<{ meeting?: Meeting } | null>(null)

function run(step: OnboardingStep) {
  const action = step.action
  if (action.kind === 'route') void router.push(action.to)
  else if (action.kind === 'create-project') emit('createProject')
  else if (action.kind === 'create-task') ui.openCreateIssue({})
  else if (action.kind === 'schedule-meeting') meetingSheet.value = {}
  else void router.push({ name: 'settings' })
}

async function trySample() {
  await createSampleProject({ onCreated: () => emit('changed') })
}

function onMeetingSaved() {
  meetingSheet.value = null
  skip('meeting')
  emit('changed')
  toast.success('Meeting scheduled', { description: 'Optional setup step done — keep going on Home.' })
}
</script>

<template>
  <section v-if="isVisible" class="overflow-hidden rounded-xl border border-border bg-card shadow-soft" aria-label="First 10 minutes">
    <header class="space-y-3 border-b border-border px-3 py-3 sm:px-4">
      <div class="flex items-start gap-2.5 sm:items-center sm:gap-3">
        <span class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary"><Sparkles class="size-4" /></span>
        <div class="min-w-0 flex-1">
          <h2 class="text-sm font-semibold leading-snug">
            {{ isAdmin ? `First 10 minutes in ${auth.organization?.name}` : `Get started in ${auth.organization?.name}` }}
          </h2>
          <p class="mt-0.5 text-xs text-muted-foreground">
            {{
              isComplete
                ? 'Everything is in place.'
                : isAdmin
                  ? `${doneCount} of ${steps.length} · project → invite → standup → task → meeting`
                  : `${doneCount} of ${steps.length} done · each step ticks itself off as you go`
            }}
          </p>
        </div>
        <Button variant="ghost" size="icon-sm" class="shrink-0 text-muted-foreground" title="Hide checklist" aria-label="Hide checklist" @click="hide"><X /></Button>
      </div>
      <div class="flex items-center gap-2.5 sm:pl-[2.625rem]">
        <Progress :model-value="percent" class="h-1.5 min-w-0 flex-1" indicator-class="bg-success" />
        <span class="shrink-0 text-xs font-medium tabular-nums text-muted-foreground">{{ percent }}%</span>
      </div>
    </header>

    <div v-if="isComplete" class="px-3 py-4 sm:px-4">
      <Toolbar justify="between" align="center">
        <template #start>
          <span class="flex size-9 shrink-0 items-center justify-center rounded-full bg-success/15 text-success"><PartyPopper class="size-4.5" /></span>
          <p class="min-w-0 flex-1 text-[13px]">
            <span class="font-medium">You’re all set.</span>
            <span class="ml-1 text-muted-foreground">
              {{ isAdmin ? 'Run the workday loop from Home every morning.' : 'Your work will show up below as it is assigned to you.' }}
            </span>
          </p>
        </template>
        <template #end>
          <Button variant="outline" size="sm" class="w-full sm:w-auto" @click="hide">Hide checklist</Button>
        </template>
      </Toolbar>
    </div>

    <!-- 1 → 2 → 3 → 5 cols so laptop (1024) isn’t a ragged 2+2+1. -->
    <ol v-else class="grid auto-rows-fr gap-px bg-border sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      <li
        v-for="(step, index) in steps"
        :key="step.id"
        class="flex min-h-0 flex-col gap-2 bg-card p-3.5 sm:p-4"
        :class="step.done ? 'bg-muted/30' : step.id === nextStep && 'bg-primary/[0.04]'"
      >
        <div class="flex items-center gap-2">
          <span
            class="flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums"
            :class="step.done ? 'bg-success text-white' : step.id === nextStep ? 'bg-primary text-primary-foreground' : 'border border-border text-muted-foreground'"
          >
            <Check v-if="step.done" class="size-3.5" />
            <template v-else>{{ index + 1 }}</template>
          </span>
          <h3 class="min-w-0 flex-1 text-[13px] font-medium leading-snug" :class="step.done && 'text-muted-foreground line-through decoration-muted-foreground/40'">
            {{ step.title }}
          </h3>
        </div>
        <p class="min-h-0 flex-1 text-xs leading-relaxed text-muted-foreground">{{ step.description }}</p>
        <div v-if="!step.done" class="mt-auto flex flex-wrap items-center gap-1.5">
          <Button :variant="step.id === nextStep ? 'default' : 'outline'" size="sm" class="max-sm:flex-1" @click="run(step)">
            {{ step.actionLabel }}
          </Button>
          <Button v-if="step.sample" variant="ghost" size="sm" class="text-muted-foreground max-sm:flex-1" :loading="isCreatingSample" @click="trySample">
            Try a sample
          </Button>
          <Button v-if="step.optional" variant="ghost" size="sm" class="text-muted-foreground" @click="skip(step.id)">Skip</Button>
        </div>
        <p v-else class="mt-auto text-xs font-medium text-success">Done</p>
      </li>
    </ol>

    <ScheduleMeetingSheet v-if="auth.hasFeature('meetings')" v-model:target="meetingSheet" @saved="onMeetingSaved" />
  </section>
</template>

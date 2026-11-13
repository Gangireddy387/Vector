<script setup lang="ts">
import { Check, PartyPopper, Sparkles, X } from 'lucide-vue-next'
import { computed, ref, toRef } from 'vue'
import { useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { getErrorMessage } from '@/lib/http'
import { useAuthStore } from '@/modules/auth/auth.store'
import { useProjectsStore } from '@/modules/projects/projects.store'
import { useUiStore } from '@/stores/ui.store'
import { type OnboardingStep, useOnboarding } from '../composables/useOnboarding'
import type { DashboardData } from '../dashboard.api'

const props = defineProps<{ data: DashboardData | null }>()
const emit = defineEmits<{ createProject: []; changed: [] }>()

const auth = useAuthStore()
const projects = useProjectsStore()
const ui = useUiStore()
const router = useRouter()
const { steps, doneCount, isComplete, isVisible, hide, isAdmin } = useOnboarding(toRef(props, 'data'))
const percent = computed(() => Math.round((doneCount.value / steps.value.length) * 100))
const nextStep = computed(() => steps.value.find((step) => !step.done)?.id ?? null)
const isCreatingSample = ref(false)

function run(step: OnboardingStep) {
  const action = step.action
  if (action.kind === 'route') void router.push(action.to)
  else if (action.kind === 'create-project') emit('createProject')
  else if (action.kind === 'create-task') ui.openCreateIssue({})
  else void router.push({ name: 'settings' })
}

async function trySample() {
  isCreatingSample.value = true
  try {
    const project = await projects.createSampleProject()
    toast.success('Sample project ready', { description: 'Look around the board, backlog and reports. Delete it from its settings when you are done.' })
    emit('changed')
    await router.push({ name: 'project-board', params: { projectId: project.id } })
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    isCreatingSample.value = false
  }
}
</script>

<template>
  <section v-if="isVisible" class="overflow-hidden rounded-xl border border-border bg-card shadow-soft" aria-label="Getting started">
    <header class="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
      <span class="flex size-8 items-center justify-center rounded-lg bg-primary/12 text-primary"><Sparkles class="size-4" /></span>
      <div class="min-w-0 flex-1">
        <h2 class="text-sm font-semibold">{{ isAdmin ? `Get ${auth.organization?.name} set up` : `Get started in ${auth.organization?.name}` }}</h2>
        <p class="text-xs text-muted-foreground">
          {{ isComplete ? 'Everything is in place.' : `${doneCount} of ${steps.length} done · each step ticks itself off as you go` }}
        </p>
      </div>
      <div class="flex w-40 items-center gap-2">
        <Progress :model-value="percent" class="h-1.5 flex-1" indicator-class="bg-success" />
        <span class="w-8 text-right text-xs font-medium tabular-nums">{{ percent }}%</span>
      </div>
      <Button variant="ghost" size="icon-sm" class="text-muted-foreground" title="Hide checklist" aria-label="Hide checklist" @click="hide"><X /></Button>
    </header>

    <div v-if="isComplete" class="flex flex-wrap items-center gap-3 px-4 py-4">
      <span class="flex size-9 items-center justify-center rounded-full bg-success/15 text-success"><PartyPopper class="size-4.5" /></span>
      <p class="min-w-0 flex-1 text-[13px]">
        <span class="font-medium">You’re all set.</span>
        <span class="ml-1 text-muted-foreground">{{ isAdmin ? 'Your organization is ready for the team.' : 'Your work will show up below as it is assigned to you.' }}</span>
      </p>
      <Button variant="outline" size="sm" @click="hide">Hide checklist</Button>
    </div>

    <ol v-else class="grid gap-px bg-border sm:grid-cols-2" :class="steps.length === 5 ? 'xl:grid-cols-5' : 'lg:grid-cols-3'">
      <li v-for="(step, index) in steps" :key="step.id" class="flex flex-col gap-2 bg-card p-4" :class="step.done && 'bg-muted/30'">
        <div class="flex items-center gap-2">
          <span
            class="flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums"
            :class="step.done ? 'bg-success text-white' : step.id === nextStep ? 'bg-primary text-primary-foreground' : 'border border-border text-muted-foreground'"
          >
            <Check v-if="step.done" class="size-3.5" />
            <template v-else>{{ index + 1 }}</template>
          </span>
          <h3 class="truncate text-[13px] font-medium" :class="step.done && 'text-muted-foreground line-through decoration-muted-foreground/40'">{{ step.title }}</h3>
        </div>
        <p class="flex-1 text-xs leading-relaxed text-muted-foreground">{{ step.description }}</p>
        <div v-if="!step.done" class="flex flex-wrap items-center gap-1.5">
          <Button :variant="step.id === nextStep ? 'default' : 'outline'" size="sm" @click="run(step)">{{ step.actionLabel }}</Button>
          <Button v-if="step.sample" variant="ghost" size="sm" class="text-muted-foreground" :loading="isCreatingSample" @click="trySample">Try a sample</Button>
        </div>
        <p v-else class="text-xs font-medium text-success">Done</p>
      </li>
    </ol>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { SelectField } from '@/components/forms'
import { getErrorMessage } from '@/lib/http'
import type { Sprint } from '@/types/models'
import { type CarryOverTarget, sprintsApi } from '../sprints.api'

const props = withDefaults(defineProps<{ projectId: string; sprint: Sprint | null; sprints?: Sprint[]; carryOverByDefault?: boolean }>(), {
  sprints: () => [],
  carryOverByDefault: true,
})
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ completed: [sprint: Sprint] }>()

const target = ref<CarryOverTarget>('next_sprint')
const isSaving = ref(false)

const stats = computed(() => props.sprint?.stats ?? { issueCount: 0, doneCount: 0, totalPoints: 0, donePoints: 0 })
const openCount = computed(() => stats.value.issueCount - stats.value.doneCount)
const plannedSprints = computed(() => props.sprints.filter((sprint) => sprint.state === 'planned'))
const options = computed(() => [
  { value: 'next_sprint', label: 'Next planned sprint (or a new one)' },
  { value: 'new_sprint', label: 'A new sprint' },
  { value: 'backlog', label: 'Backlog' },
  ...plannedSprints.value.map((sprint) => ({ value: sprint.id, label: sprint.name })),
])

watch(open, (isOpen) => isOpen && (target.value = props.carryOverByDefault ? 'next_sprint' : 'backlog'))

async function complete() {
  if (!props.sprint) return
  isSaving.value = true
  try {
    const sprint = await sprintsApi.complete(props.projectId, props.sprint.id, target.value)
    toast.success(`${sprint.name} completed`, {
      description: openCount.value ? `${openCount.value} unfinished issue(s) were moved automatically.` : 'Everything was done. Great work!',
    })
    emit('completed', sprint)
    open.value = false
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Complete {{ sprint?.name }}</DialogTitle>
        <DialogDescription>Review the outcome and decide where unfinished work goes.</DialogDescription>
      </DialogHeader>
      <div class="grid grid-cols-3 gap-3 text-center">
        <div class=" border p-3">
          <p class="text-2xl font-semibold text-success">{{ stats.doneCount }}</p>
          <p class="text-xs text-muted-foreground">Completed</p>
        </div>
        <div class=" border p-3">
          <p class="text-2xl font-semibold">{{ openCount }}</p>
          <p class="text-xs text-muted-foreground">Unfinished</p>
        </div>
        <div class=" border p-3">
          <p class="text-2xl font-semibold">{{ stats.donePoints }}/{{ stats.totalPoints }}</p>
          <p class="text-xs text-muted-foreground">Points</p>
        </div>
      </div>
      <div v-if="openCount" class="grid gap-1.5">
        <Label for="carry-over">Move unfinished issues to</Label>
        <SelectField
          id="carry-over"
          :model-value="target"
          :options="options"
          aria-label="Move unfinished issues to"
          @update:model-value="(value) => value && (target = value)"
        />
      </div>
      <DialogFooter>
        <Button variant="outline" @click="open = false">Cancel</Button>
        <Button :loading="isSaving" @click="complete">Complete sprint</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { addDays } from 'date-fns'
import { computed, reactive, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import FormField from '@/components/common/FormField.vue'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DatePicker } from '@/components/forms'
import { Textarea } from '@/components/ui/textarea'
import { toDateInput } from '@/lib/format'
import { getErrorMessage } from '@/lib/http'
import type { Sprint } from '@/types/models'
import { sprintsApi } from '../sprints.api'

const props = withDefaults(defineProps<{ projectId: string; sprint: Sprint | null; sprintLengthDays?: number }>(), { sprintLengthDays: 14 })
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ started: [sprint: Sprint] }>()

const DURATIONS = [7, 14, 21, 28]
const form = reactive({ goal: '', startDate: '', endDate: '' })
const isSaving = ref(false)

watch(open, (isOpen) => {
  if (!isOpen || !props.sprint) return
  form.goal = props.sprint.goal ?? ''
  form.startDate = props.sprint.startDate ?? toDateInput(new Date())
  form.endDate = props.sprint.endDate ?? toDateInput(addDays(new Date(form.startDate), props.sprintLengthDays))
})

const issueCount = computed(() => props.sprint?.stats?.issueCount ?? 0)
const setDuration = (days: number) => (form.endDate = toDateInput(addDays(new Date(form.startDate || new Date()), days)))

async function start() {
  if (!props.sprint) return
  isSaving.value = true
  try {
    const sprint = await sprintsApi.start(props.projectId, props.sprint.id, {
      goal: form.goal.trim() || null,
      startDate: form.startDate,
      endDate: form.endDate,
    })
    toast.success(`${sprint.name} started`)
    emit('started', sprint)
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
        <DialogTitle>Start {{ sprint?.name }}</DialogTitle>
        <DialogDescription>{{ issueCount }} issue(s) will be included. The team is notified automatically.</DialogDescription>
      </DialogHeader>
      <form class="space-y-4" @submit.prevent="start">
        <FormField label="Sprint goal" for="start-goal" optional>
          <Textarea id="start-goal" v-model="form.goal" rows="2" />
        </FormField>
        <div class="grid grid-cols-2 gap-3">
          <FormField label="Start date" for="start-date"><DatePicker id="start-date" v-model="form.startDate" :clearable="false" display-format="d MMM yyyy" /></FormField>
          <FormField label="End date" for="end-date"><DatePicker id="end-date" v-model="form.endDate" :clearable="false" display-format="d MMM yyyy" /></FormField>
        </div>
        <div class="flex flex-wrap gap-2">
          <Button v-for="days in DURATIONS" :key="days" type="button" variant="outline" size="xs" @click="setDuration(days)">
            {{ days / 7 }} week{{ days > 7 ? 's' : '' }}
          </Button>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" @click="open = false">Cancel</Button>
          <Button type="submit" :loading="isSaving">Start sprint</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>

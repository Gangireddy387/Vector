<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import FormField from '@/components/common/FormField.vue'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DatePicker } from '@/components/forms'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { getErrorMessage } from '@/lib/http'
import type { Sprint } from '@/types/models'
import { sprintsApi } from '../sprints.api'

const props = defineProps<{ projectId: string; sprint?: Sprint | null }>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ saved: [sprint: Sprint] }>()

const form = reactive({ name: '', goal: '', startDate: '', endDate: '' })
const isSaving = ref(false)

watch(open, (isOpen) => {
  if (!isOpen) return
  form.name = props.sprint?.name ?? ''
  form.goal = props.sprint?.goal ?? ''
  form.startDate = props.sprint?.startDate ?? ''
  form.endDate = props.sprint?.endDate ?? ''
})

async function save() {
  isSaving.value = true
  try {
    const payload = {
      name: form.name.trim() || undefined,
      goal: form.goal.trim() || null,
      startDate: form.startDate || null,
      endDate: form.endDate || null,
    }
    const sprint = props.sprint
      ? await sprintsApi.update(props.projectId, props.sprint.id, payload)
      : await sprintsApi.create(props.projectId, payload)
    emit('saved', sprint)
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
        <DialogTitle>{{ sprint ? 'Edit sprint' : 'Create sprint' }}</DialogTitle>
        <DialogDescription>Leave the name empty to number it automatically.</DialogDescription>
      </DialogHeader>
      <form class="space-y-4" @submit.prevent="save">
        <FormField label="Name" for="sprint-name" optional>
          <Input id="sprint-name" v-model="form.name" placeholder="e.g. VEC Sprint 3" />
        </FormField>
        <FormField label="Sprint goal" for="sprint-goal" optional>
          <Textarea id="sprint-goal" v-model="form.goal" rows="2" placeholder="What should this sprint achieve?" />
        </FormField>
        <div class="grid grid-cols-2 gap-3">
          <FormField label="Start" for="sprint-start" optional><DatePicker id="sprint-start" v-model="form.startDate" :clearable="false" display-format="d MMM yyyy" /></FormField>
          <FormField label="End" for="sprint-end" optional><DatePicker id="sprint-end" v-model="form.endDate" :clearable="false" display-format="d MMM yyyy" /></FormField>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" @click="open = false">Cancel</Button>
          <Button type="submit" :loading="isSaving">{{ sprint ? 'Save' : 'Create sprint' }}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>

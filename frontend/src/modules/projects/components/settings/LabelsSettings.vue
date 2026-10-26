<script setup lang="ts">
import { Plus, Trash2 } from 'lucide-vue-next'
import { ref } from 'vue'
import { toast } from 'vue-sonner'
import ColorSwatchPicker from '@/components/common/ColorSwatchPicker.vue'
import LabelChip from '@/components/common/LabelChip.vue'
import { ColorField } from '@/components/forms'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useConfirm } from '@/composables/useConfirm'
import { getErrorMessage } from '@/lib/http'
import type { Label, ProjectDetail } from '@/types/models'
import { projectsApi } from '../../projects.api'
import { useProjectsStore } from '../../projects.store'

const props = defineProps<{ project: ProjectDetail }>()

const projects = useProjectsStore()
const confirm = useConfirm()
const name = ref('')
const color = ref('#0ea5e9')

const refresh = () => projects.fetchProject(props.project.id, true)

async function create() {
  try {
    await projectsApi.createLabel(props.project.id, { name: name.value.trim(), color: color.value })
    name.value = ''
    await refresh()
  } catch (error) {
    toast.error(getErrorMessage(error))
  }
}

async function recolor(label: Label, nextColor: string) {
  await projectsApi.updateLabel(props.project.id, label.id, { color: nextColor })
  await refresh()
}

async function remove(label: Label) {
  if (!(await confirm({ title: `Delete label “${label.name}”?`, description: 'It is removed from every task.', confirmLabel: 'Delete', destructive: true }))) return
  await projectsApi.removeLabel(props.project.id, label.id)
  await refresh()
}
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle>Labels</CardTitle>
      <CardDescription>Use labels to group work. Type #label in quick add to apply them instantly.</CardDescription>
    </CardHeader>
    <CardContent class="space-y-4">
      <ul class="divide-y border">
        <li v-for="label in project.labels" :key="label.id" class="flex items-center gap-3 p-2.5">
          <ColorField :model-value="label.color" size="sm" compact :aria-label="`${label.name} colour`" @change="(color) => recolor(label, color)" />
          <LabelChip :label="label" />
          <Button variant="ghost" size="icon-sm" class="ml-auto" :aria-label="`Delete ${label.name}`" @click="remove(label)"><Trash2 /></Button>
        </li>
        <li v-if="!project.labels.length" class="p-4 text-center text-sm text-muted-foreground">No labels yet</li>
      </ul>
      <form class="space-y-3" @submit.prevent="create">
        <div class="flex gap-2">
          <Input v-model="name" placeholder="New label" class="flex-1" aria-label="Label name" />
          <Button type="submit" :disabled="!name.trim()"><Plus /> Add</Button>
        </div>
        <ColorSwatchPicker v-model="color" />
      </form>
    </CardContent>
  </Card>
</template>

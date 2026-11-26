<script setup lang="ts">
import { Boxes, Plus, Trash2 } from 'lucide-vue-next'
import { ref } from 'vue'
import { toast } from 'vue-sonner'
import ColorSwatchPicker from '@/components/common/ColorSwatchPicker.vue'
import { ColorField } from '@/components/forms'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useConfirm } from '@/composables/useConfirm'
import { getErrorMessage } from '@/lib/http'
import type { Component, ProjectDetail } from '@/types/models'
import { projectsApi } from '../../projects.api'
import { useProjectsStore } from '../../projects.store'

const props = defineProps<{ project: ProjectDetail }>()

const projects = useProjectsStore()
const confirm = useConfirm()
const name = ref('')
const description = ref('')
const color = ref('#0ea5e9')

const refresh = () => projects.fetchProject(props.project.id, true)

async function create() {
  try {
    await projectsApi.createComponent(props.project.id, {
      name: name.value.trim(),
      description: description.value.trim() || null,
      color: color.value,
    })
    name.value = ''
    description.value = ''
    await refresh()
  } catch (error) {
    toast.error(getErrorMessage(error))
  }
}

async function recolor(component: Component, nextColor: string) {
  await projectsApi.updateComponent(props.project.id, component.id, { color: nextColor })
  await refresh()
}

async function remove(component: Component) {
  if (
    !(await confirm({
      title: `Delete component “${component.name}”?`,
      description: 'Tasks keep their other fields; the component is cleared on those tasks.',
      confirmLabel: 'Delete',
      destructive: true,
    }))
  ) {
    return
  }
  await projectsApi.removeComponent(props.project.id, component.id)
  await refresh()
}
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle>Components</CardTitle>
      <CardDescription>Group work by area of the product — API, Web, Mobile, and so on. Each task can belong to one component.</CardDescription>
    </CardHeader>
    <CardContent class="space-y-4">
      <ul class="divide-y border">
        <li v-for="component in project.components" :key="component.id" class="flex items-start gap-3 p-2.5">
          <ColorField
            :model-value="component.color"
            size="sm"
            compact
            class="mt-0.5"
            :aria-label="`${component.name} colour`"
            @change="(next) => recolor(component, next)"
          />
          <div class="min-w-0 flex-1">
            <p class="flex items-center gap-1.5 text-sm font-medium">
              <Boxes class="size-3.5 shrink-0 text-muted-foreground" />
              {{ component.name }}
            </p>
            <p v-if="component.description" class="mt-0.5 text-xs text-muted-foreground">{{ component.description }}</p>
          </div>
          <Button variant="ghost" size="icon-sm" class="ml-auto shrink-0" :aria-label="`Delete ${component.name}`" @click="remove(component)">
            <Trash2 />
          </Button>
        </li>
        <li v-if="!project.components?.length" class="p-4 text-center text-sm text-muted-foreground">No components yet</li>
      </ul>
      <form class="space-y-3" @submit.prevent="create">
        <div class="flex flex-col gap-2 sm:flex-row">
          <Input v-model="name" placeholder="New component" class="flex-1" aria-label="Component name" />
          <Button type="submit" :disabled="!name.trim"><Plus /> Add</Button>
        </div>
        <Input v-model="description" placeholder="Optional description" aria-label="Component description" />
        <ColorSwatchPicker v-model="color" />
      </form>
    </CardContent>
  </Card>
</template>

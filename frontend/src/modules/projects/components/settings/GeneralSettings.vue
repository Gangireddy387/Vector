<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import ColorSwatchPicker from '@/components/common/ColorSwatchPicker.vue'
import FormField from '@/components/common/FormField.vue'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useConfirm } from '@/composables/useConfirm'
import { getErrorMessage } from '@/lib/http'
import MemberSelect from '@/modules/issues/components/pickers/MemberSelect.vue'
import type { ProjectDetail } from '@/types/models'
import { useProjectsStore } from '../../projects.store'

const props = defineProps<{ project: ProjectDetail }>()

const projects = useProjectsStore()
const router = useRouter()
const confirm = useConfirm()
const form = reactive({ name: '', description: '', color: '', leadId: null as string | null })
const isSaving = ref(false)

watch(
  () => props.project,
  (project) => Object.assign(form, { name: project.name, description: project.description ?? '', color: project.color, leadId: project.leadId }),
  { immediate: true },
)

async function save() {
  isSaving.value = true
  try {
    await projects.updateProject(props.project.id, { ...form, description: form.description || null })
    await projects.fetchProjects(true)
    toast.success('Project updated')
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    isSaving.value = false
  }
}

async function toggleArchive() {
  const archived = !props.project.archivedAt
  await projects.updateProject(props.project.id, { archived })
  await projects.fetchProjects(true)
  toast.success(archived ? 'Project archived' : 'Project restored')
}

async function remove() {
  const confirmed = await confirm({
    title: `Delete ${props.project.name}?`,
    description: 'All issues, sprints, comments, attachments and automation rules will be permanently deleted.',
    confirmLabel: 'Delete project',
    destructive: true,
  })
  if (!confirmed) return
  await projects.deleteProject(props.project.id)
  toast.success('Project deleted')
  await router.replace({ name: 'projects' })
}
</script>

<template>
  <div class="space-y-4">
    <Card>
      <CardHeader>
        <CardTitle>Details</CardTitle>
        <CardDescription>Key: {{ project.key }} · {{ project.type === 'scrum' ? 'Scrum' : 'Kanban' }}</CardDescription>
      </CardHeader>
      <CardContent>
        <form class="space-y-4" @submit.prevent="save">
          <FormField label="Name" for="settings-name"><Input id="settings-name" v-model="form.name" required /></FormField>
          <FormField label="Description" for="settings-description" optional>
            <Textarea id="settings-description" v-model="form.description" rows="3" />
          </FormField>
          <FormField label="Project lead" for="settings-lead">
            <MemberSelect id="settings-lead" v-model="form.leadId" :members="project.members" none-label="No lead" aria-label="Project lead" />
          </FormField>
          <FormField label="Color"><ColorSwatchPicker v-model="form.color" /></FormField>
          <Button type="submit" :loading="isSaving">Save changes</Button>
        </form>
      </CardContent>
    </Card>

    <Card class="border-destructive/40">
      <CardHeader>
        <CardTitle>Danger zone</CardTitle>
        <CardDescription>Archiving hides the project from navigation. Deleting is permanent.</CardDescription>
      </CardHeader>
      <CardContent class="flex flex-wrap gap-2">
        <Button variant="outline" @click="toggleArchive">{{ project.archivedAt ? 'Restore project' : 'Archive project' }}</Button>
        <Button variant="destructive" @click="remove">Delete project</Button>
      </CardContent>
    </Card>
  </div>
</template>

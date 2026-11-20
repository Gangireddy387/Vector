<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import ColorSwatchPicker from '@/components/common/ColorSwatchPicker.vue'
import FormField from '@/components/common/FormField.vue'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { useConfirm } from '@/composables/useConfirm'
import { getErrorMessage } from '@/lib/http'
import MemberSelect from '@/modules/issues/components/pickers/MemberSelect.vue'
import ShareLinkCard from '@/modules/shares/components/ShareLinkCard.vue'
import type { ProjectDetail } from '@/types/models'
import { useProjectsStore } from '../../projects.store'

const props = defineProps<{ project: ProjectDetail }>()

const projects = useProjectsStore()
const router = useRouter()
const confirm = useConfirm()
const form = reactive({ name: '', description: '', color: '', leadId: null as string | null })
const isSaving = ref(false)
const isSavingAccess = ref(false)
const commentOnly = computed(() => Boolean(props.project.settings?.commentOnly))

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

async function setCommentOnly(enabled: boolean) {
  isSavingAccess.value = true
  try {
    await projects.updateProject(props.project.id, { settings: { ...props.project.settings, commentOnly: enabled } })
    toast.success(enabled ? 'Comment-only mode on' : 'Comment-only mode off', {
      description: enabled
        ? 'Non-admins can view and comment. New invites default to Viewer.'
        : 'Members can create and edit tasks again.',
    })
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    isSavingAccess.value = false
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
    description: 'All tasks, sprints, comments, attachments and automation rules will be permanently deleted.',
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

    <Card>
      <CardHeader>
        <CardTitle>Access</CardTitle>
        <CardDescription>Limit who can change work in this project without inventing a new role.</CardDescription>
      </CardHeader>
      <CardContent>
        <label class="flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-border/70 px-3.5 py-3">
          <span class="min-w-0">
            <span class="block text-sm font-medium">Comment-only</span>
            <span class="mt-0.5 block text-xs text-muted-foreground">
              Non-admins may view and comment, but not edit tasks. New people join as Viewers; the Member role is locked until you turn this off. Admins keep full access.
            </span>
          </span>
          <Switch
            class="mt-0.5"
            :model-value="commentOnly"
            :disabled="isSavingAccess"
            aria-label="Comment-only project"
            @update:model-value="(value) => setCommentOnly(Boolean(value))"
          />
        </label>
      </CardContent>
    </Card>

    <ShareLinkCard kind="board" :target-id="project.id" />

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

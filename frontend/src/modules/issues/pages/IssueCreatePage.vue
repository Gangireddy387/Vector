<script setup lang="ts">
import { ArrowLeft } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import { useDevice } from '@/composables/useDevice'
import { useProjectsStore } from '@/modules/projects/projects.store'
import { type CreateIssueDefaults, useUiStore } from '@/stores/ui.store'
import type { IssueDetail, IssueType } from '@/types/models'
import IssueCreateForm from '../components/IssueCreateForm.vue'

const route = useRoute()
const router = useRouter()
const ui = useUiStore()
const projects = useProjectsStore()
const { isDesktop } = useDevice()
const formRef = ref<InstanceType<typeof IssueCreateForm> | null>(null)

const queryValue = (key: string) => (typeof route.query[key] === 'string' && route.query[key] ? (route.query[key] as string) : undefined)

const defaults = computed<CreateIssueDefaults>(() => {
  const result: CreateIssueDefaults = {}
  const projectId = queryValue('projectId')
  if (projectId) result.projectId = projectId
  const parentId = queryValue('parentId')
  if (parentId) result.parentId = parentId
  const sprintId = queryValue('sprintId')
  if (sprintId) result.sprintId = sprintId
  const statusId = queryValue('statusId')
  if (statusId) result.statusId = statusId
  const assigneeId = queryValue('assigneeId')
  if (assigneeId) result.assigneeId = assigneeId
  const type = queryValue('type')
  if (type) result.type = type as IssueType
  const title = queryValue('title')
  if (title) result.title = title
  return result
})

const projectName = computed(() => {
  const id = defaults.value.projectId
  return id ? projects.activeProjects.find((project) => project.id === id)?.name : undefined
})

function leave(created?: IssueDetail) {
  if (window.history.state?.back) router.back()
  else if (created) void router.replace({ name: 'issue', params: { issueKey: created.key } })
  else void router.replace({ name: 'home' })
}

function onCreated(issue: IssueDetail) {
  ui.notifyIssuesChanged()
  toast.success(`${issue.key} created`, {
    description: issue.title,
    action: { label: 'Open', onClick: () => router.push({ name: 'issue', params: { issueKey: issue.key } }) },
  })
  if (!formRef.value?.createAnother) leave(issue)
}
</script>

<template>
  <div class="flex min-h-full flex-col">
    <header v-if="isDesktop" class="mx-auto flex w-full max-w-6xl items-center gap-2 px-5 pt-4">
      <Button variant="ghost" size="icon" aria-label="Back" @click="leave()"><ArrowLeft /></Button>
      <div class="min-w-0">
        <h1 class="truncate text-xl font-bold tracking-tight">Create issue</h1>
        <p class="text-sm text-muted-foreground">
          {{ projectName ? `New work item in ${projectName}` : 'Capture the work, then fine-tune the details on the right.' }}
        </p>
      </div>
    </header>
    <IssueCreateForm
      :key="route.fullPath"
      ref="formRef"
      class="flex-1"
      :defaults="defaults"
      :compact="!isDesktop"
      @created="onCreated"
      @cancel="leave()"
    />
  </div>
</template>

<script setup lang="ts">
import { SquarePen, X } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { useProjectsStore } from '@/modules/projects/projects.store'
import { useUiStore } from '@/stores/ui.store'
import type { IssueDetail } from '@/types/models'
import IssueCreateForm from './IssueCreateForm.vue'

/** Desktop create-issue panel: opens beside the current page so boards, lists and team pages keep their context. */
const ui = useUiStore()
const route = useRoute()
const router = useRouter()
const projects = useProjectsStore()
const formRef = ref<InstanceType<typeof IssueCreateForm> | null>(null)

const isOpen = computed({
  get: () => ui.createIssueDefaults !== null,
  set: (open) => {
    if (!open) ui.closeCreateIssue()
  },
})

const projectName = computed(() => {
  const id = ui.createIssueDefaults?.projectId
  return id ? projects.activeProjects.find((project) => project.id === id)?.name : undefined
})

/** Opens the new issue in the preview panel, keeping the page underneath. */
const openIssue = (key: string) => router.push({ query: { ...route.query, issue: key } })

function onCreated(issue: IssueDetail) {
  ui.notifyIssuesChanged()
  toast.success(`${issue.key} created`, { description: issue.title, action: { label: 'Open', onClick: () => openIssue(issue.key) } })
  if (!formRef.value?.createAnother) ui.closeCreateIssue()
}
</script>

<template>
  <Sheet v-model:open="isOpen">
    <SheetContent side="right" class="flex w-full flex-col gap-0 p-0 sm:max-w-4xl" hide-close clear-backdrop @open-auto-focus.prevent>
      <header class="flex shrink-0 items-center gap-3 border-b border-border/70 px-5 py-3.5">
        <span class="flex size-9 shrink-0 items-center justify-center bg-brand text-white shadow-glow"><SquarePen class="size-4" /></span>
        <div class="min-w-0 flex-1">
          <SheetTitle class="truncate text-base font-semibold">Create task</SheetTitle>
          <SheetDescription class="truncate text-xs">
            {{ projectName ? `New task in ${projectName}` : 'Capture the task, then fine-tune the details on the right.' }}
          </SheetDescription>
        </div>
        <Button variant="ghost" size="icon-sm" aria-label="Close" @click="isOpen = false"><X /></Button>
      </header>
      <div class="min-h-0 flex-1 overflow-y-auto">
        <IssueCreateForm
          v-if="ui.createIssueDefaults"
          :key="ui.createIssueSession"
          ref="formRef"
          class="min-h-full"
          :defaults="ui.createIssueDefaults"
          @created="onCreated"
          @cancel="isOpen = false"
        />
      </div>
    </SheetContent>
  </Sheet>
</template>

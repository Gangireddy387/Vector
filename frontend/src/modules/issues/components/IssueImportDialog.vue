<script setup lang="ts">
import { Upload } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import { SelectField, type SelectFieldOption } from '@/components/forms'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { getErrorMessage } from '@/lib/http'
import { useProjectsStore } from '@/modules/projects/projects.store'
import { issuesApi, type IssueImportResult } from '../api/issues.api'

const props = defineProps<{
  /** When set (project tasks page), import always targets this project. */
  projectId?: string
}>()

const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ imported: [result: IssueImportResult] }>()

const projects = useProjectsStore()
const file = ref<File | null>(null)
const selectedProjectId = ref('')
const isImporting = ref(false)
const lastResult = ref<IssueImportResult | null>(null)

const projectOptions = computed<SelectFieldOption[]>(() =>
  projects.activeProjects.map((project) => ({
    value: project.id,
    label: `${project.key} — ${project.name}`,
  })),
)

const targetProjectId = computed(() => props.projectId || selectedProjectId.value)
const canImport = computed(() => Boolean(file.value && targetProjectId.value && !isImporting.value))

watch(open, async (isOpen) => {
  if (!isOpen) return
  file.value = null
  lastResult.value = null
  if (!props.projectId) {
    await projects.fetchProjects().catch(() => undefined)
    selectedProjectId.value = projects.activeProjects[0]?.id ?? ''
  } else {
    selectedProjectId.value = props.projectId
  }
})

function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  file.value = input.files?.[0] ?? null
  lastResult.value = null
}

async function runImport() {
  if (!file.value || !targetProjectId.value) return
  isImporting.value = true
  try {
    const result = await issuesApi.importCsv(targetProjectId.value, file.value)
    lastResult.value = result
    emit('imported', result)
    if (result.created > 0 && result.failed === 0) {
      toast.success(`Imported ${result.created} task${result.created === 1 ? '' : 's'}`, {
        description: result.skipped ? `${result.skipped} empty row${result.skipped === 1 ? '' : 's'} skipped.` : undefined,
      })
      open.value = false
    } else if (result.created > 0) {
      toast.success(`Imported ${result.created}, ${result.failed} failed`, {
        description: result.errors[0]?.message,
      })
    } else {
      toast.error('Nothing imported', { description: result.errors[0]?.message ?? 'Check the CSV columns and try again.' })
    }
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    isImporting.value = false
  }
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>Import tasks from CSV</DialogTitle>
        <DialogDescription>
          Use a Vector export or a Jira CSV (Summary, Issue Type, Status, Priority, Assignee, Due Date, Labels). New keys are assigned — existing keys in the file are ignored. Up to 200 rows.
        </DialogDescription>
      </DialogHeader>

      <div class="space-y-4 py-1">
        <div v-if="!projectId" class="space-y-1.5">
          <p class="text-xs font-medium text-muted-foreground">Project</p>
          <SelectField
            v-model="selectedProjectId"
            :options="projectOptions"
            placeholder="Choose a project"
            aria-label="Import into project"
          />
        </div>

        <div class="space-y-1.5">
          <p class="text-xs font-medium text-muted-foreground">CSV file</p>
          <input
            type="file"
            accept=".csv,text/csv,text/plain"
            class="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-foreground hover:file:bg-accent"
            @change="onFileChange"
          />
          <p v-if="file" class="text-xs text-muted-foreground">{{ file.name }} ({{ Math.ceil(file.size / 1024) }} KB)</p>
        </div>

        <div v-if="lastResult" class="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs">
          <p class="font-medium">
            Created {{ lastResult.created }} · skipped {{ lastResult.skipped }} · failed {{ lastResult.failed }}
          </p>
          <ul v-if="lastResult.errors.length" class="mt-1.5 max-h-28 space-y-0.5 overflow-y-auto text-muted-foreground">
            <li v-for="(error, index) in lastResult.errors" :key="`${error.row}-${index}`">
              Row {{ error.row }}: {{ error.message }}
            </li>
          </ul>
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" :disabled="isImporting" @click="open = false">Cancel</Button>
        <Button :disabled="!canImport" :loading="isImporting" @click="runImport">
          <Upload /> Import
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

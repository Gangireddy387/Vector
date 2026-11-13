<script setup lang="ts">
import { useStorage } from '@vueuse/core'
import { ArrowRight, FolderPlus, Rocket } from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import BrandMark from '@/components/layout/BrandMark.vue'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { getErrorMessage } from '@/lib/http'
import { useAuthStore } from '@/modules/auth/auth.store'
import CreateProjectDialog from '@/modules/projects/components/CreateProjectDialog.vue'
import { useProjectsStore } from '@/modules/projects/projects.store'

/**
 * Greets the admin of a brand-new organization (no projects yet) once, and offers the two ways to begin: explore a
 * ready-made sample project, or create their own. Shown once per organization and person.
 */
const auth = useAuthStore()
const projects = useProjectsStore()
const router = useRouter()
const welcomed = useStorage<Record<string, boolean>>('vector.onboarding.welcomed', {})
const scope = computed(() => `${auth.organization?.id ?? 'none'}.${auth.user?.id ?? 'none'}`)
const isLoaded = ref(false)
const isCreateOpen = ref(false)
const isCreatingSample = ref(false)

onMounted(async () => {
  await projects.fetchProjects().catch(() => undefined)
  isLoaded.value = true
})

const isOpen = computed({
  get: () => isLoaded.value && auth.isOrganizationAdmin && !welcomed.value[scope.value] && projects.activeProjects.length === 0,
  set: (open) => {
    if (!open) welcomed.value = { ...welcomed.value, [scope.value]: true }
  },
})

async function explore() {
  isCreatingSample.value = true
  try {
    const project = await projects.createSampleProject()
    isOpen.value = false
    toast.success('Sample project ready', { description: 'Drag cards on the board, open a task, or check the backlog. Delete it from its settings when you are done.' })
    await router.push({ name: 'project-board', params: { projectId: project.id } })
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    isCreatingSample.value = false
  }
}

function fromScratch() {
  isOpen.value = false
  isCreateOpen.value = true
}
</script>

<template>
  <Dialog v-model:open="isOpen">
    <DialogContent class="gap-0 overflow-hidden p-0 sm:max-w-lg">
      <div class="relative overflow-hidden border-b border-border bg-[radial-gradient(120%_120%_at_0%_0%,color-mix(in_oklch,var(--primary)_18%,transparent),transparent_60%)] px-6 pt-6 pb-5">
        <BrandMark class="size-9" />
        <DialogTitle class="mt-4 text-xl font-semibold tracking-tight">Welcome to Vector, {{ auth.user?.name.split(' ')[0] }}</DialogTitle>
        <DialogDescription class="mt-1 text-[13px]">Let’s get {{ auth.organization?.name }} ready for your team. How would you like to start?</DialogDescription>
      </div>

      <div class="space-y-2.5 p-5">
        <button
          type="button"
          class="group flex w-full items-start gap-3 rounded-xl border border-primary/40 bg-primary/[0.04] p-4 text-left transition-[border-color,box-shadow] outline-none hover:border-primary hover:shadow-[0_0_0_1px_var(--primary)] focus-visible:ring-[3px] focus-visible:ring-ring/30 disabled:opacity-70"
          :disabled="isCreatingSample"
          @click="explore"
        >
          <span class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground"><Rocket class="size-4" /></span>
          <span class="min-w-0 flex-1">
            <span class="flex items-center gap-2 text-sm font-semibold">
              {{ isCreatingSample ? 'Setting it up…' : 'Explore a sample project' }}
              <span class="rounded-full bg-primary/12 px-1.5 py-px text-[10.5px] font-medium text-primary">Recommended</span>
            </span>
            <span class="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
              A website launch with a running sprint, tasks in every column and due dates. See how everything works, then delete it any time.
            </span>
          </span>
          <ArrowRight class="mt-2 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
        </button>

        <button
          type="button"
          class="group flex w-full items-start gap-3 rounded-xl border border-border p-4 text-left transition-colors outline-none hover:border-input hover:bg-accent/50 focus-visible:ring-[3px] focus-visible:ring-ring/30"
          @click="fromScratch"
        >
          <span class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground"><FolderPlus class="size-4" /></span>
          <span class="min-w-0 flex-1">
            <span class="block text-sm font-semibold">Start from scratch</span>
            <span class="mt-0.5 block text-xs leading-relaxed text-muted-foreground">Create your first project, then invite your team and add tasks.</span>
          </span>
          <ArrowRight class="mt-2 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        </button>
      </div>

      <div class="flex justify-center border-t border-border px-5 py-3">
        <button type="button" class="text-xs text-muted-foreground hover:text-foreground" @click="isOpen = false">I’ll look around first</button>
      </div>
    </DialogContent>
  </Dialog>
  <CreateProjectDialog v-model:open="isCreateOpen" />
</template>

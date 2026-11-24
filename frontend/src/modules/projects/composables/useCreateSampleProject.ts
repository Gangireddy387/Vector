import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import { getErrorMessage } from '@/lib/http'
import { useProjectsStore } from '../projects.store'

/**
 * Creates the ready-made sample project and opens its board.
 * Shared by welcome, setup checklist and empty states so the CTA behaves the same everywhere.
 */
export function useCreateSampleProject() {
  const projects = useProjectsStore()
  const router = useRouter()
  const isCreatingSample = ref(false)

  async function createSampleProject(options?: { onCreated?: () => void }) {
    if (isCreatingSample.value) return null
    isCreatingSample.value = true
    try {
      const project = await projects.createSampleProject()
      options?.onCreated?.()
      toast.success('Sample project ready', {
        description: 'Board, epic, sub-tasks and a blocker are ready to explore. Keep or wipe it from the banner.',
      })
      await router.push({ name: 'project-board', params: { projectId: project.id } })
      return project
    } catch (error) {
      toast.error(getErrorMessage(error))
      return null
    } finally {
      isCreatingSample.value = false
    }
  }

  return { isCreatingSample, createSampleProject }
}

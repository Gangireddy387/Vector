import { computed, ref } from 'vue'
import { toast } from 'vue-sonner'
import { useConfirm } from '@/composables/useConfirm'
import { getErrorMessage } from '@/lib/http'
import { pluralize } from '@/lib/utils'
import { useUiStore } from '@/stores/ui.store'
import { type BulkChanges, issuesApi } from '../api/issues.api'

/** Multi-select state plus bulk update/delete for issue lists and the backlog. */
export function useIssueSelection(onChanged: () => void) {
  const ui = useUiStore()
  const confirm = useConfirm()
  const selectedIds = ref<string[]>([])
  const isBusy = ref(false)

  const count = computed(() => selectedIds.value.length)
  const isSelected = (id: string) => selectedIds.value.includes(id)
  const toggle = (id: string) =>
    (selectedIds.value = isSelected(id) ? selectedIds.value.filter((item) => item !== id) : [...selectedIds.value, id])
  const setAll = (ids: string[]) => (selectedIds.value = ids)
  const clear = () => (selectedIds.value = [])

  async function run(task: () => Promise<string>) {
    isBusy.value = true
    try {
      toast.success(await task())
      clear()
      ui.notifyIssuesChanged()
      onChanged()
    } catch (error) {
      toast.error(getErrorMessage(error))
    } finally {
      isBusy.value = false
    }
  }

  const apply = (changes: BulkChanges) =>
    run(async () => {
      const { updated } = await issuesApi.bulkUpdate(selectedIds.value, changes)
      return `${pluralize(updated, 'issue')} updated`
    })

  async function removeSelected() {
    const confirmed = await confirm({
      title: `Delete ${pluralize(count.value, 'issue')}?`,
      description: 'Sub-tasks, comments and attachments are deleted too. This cannot be undone.',
      confirmLabel: 'Delete',
      destructive: true,
    })
    if (!confirmed) return
    await run(async () => {
      const { deleted } = await issuesApi.bulkDelete(selectedIds.value)
      return `${pluralize(deleted, 'issue')} deleted`
    })
  }

  return { selectedIds, count, isBusy, isSelected, toggle, setAll, clear, apply, removeSelected }
}

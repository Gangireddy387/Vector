import { computed, ref } from 'vue'
import { toast } from 'vue-sonner'
import { useConfirm } from '@/composables/useConfirm'
import { getErrorMessage } from '@/lib/http'
import { pluralize } from '@/lib/utils'
import { useUiStore } from '@/stores/ui.store'
import { type BulkChanges, issuesApi } from '../api/issues.api'

/** Matches backend bulkUpdateSchema / bulkDeleteSchema max. */
export const BULK_MAX = 200

/** Multi-select state plus bulk update/delete for issue lists and the backlog. */
export function useIssueSelection(onChanged: () => void) {
  const ui = useUiStore()
  const confirm = useConfirm()
  const selectedIds = ref<string[]>([])
  const isBusy = ref(false)

  const count = computed(() => selectedIds.value.length)
  const isSelected = (id: string) => selectedIds.value.includes(id)

  const toggle = (id: string) => {
    if (isSelected(id)) {
      selectedIds.value = selectedIds.value.filter((item) => item !== id)
      return
    }
    if (selectedIds.value.length >= BULK_MAX) {
      toast.message(`Select up to ${BULK_MAX} at a time`)
      return
    }
    selectedIds.value = [...selectedIds.value, id]
  }

  const setAll = (ids: string[]) => {
    if (ids.length > BULK_MAX) {
      toast.message(`Select up to ${BULK_MAX} at a time`)
      selectedIds.value = ids.slice(0, BULK_MAX)
      return
    }
    selectedIds.value = ids
  }

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
      const ids = selectedIds.value.slice(0, BULK_MAX)
      const { updated } = await issuesApi.bulkUpdate(ids, changes)
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
      const ids = selectedIds.value.slice(0, BULK_MAX)
      const { deleted } = await issuesApi.bulkDelete(ids)
      return `${pluralize(deleted, 'issue')} deleted`
    })
  }

  return { selectedIds, count, isBusy, isSelected, toggle, setAll, clear, apply, removeSelected }
}

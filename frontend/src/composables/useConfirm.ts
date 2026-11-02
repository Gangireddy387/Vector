import { reactive } from 'vue'

interface ConfirmOptions {
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
}

type Pending = ConfirmOptions & { resolve: (confirmed: boolean) => void }

export const confirmState = reactive({
  open: false,
  title: '',
  description: '',
  confirmLabel: 'Confirm',
  cancelLabel: 'Cancel',
  destructive: false,
  resolve: null as ((confirmed: boolean) => void) | null,
})

/** Questions asked while another one is on screen wait their turn instead of being lost. */
const queue: Pending[] = []

function showNext() {
  const next = queue.shift()
  if (!next) return
  const { resolve, ...options } = next
  Object.assign(confirmState, { description: '', confirmLabel: 'Confirm', cancelLabel: 'Cancel', destructive: false, ...options, open: true, resolve })
}

/** Promise-based confirmation dialog rendered once by `ConfirmDialog` in the app root. */
export function useConfirm() {
  return (options: ConfirmOptions) =>
    new Promise<boolean>((resolve) => {
      queue.push({ ...options, resolve })
      if (!confirmState.open) showNext()
    })
}

export function settleConfirm(confirmed: boolean) {
  confirmState.resolve?.(confirmed)
  confirmState.resolve = null
  confirmState.open = false
  // The next question opens once this dialog has closed.
  if (queue.length) setTimeout(showNext, 150)
}

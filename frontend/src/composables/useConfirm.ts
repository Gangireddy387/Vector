import { reactive } from 'vue'

interface ConfirmOptions {
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
}

export const confirmState = reactive({
  open: false,
  title: '',
  description: '',
  confirmLabel: 'Confirm',
  cancelLabel: 'Cancel',
  destructive: false,
  resolve: null as ((confirmed: boolean) => void) | null,
})

/** Promise-based confirmation dialog rendered once by `ConfirmDialog` in the app root. */
export function useConfirm() {
  return (options: ConfirmOptions) =>
    new Promise<boolean>((resolve) => {
      Object.assign(confirmState, {
        description: '',
        confirmLabel: 'Confirm',
        cancelLabel: 'Cancel',
        destructive: false,
        ...options,
        open: true,
        resolve,
      })
    })
}

export function settleConfirm(confirmed: boolean) {
  confirmState.resolve?.(confirmed)
  confirmState.resolve = null
  confirmState.open = false
}

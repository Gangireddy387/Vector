import { reactive } from 'vue'

interface PromptTextOptions {
  title: string
  description?: string
  label?: string
  placeholder?: string
  confirmLabel?: string
  cancelLabel?: string
  required?: boolean
  maxLength?: number
}

type Pending = PromptTextOptions & { resolve: (value: string | null) => void }

export const promptTextState = reactive({
  open: false,
  title: '',
  description: '',
  label: 'Comment',
  placeholder: '',
  confirmLabel: 'Continue',
  cancelLabel: 'Cancel',
  required: true,
  maxLength: 10000,
  value: '',
  resolve: null as ((value: string | null) => void) | null,
})

const queue: Pending[] = []

function showNext() {
  const next = queue.shift()
  if (!next) return
  const { resolve, ...options } = next
  Object.assign(promptTextState, {
    description: '',
    label: 'Comment',
    placeholder: '',
    confirmLabel: 'Continue',
    cancelLabel: 'Cancel',
    required: true,
    maxLength: 10000,
    value: '',
    ...options,
    open: true,
    resolve,
  })
}

/** Promise-based text prompt rendered by `PromptTextDialog` in the app root. Resolves to trimmed text or null if cancelled. */
export function usePromptText() {
  return (options: PromptTextOptions) =>
    new Promise<string | null>((resolve) => {
      queue.push({ ...options, resolve })
      if (!promptTextState.open) showNext()
    })
}

export function settlePromptText(value: string | null) {
  promptTextState.resolve?.(value)
  promptTextState.resolve = null
  promptTextState.open = false
  promptTextState.value = ''
  if (queue.length) setTimeout(showNext, 150)
}

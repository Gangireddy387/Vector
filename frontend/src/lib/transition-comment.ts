import { usePromptText } from '@/composables/usePromptText'

/** Asks for a transition comment in the shared dialog. Returns trimmed text, or null if cancelled. */
export async function askTransitionComment(fromName?: string, toName?: string) {
  const prompt = usePromptText()
  const from = fromName || 'this status'
  const to = toName || 'the next status'
  return prompt({
    title: 'Comment required',
    description: `Moving from “${from}” to “${to}” needs a short note for the activity history.`,
    label: 'Comment',
    placeholder: 'Why is this moving?',
    confirmLabel: 'Move',
    required: true,
    maxLength: 10000,
  })
}

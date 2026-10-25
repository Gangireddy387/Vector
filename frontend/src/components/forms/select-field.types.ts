import type { Component } from 'vue'
import type { UserSummary } from '@/types/models'

export interface SelectFieldOption {
  /** `null` is a real value (e.g. "Unassigned", "Backlog"). */
  value: string | null
  label: string
  description?: string
  /** Colour swatch shown before the label. */
  color?: string
  /** Icon shown before the label, optionally tinted. */
  icon?: Component
  iconColor?: string
  /** Show an avatar; `null` renders the "nobody" avatar. */
  user?: UserSummary | null
  disabled?: boolean
  group?: string
}

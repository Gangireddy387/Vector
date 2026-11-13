import { cva, type VariantProps } from 'class-variance-authority'

/** Shared look for every custom data field trigger (select, date, time, colour). */
export const fieldTriggerVariants = cva(
  'field-trigger flex w-full min-w-0 items-center gap-2 rounded-md border border-border bg-card px-3 text-left text-[13px] shadow-soft transition-[color,box-shadow,border-color,background-color] outline-none hover:border-input focus-visible:border-ring/70 focus-visible:ring-[3px] focus-visible:ring-ring/20 disabled:pointer-events-none disabled:opacity-50 data-[state=open]:border-ring/70 data-[state=open]:bg-card data-[state=open]:ring-[3px] data-[state=open]:ring-ring/20',
  {
    variants: {
      size: {
        default: 'h-9',
        sm: 'h-8 text-[13px]',
      },
    },
    defaultVariants: { size: 'default' },
  },
)

export type FieldSize = NonNullable<VariantProps<typeof fieldTriggerVariants>['size']>

/** Floating panel used by dropdowns and pickers. */
export const fieldPanelClass =
  'z-50 rounded-lg border border-border bg-popover text-popover-foreground shadow-elevated outline-none data-[side=bottom]:slide-in-from-top-1 data-[side=top]:slide-in-from-bottom-1 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0'

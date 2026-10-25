import { cva, type VariantProps } from 'class-variance-authority'

/** Shared look for every custom data field trigger (select, date, time, colour). */
export const fieldTriggerVariants = cva(
  'flex w-full min-w-0 items-center gap-2 border border-input bg-card/70 px-3 text-left text-sm shadow-xs transition-[color,box-shadow,border-color,background-color] outline-none hover:border-primary/40 focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-ring/15 disabled:pointer-events-none disabled:opacity-50 data-[state=open]:border-primary data-[state=open]:bg-card data-[state=open]:ring-4 data-[state=open]:ring-ring/15 dark:bg-card/40',
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
  'z-50 border border-border/80 bg-popover/95 text-popover-foreground shadow-elevated outline-none backdrop-blur-xl data-[side=bottom]:slide-in-from-top-1 data-[side=top]:slide-in-from-bottom-1 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0'

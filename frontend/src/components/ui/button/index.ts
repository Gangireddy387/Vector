import { cva, type VariantProps } from 'class-variance-authority'

export { default as Button } from './Button.vue'

export const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap text-[13px] font-medium tracking-[-0.006em] transition-[background-color,border-color,color,box-shadow,filter] duration-150 outline-none select-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 focus-visible:ring-[3px] focus-visible:ring-ring/30 aria-invalid:ring-destructive/20",
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow-glow hover:bg-primary/90',
        brand:
          'bg-[linear-gradient(180deg,color-mix(in_oklch,var(--primary)_86%,white),var(--primary))] text-primary-foreground shadow-glow hover:brightness-110 dark:bg-[linear-gradient(180deg,color-mix(in_oklch,var(--primary)_92%,white),color-mix(in_oklch,var(--primary)_88%,black))]',
        destructive: 'bg-destructive text-white shadow-glow hover:bg-destructive/90 focus-visible:ring-destructive/25',
        outline: 'border border-border bg-card text-foreground shadow-soft hover:border-input hover:bg-accent dark:bg-card',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-accent',
        soft: 'bg-primary/10 text-primary hover:bg-primary/15 dark:bg-primary/15 dark:hover:bg-primary/20',
        ghost: 'text-foreground/80 hover:bg-accent hover:text-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-8 px-3.5 has-[>svg]:px-3',
        xs: 'h-6 gap-1 px-2 text-xs has-[>svg]:px-1.5',
        sm: 'h-7 gap-1.5 px-2.5 has-[>svg]:px-2',
        lg: 'h-10 px-5 text-sm has-[>svg]:px-4',
        icon: 'size-8',
        'icon-sm': 'size-7',
        'icon-lg': 'size-10',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)

export type ButtonVariants = VariantProps<typeof buttonVariants>

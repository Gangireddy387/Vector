<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { reactiveOmit } from '@vueuse/core'
import { X } from 'lucide-vue-next'
import {
  DialogClose,
  DialogContent,
  type DialogContentEmits,
  type DialogContentProps,
  DialogOverlay,
  DialogPortal,
  useForwardPropsEmits,
} from 'reka-ui'
import { cn } from '@/lib/utils'
import { type SheetVariants, sheetVariants } from '.'

interface SheetContentProps extends DialogContentProps {
  class?: HTMLAttributes['class']
  side?: SheetVariants['side']
  hideClose?: boolean
  /** Keep the page behind sharp (a faint dim, no blur), for side panels you work beside. */
  clearBackdrop?: boolean
}

defineOptions({ inheritAttrs: false })

const props = defineProps<SheetContentProps>()
const emits = defineEmits<DialogContentEmits>()

const delegatedProps = reactiveOmit(props, 'class', 'side', 'hideClose', 'clearBackdrop')
const forwarded = useForwardPropsEmits(delegatedProps, emits)
</script>

<template>
  <DialogPortal>
    <DialogOverlay
      class="fixed inset-0 z-50 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0"
      :class="clearBackdrop ? 'bg-black/10 dark:bg-black/30' : 'bg-scrim backdrop-blur-[3px]'"
    />
    <DialogContent data-slot="sheet-content" :class="cn(sheetVariants({ side }), props.class)" v-bind="{ ...forwarded, ...$attrs }">
      <div v-if="side === 'bottom'" class="mx-auto mt-2.5 h-1.5 w-12 shrink-0 bg-muted-foreground/25" aria-hidden="true" />
      <slot />
      <DialogClose
        v-if="!hideClose"
        class="absolute top-4 right-4 flex size-7 items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:ring-2 focus:ring-ring/40 focus:outline-hidden disabled:pointer-events-none"
      >
        <X class="size-4" />
        <span class="sr-only">Close</span>
      </DialogClose>
    </DialogContent>
  </DialogPortal>
</template>

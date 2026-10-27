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

const props = defineProps<
  DialogContentProps & {
    class?: HTMLAttributes['class']
    hideClose?: boolean
    /** Stacks above sheets and other dialogs that may already be open (confirmations). */
    onTop?: boolean
  }
>()
const emits = defineEmits<DialogContentEmits>()

const delegatedProps = reactiveOmit(props, 'class', 'hideClose', 'onTop')
const forwarded = useForwardPropsEmits(delegatedProps, emits)

/** Dialogs only close via Esc, the close button or their own actions, never by a stray click outside (keeps typed input safe). */
const keepOpen = (event: Event) => event.preventDefault()
</script>

<template>
  <DialogPortal>
    <DialogOverlay
      class="fixed inset-0 bg-scrim backdrop-blur-[3px] data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0"
      :class="onTop ? 'z-[70]' : 'z-50'"
    />
    <DialogContent
      data-slot="dialog-content"
      v-bind="forwarded"
      @pointer-down-outside="keepOpen"
      @interact-outside="keepOpen"
      :class="
        cn(
          onTop ? 'z-[70]' : 'z-50',
          'fixed top-[50%] left-[50%] grid max-h-[calc(100dvh-2rem)] w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 overflow-y-auto border border-border/70 bg-card p-6 shadow-elevated duration-200 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 sm:max-w-lg',
          props.class,
        )
      "
    >
      <slot />
      <DialogClose
        v-if="!hideClose"
        class="absolute top-4 right-4 flex size-7 items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:ring-2 focus:ring-ring/40 focus:outline-hidden disabled:pointer-events-none [&_svg]:size-4"
      >
        <X />
        <span class="sr-only">Close</span>
      </DialogClose>
    </DialogContent>
  </DialogPortal>
</template>

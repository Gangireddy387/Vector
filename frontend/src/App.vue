<script setup lang="ts">
import { defineAsyncComponent } from 'vue'
import ConfirmDialog from '@/components/common/ConfirmDialog.vue'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useDevice } from '@/composables/useDevice'
import { useTheme } from '@/composables/useTheme'

/** The call layer (sound, small call window) loads in its own file, so it never slows down the first page. */
const CallHost = defineAsyncComponent(() => import('@/modules/meetings/components/CallHost.vue'))

const { isDesktop } = useDevice()
const { resolvedTheme } = useTheme()
</script>

<template>
  <a
    href="#main-content"
    class="sr-only z-[100] bg-primary px-4 py-2 text-sm font-medium text-primary-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
  >
    Skip to main content
  </a>
  <TooltipProvider :delay-duration="250">
    <RouterView />
    <ConfirmDialog />
    <CallHost />
    <Toaster :position="isDesktop ? 'bottom-right' : 'top-center'" :theme="resolvedTheme" close-button rich-colors />
  </TooltipProvider>
</template>

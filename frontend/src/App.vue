<script setup lang="ts">
import ConfirmDialog from '@/components/common/ConfirmDialog.vue'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useDevice } from '@/composables/useDevice'
import { useTheme } from '@/composables/useTheme'

const { isDesktop } = useDevice()
const { resolvedTheme } = useTheme()
</script>

<template>
  <TooltipProvider :delay-duration="250">
    <RouterView />
    <ConfirmDialog />
    <Toaster :position="isDesktop ? 'bottom-right' : 'top-center'" :theme="resolvedTheme" close-button rich-colors />
  </TooltipProvider>
</template>

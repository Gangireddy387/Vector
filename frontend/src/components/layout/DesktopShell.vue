<script setup lang="ts">
import AppSidebar from './AppSidebar.vue'
import DesktopTopbar from './DesktopTopbar.vue'

defineEmits<{ showShortcuts: [] }>()
</script>

<template>
  <!-- The sidebar sits on the canvas; the page lives on a raised panel beside it. -->
  <div class="flex h-dvh overflow-hidden bg-sidebar">
    <AppSidebar @show-shortcuts="$emit('showShortcuts')" />
    <div class="my-2 mr-2 flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl bg-background shadow-panel">
      <DesktopTopbar />
      <main id="main-content" class="min-h-0 flex-1 overflow-y-auto">
        <slot />
      </main>
    </div>
  </div>
</template>

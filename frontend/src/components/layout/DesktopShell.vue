<script setup lang="ts">
import AppSidebar from './AppSidebar.vue'
import DesktopTopbar from './DesktopTopbar.vue'

defineEmits<{ showShortcuts: [] }>()
</script>

<template>
  <div class="flex h-dvh overflow-hidden bg-app">
    <AppSidebar @show-shortcuts="$emit('showShortcuts')" />
    <div class="flex min-w-0 flex-1 flex-col">
      <DesktopTopbar />
      <main id="main-content" class="min-h-0 flex-1 overflow-y-auto">
        <slot />
      </main>
    </div>
  </div>
</template>

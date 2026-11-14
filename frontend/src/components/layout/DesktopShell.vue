<script setup lang="ts">
import AppSidebar from './AppSidebar.vue'
import DesktopTopbar from './DesktopTopbar.vue'

/** `bare`: the page takes the whole window (a call in full screen); the sidebar and top bar step aside. */
defineProps<{ bare?: boolean }>()
defineEmits<{ showShortcuts: [] }>()
</script>

<template>
  <!-- The sidebar sits on the canvas; the page lives on a raised panel beside it. -->
  <div class="flex h-dvh overflow-hidden bg-sidebar">
    <AppSidebar v-show="!bare" @show-shortcuts="$emit('showShortcuts')" />
    <div class="flex min-w-0 flex-1 flex-col overflow-hidden bg-background" :class="!bare && 'my-2 mr-2 rounded-xl shadow-panel'">
      <DesktopTopbar v-show="!bare" />
      <main id="main-content" class="min-h-0 flex-1 overflow-y-auto">
        <slot />
      </main>
    </div>
  </div>
</template>

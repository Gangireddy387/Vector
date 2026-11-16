<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import AppSidebar from './AppSidebar.vue'
import DesktopTopbar from './DesktopTopbar.vue'

/** `bare`: the page takes the whole window (a call in full screen); the sidebar and top bar step aside. */
defineProps<{ bare?: boolean }>()
defineEmits<{ showShortcuts: [] }>()

const route = useRoute()
/** Messages, work chat, and other panes that pin a composer need a flex height chain. */
const fillHeight = computed(() => route.matched.some((record) => record.meta.fillHeight))
</script>

<template>
  <!-- The sidebar sits on the canvas; the page lives on a raised panel beside it. -->
  <div class="flex h-dvh overflow-hidden bg-sidebar">
    <AppSidebar v-show="!bare" @show-shortcuts="$emit('showShortcuts')" />
    <div
      class="flex min-w-0 flex-1 flex-col overflow-hidden bg-background"
      :class="!bare && 'my-1.5 mr-1.5 rounded-xl shadow-panel sm:my-2 sm:mr-2'"
    >
      <DesktopTopbar v-show="!bare" />
      <main
        id="main-content"
        class="flex min-h-0 flex-1 flex-col"
        :class="fillHeight || bare ? 'overflow-hidden' : 'overflow-x-hidden overflow-y-auto'"
      >
        <div class="flex w-full min-w-0 flex-col" :class="fillHeight && 'min-h-0 flex-1'">
          <slot />
        </div>
      </main>
    </div>
  </div>
</template>

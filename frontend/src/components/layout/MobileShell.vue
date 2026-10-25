<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import MobileTabBar from './MobileTabBar.vue'
import MobileTopbar from './MobileTopbar.vue'

const route = useRoute()
const showTabBar = computed(() => !route.matched.some((record) => record.meta.hideMobileTabBar))
</script>

<template>
  <div class="flex min-h-dvh flex-col bg-app">
    <MobileTopbar />
    <main id="main-content" class="flex flex-1 flex-col" :class="showTabBar && 'pb-[calc(6.5rem+env(safe-area-inset-bottom))]'">
      <slot />
    </main>
    <MobileTabBar v-if="showTabBar" />
  </div>
</template>

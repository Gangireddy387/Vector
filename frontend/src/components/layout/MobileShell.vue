<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import MobileTabBar from './MobileTabBar.vue'
import MobileTopbar from './MobileTopbar.vue'

/** `bare`: the page takes the whole screen (a call in full screen); the top bar and tab bar step aside. */
const props = defineProps<{ bare?: boolean }>()

const route = useRoute()
const showTabBar = computed(() => !props.bare && !route.matched.some((record) => record.meta.hideMobileTabBar))
</script>

<template>
  <div class="flex min-h-dvh flex-col bg-app">
    <MobileTopbar v-show="!bare" />
    <main id="main-content" class="flex flex-1 flex-col" :class="[showTabBar && 'pb-[calc(6.5rem+env(safe-area-inset-bottom))]', bare && 'h-dvh overflow-hidden']">
      <slot />
    </main>
    <MobileTabBar v-if="showTabBar" />
  </div>
</template>

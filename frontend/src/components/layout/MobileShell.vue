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
  <div class="flex h-dvh flex-col overflow-hidden bg-app supports-[padding:max(0px)]:pl-[env(safe-area-inset-left)] supports-[padding:max(0px)]:pr-[env(safe-area-inset-right)]">
    <MobileTopbar v-show="!bare" />
    <main
      id="main-content"
      class="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto overscroll-y-contain"
      :class="[showTabBar && 'pb-[calc(5.75rem+env(safe-area-inset-bottom))] sm:pb-[calc(6.5rem+env(safe-area-inset-bottom))]', bare && 'overflow-hidden']"
    >
      <div class="mx-auto flex min-h-0 w-full min-w-0 flex-1 flex-col">
        <slot />
      </div>
    </main>
    <MobileTabBar v-if="showTabBar" />
  </div>
</template>

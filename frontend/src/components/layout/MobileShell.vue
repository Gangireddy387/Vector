<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import MobileTabBar from './MobileTabBar.vue'
import MobileTopbar from './MobileTopbar.vue'

/** `bare`: the page takes the whole screen (a call in full screen); the top bar and tab bar step aside. */
const props = defineProps<{ bare?: boolean }>()

const route = useRoute()
/** Open message threads need the bottom edge for the composer — hide the tab bar there. */
const inMessageThread = computed(
  () => route.name === 'messages' && typeof route.params.conversationId === 'string' && route.params.conversationId.length > 0,
)
const showTabBar = computed(
  () => !props.bare && !inMessageThread.value && !route.matched.some((record) => record.meta.hideMobileTabBar),
)
/**
 * Chat / messages / inbox fill the pane. The project board opts out on phone so
 * the whole page scrolls (nested board scroll feels hard to use).
 */
const fillHeight = computed(
  () => route.name !== 'project-board' && route.matched.some((record) => record.meta.fillHeight),
)
</script>

<template>
  <div
    class="mobile-shell flex h-dvh flex-col overflow-hidden bg-app supports-[padding:max(0px)]:pl-[env(safe-area-inset-left)] supports-[padding:max(0px)]:pr-[env(safe-area-inset-right)]"
    :data-tab-bar="showTabBar ? '' : undefined"
  >
    <MobileTopbar v-show="!bare" />
    <main
      id="main-content"
      class="flex min-h-0 min-w-0 flex-1 flex-col overscroll-y-contain"
      :class="[
        fillHeight || bare ? 'overflow-hidden' : 'overflow-x-clip overflow-y-auto scroll-pb-mobile-tab',
        showTabBar && fillHeight && 'pb-mobile-tab',
      ]"
    >
      <!--
        Page scroll: a real spacer after the page so the last card can clear the floating tab bar.
        Fill-height: padding on main shrinks the pane (border-box) so nested scrollers end above the bar.
      -->
      <div
        class="mx-auto flex w-full min-w-0 flex-col"
        :class="fillHeight || bare ? 'min-h-0 flex-1' : 'min-h-full shrink-0'"
      >
        <slot />
      </div>
      <div
        v-if="showTabBar && !fillHeight && !bare"
        class="mobile-tab-spacer pointer-events-none w-full shrink-0"
        aria-hidden="true"
      />
    </main>
    <MobileTabBar v-if="showTabBar" />
  </div>
</template>

<style scoped>
.mobile-tab-spacer {
  height: var(--mobile-tab-clearance);
}
</style>

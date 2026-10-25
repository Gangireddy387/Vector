<script setup lang="ts">
import { useDevice } from '@/composables/useDevice'
import DesktopDashboard from '../components/DesktopDashboard.vue'
import MobileMyTasks from '../components/MobileMyTasks.vue'

const { isDesktop } = useDevice()
</script>

<template>
  <DesktopDashboard v-if="isDesktop" />
  <MobileMyTasks v-else />
</template>

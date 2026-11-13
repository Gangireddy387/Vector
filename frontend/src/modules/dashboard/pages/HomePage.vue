<script setup lang="ts">
import { useDevice } from '@/composables/useDevice'
import DesktopDashboard from '../components/DesktopDashboard.vue'
import MobileMyTasks from '../components/MobileMyTasks.vue'
import WelcomeDialog from '../components/WelcomeDialog.vue'

const { isDesktop } = useDevice()
</script>

<template>
  <DesktopDashboard v-if="isDesktop" />
  <MobileMyTasks v-else />
  <WelcomeDialog />
</template>

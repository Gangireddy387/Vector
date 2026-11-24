<script setup lang="ts">
import { ChevronLeft, Search } from 'lucide-vue-next'
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import UserAvatar from '@/components/common/UserAvatar.vue'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/modules/auth/auth.store'
import { useProjectsStore } from '@/modules/projects/projects.store'
import AppLogo from './AppLogo.vue'
import TimerChip from './TimerChip.vue'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const projects = useProjectsStore()

const showBack = computed(() => route.matched.some((record) => record.meta.mobileBack))
const title = computed(() => {
  if (typeof route.params.projectId === 'string' && !showBack.value) return projects.currentProject?.name ?? 'Project'
  return [...route.matched].reverse().find((record) => record.meta.title)?.meta.title ?? 'Vector'
})

function goBack() {
  if (window.history.state?.back) router.back()
  else void router.push({ name: 'home' })
}
</script>

<template>
  <header class="glass sticky top-0 z-30 border-b border-border/60 pt-safe">
    <div
      class="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent"
      aria-hidden="true"
    />
    <div class="flex h-14 items-center gap-1.5 px-2 sm:gap-2">
      <Button v-if="showBack" variant="ghost" size="icon" class="touch-target" aria-label="Back" @click="goBack">
        <ChevronLeft class="size-5" />
      </Button>
      <div v-else class="pl-1.5"><AppLogo compact /></div>
      <h1 class="min-w-0 flex-1 truncate text-base font-semibold">{{ title }}</h1>
      <TimerChip class="mr-0.5" />
      <Button variant="ghost" size="icon" class="touch-target" as-child>
        <RouterLink :to="{ name: 'search' }" aria-label="Search"><Search class="size-5" /></RouterLink>
      </Button>
      <RouterLink
        :to="{ name: 'settings' }"
        class="touch-target inline-flex items-center justify-center rounded-md p-1"
        aria-label="Your account"
      >
        <UserAvatar :user="auth.user" size="md" presence />
      </RouterLink>
    </div>
  </header>
</template>

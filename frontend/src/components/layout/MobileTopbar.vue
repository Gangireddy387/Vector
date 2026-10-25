<script setup lang="ts">
import { ChevronLeft, Search } from 'lucide-vue-next'
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import UserAvatar from '@/components/common/UserAvatar.vue'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/modules/auth/auth.store'
import { useProjectsStore } from '@/modules/projects/projects.store'
import AppLogo from './AppLogo.vue'

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
    <div class="flex h-14 items-center gap-2 px-2">
      <Button v-if="showBack" variant="ghost" size="icon" aria-label="Back" @click="goBack"><ChevronLeft class="size-5" /></Button>
      <div v-else class="pl-1.5"><AppLogo compact /></div>
      <h1 class="min-w-0 flex-1 truncate text-base font-semibold">{{ title }}</h1>
      <Button variant="ghost" size="icon" as-child>
        <RouterLink :to="{ name: 'search' }" aria-label="Search"><Search class="size-5" /></RouterLink>
      </Button>
      <RouterLink :to="{ name: 'settings' }" class=" p-1" aria-label="Your account">
        <UserAvatar :user="auth.user" size="md" />
      </RouterLink>
    </div>
  </header>
</template>

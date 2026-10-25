<script setup lang="ts">
import { Compass } from 'lucide-vue-next'
import EmptyState from '@/components/common/EmptyState.vue'
import { Button } from '@/components/ui/button'
</script>

<template>
  <div class="flex min-h-dvh items-center justify-center p-6">
    <EmptyState :icon="Compass" title="Page not found" description="The page you are looking for does not exist or you do not have access to it.">
      <Button as-child>
        <RouterLink to="/">Go home</RouterLink>
      </Button>
    </EmptyState>
  </div>
</template>

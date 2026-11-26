<script setup lang="ts">
import { BookOpen } from 'lucide-vue-next'
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PageFrame from '@/components/common/PageFrame.vue'
import HelpGuideBrowser from '../components/HelpGuideBrowser.vue'

const route = useRoute()
const router = useRouter()

const initialTopicId = computed(() => (typeof route.query.topic === 'string' ? route.query.topic : null))

function onTopic(id: string) {
  if (route.query.topic === id) return
  void router.replace({ query: { ...route.query, topic: id } })
}
</script>

<template>
  <PageFrame mode="bare" pad="compact" class="flex h-full min-h-0 flex-col gap-2 overflow-hidden">
    <header class="flex shrink-0 items-center gap-2.5">
      <span class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand text-white shadow-glow">
        <BookOpen class="size-4" />
      </span>
      <div class="min-w-0">
        <h1 class="text-base font-semibold tracking-tight sm:text-lg">Help & user guide</h1>
        <p class="text-xs text-muted-foreground sm:text-sm">Step-by-step instructions with examples and tips.</p>
      </div>
    </header>

    <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
      <HelpGuideBrowser class="min-h-0 flex-1" :initial-topic-id="initialTopicId" @update:topic-id="onTopic" />
    </div>
  </PageFrame>
</template>

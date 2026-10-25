<script setup lang="ts">
import { Sparkles, X } from 'lucide-vue-next'
import { ref } from 'vue'
import { toast } from 'vue-sonner'
import { Skeleton } from '@/components/ui/skeleton'
import { getErrorMessage } from '@/lib/http'
import { aiApi, type IssueSummary } from '../../api/ai.api'

const props = defineProps<{ issueId: string }>()

const summary = ref<IssueSummary | null>(null)
const isLoading = ref(false)

async function generate() {
  isLoading.value = true
  try {
    summary.value = await aiApi.summarize(props.issueId)
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    isLoading.value = false
  }
}

defineExpose({ generate })
</script>

<template>
  <div v-if="isLoading || summary" class="relative space-y-2 border border-primary/30 bg-primary/5 p-4">
    <p class="flex items-center gap-1.5 text-xs font-semibold text-primary">
      <Sparkles class="size-3.5" /> Summary
      <span v-if="summary?.source === 'heuristic'" class="font-normal text-muted-foreground">(quick summary — add an OpenAI key for AI summaries)</span>
    </p>
    <button v-if="summary" type="button" class="absolute top-3 right-3 text-muted-foreground hover:text-foreground" aria-label="Close summary" @click="summary = null">
      <X class="size-4" />
    </button>
    <template v-if="isLoading">
      <Skeleton class="h-4 w-full" />
      <Skeleton class="h-4 w-2/3" />
    </template>
    <template v-else-if="summary">
      <p class="text-sm">{{ summary.summary }}</p>
      <ul v-if="summary.keyPoints.length" class="list-disc space-y-0.5 pl-5 text-sm text-muted-foreground">
        <li v-for="point in summary.keyPoints" :key="point">{{ point }}</li>
      </ul>
      <div v-if="summary.nextSteps.length" class="text-sm">
        <p class="font-medium">Next steps</p>
        <ul class="list-disc pl-5 text-muted-foreground">
          <li v-for="step in summary.nextSteps" :key="step">{{ step }}</li>
        </ul>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { LoaderCircle, Sparkles } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import { getErrorMessage } from '@/lib/http'
import { useAuthStore } from '@/modules/auth/auth.store'
import { aiApi, aiSourceHint, type AiSource, type NextActionKind } from '@/modules/issues/api/ai.api'
import type { Issue } from '@/types/models'
import { boardCardHint } from '../lib/board-card-hint'

const props = defineProps<{
  issue: Issue
  compact?: boolean
}>()

const auth = useAuthStore()
const canAi = computed(() => auth.hasFeature('aiAssistant'))

const local = computed(() => boardCardHint(props.issue))
const remoteAction = ref<string | null>(null)
const remoteSource = ref<AiSource | null>(null)
const remoteKind = ref<NextActionKind | null>(null)
const loading = ref(false)

watch(
  () => props.issue.id,
  () => {
    remoteAction.value = null
    remoteSource.value = null
    remoteKind.value = null
  },
)

const action = computed(() => remoteAction.value ?? local.value?.action ?? null)
const kind = computed(() => remoteKind.value ?? local.value?.kind ?? 'progress')

async function refresh(event: Event) {
  event.preventDefault()
  event.stopPropagation()
  if (!canAi.value || loading.value) return
  loading.value = true
  try {
    const result = await aiApi.nextAction(props.issue.id)
    remoteAction.value = result.action
    remoteSource.value = result.source
    remoteKind.value = result.kind
    const hint = aiSourceHint(result.source)
    if (hint) toast.message('Next action', { description: hint })
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div
    v-if="action"
    class="board-card-hint group/hint flex items-start gap-1.5 rounded-md border border-primary/15 bg-primary/[0.06] text-left"
    :class="compact ? 'mt-1 px-1.5 py-1' : 'mt-2 px-2 py-1.5'"
    @click.stop
    @keydown.stop
  >
    <button
      v-if="canAi"
      type="button"
      class="mt-px inline-flex size-4 shrink-0 items-center justify-center rounded text-primary transition-colors hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
      :aria-label="loading ? 'Refreshing suggestion' : 'Refresh AI next action'"
      :title="loading ? 'Thinking…' : 'Refresh suggestion'"
      :disabled="loading"
      @click="refresh"
    >
      <LoaderCircle v-if="loading" class="size-3 animate-spin" />
      <Sparkles v-else class="size-3" />
    </button>
    <Sparkles v-else class="mt-px size-3 shrink-0 text-primary/80" aria-hidden="true" />
    <p
      class="min-w-0 flex-1 leading-snug text-primary/90"
      :class="compact ? 'line-clamp-1 text-[10px]' : 'line-clamp-2 text-[11px]'"
      :title="action"
    >
      <span class="font-semibold tracking-wide uppercase opacity-70" :class="compact ? 'text-[9px]' : 'text-[9.5px]'">
        Next
        <template v-if="kind === 'assign'"> · assign</template>
        <template v-else-if="kind === 'schedule'"> · schedule</template>
        <template v-else-if="kind === 'breakdown'"> · break down</template>
        <template v-else-if="kind === 'unblock'"> · unblock</template>
      </span>
      <span class="mt-0.5 block font-medium text-foreground/90">{{ action }}</span>
    </p>
  </div>
</template>

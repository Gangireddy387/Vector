<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { renderRichText } from '@/lib/markdown'

/** Markdown with @mention chips and clickable task keys; task links open in-app. */
const props = withDefaults(defineProps<{ source?: string | null; issueKeys?: Iterable<string>; compact?: boolean }>(), { issueKeys: () => [], compact: false })

const router = useRouter()
const html = computed(() => renderRichText(props.source, props.issueKeys))

function onClick(event: MouseEvent) {
  const link = (event.target as HTMLElement).closest<HTMLAnchorElement>('a[data-issue-key]')
  if (!link || event.ctrlKey || event.metaKey || event.shiftKey) return
  event.preventDefault()
  void router.push({ name: 'issue', params: { issueKey: link.dataset.issueKey } })
}
</script>

<template>
  <!-- eslint-disable-next-line vue/no-v-html -- sanitized by DOMPurify in renderRichText -->
  <div class="markdown-body" :class="compact && 'compact'" @click="onClick" v-html="html" />
</template>

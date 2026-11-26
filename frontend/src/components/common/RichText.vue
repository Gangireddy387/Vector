<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { renderRichText, type WikiLinkTarget } from '@/lib/markdown'
import { useOpenIssue } from '@/modules/issues/composables/useOpenIssue'

/** Markdown with @mention chips, clickable task keys, and optional wiki [[Title]] links. */
const props = withDefaults(
  defineProps<{
    source?: string | null
    issueKeys?: Iterable<string>
    wikiPages?: Iterable<WikiLinkTarget>
    compact?: boolean
  }>(),
  { issueKeys: () => [], wikiPages: () => [], compact: false },
)

const router = useRouter()
const openIssue = useOpenIssue()
const html = computed(() => renderRichText(props.source, props.issueKeys, props.wikiPages))

function onClick(event: MouseEvent) {
  if (event.ctrlKey || event.metaKey || event.shiftKey) return
  const target = (event.target as HTMLElement).closest<HTMLAnchorElement>('a[data-issue-key], a[data-wiki-id]')
  if (!target) return
  event.preventDefault()
  if (target.dataset.wikiId) {
    void router.push({ name: 'wiki-page', params: { pageId: target.dataset.wikiId } })
    return
  }
  if (target.dataset.issueKey) openIssue({ key: target.dataset.issueKey })
}
</script>

<template>
  <!-- eslint-disable-next-line vue/no-v-html -- sanitized by DOMPurify in renderRichText -->
  <div class="markdown-body" :class="compact && 'compact'" @click="onClick" v-html="html" />
</template>

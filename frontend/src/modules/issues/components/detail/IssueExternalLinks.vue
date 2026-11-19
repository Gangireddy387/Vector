<script setup lang="ts">
import { ExternalLink, Github, GitBranch, X } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getErrorMessage } from '@/lib/http'
import type { IssueDetail } from '@/types/models'
import { issuesApi } from '../../api/issues.api'

const props = withDefaults(defineProps<{ issue: IssueDetail; editable?: boolean }>(), { editable: true })
const emit = defineEmits<{ changed: [] }>()

const isAdding = ref(false)
const url = ref('')
const isSaving = ref(false)

const links = computed(() => props.issue.externalLinks ?? [])

defineExpose({ startAdding: () => (isAdding.value = true) })

function kindLabel(kind: string | null) {
  if (kind === 'pull') return 'PR'
  if (kind === 'merge_request') return 'MR'
  if (kind === 'issue') return 'Issue'
  return null
}

function providerIcon(provider: string) {
  if (provider === 'github') return Github
  return GitBranch
}

async function addLink() {
  const trimmed = url.value.trim()
  if (!trimmed) return
  isSaving.value = true
  try {
    await issuesApi.addExternalLink(props.issue.id, { url: trimmed })
    url.value = ''
    isAdding.value = false
    emit('changed')
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    isSaving.value = false
  }
}

async function removeLink(linkId: string) {
  try {
    await issuesApi.removeExternalLink(linkId)
    emit('changed')
  } catch (error) {
    toast.error(getErrorMessage(error))
  }
}
</script>

<template>
  <section v-if="links.length || isAdding" class="space-y-3">
    <h2 class="text-sm font-semibold">Code links</h2>
    <ul v-if="links.length" class="divide-y overflow-hidden border">
      <li v-for="link in links" :key="link.id" class="flex items-center gap-2 bg-card px-3 py-2 text-sm">
        <component :is="providerIcon(link.provider)" class="size-3.5 shrink-0 text-muted-foreground" />
        <span v-if="kindLabel(link.kind)" class="w-10 shrink-0 text-xs text-muted-foreground">{{ kindLabel(link.kind) }}</span>
        <a
          :href="link.url"
          target="_blank"
          rel="noopener noreferrer"
          class="min-w-0 flex-1 truncate hover:underline"
        >
          {{ link.label }}
          <ExternalLink class="ml-1 inline size-3 text-muted-foreground" />
        </a>
        <button
          v-if="editable"
          type="button"
          class="p-1 text-muted-foreground hover:text-destructive"
          aria-label="Remove code link"
          @click="removeLink(link.id)"
        >
          <X class="size-3.5" />
        </button>
      </li>
    </ul>
    <form v-if="isAdding" class="flex flex-wrap items-center gap-2" @submit.prevent="addLink">
      <Input
        v-model="url"
        placeholder="https://github.com/org/repo/issues/12"
        class="h-8 min-w-56 flex-1"
        autofocus
      />
      <Button type="submit" size="sm" :loading="isSaving">Link</Button>
      <Button type="button" size="sm" variant="ghost" @click="isAdding = false">Cancel</Button>
    </form>
  </section>
</template>

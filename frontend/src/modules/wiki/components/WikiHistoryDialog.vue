<script setup lang="ts">
import { format, parseISO } from 'date-fns'
import { ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import MarkdownContent from '@/components/common/MarkdownContent.vue'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { useConfirm } from '@/composables/useConfirm'
import { getErrorMessage } from '@/lib/http'
import { wikiApi, type WikiPageRevision } from '../wiki.api'

const props = defineProps<{ open: boolean; pageId: string | null; pageTitle?: string }>()
const emit = defineEmits<{ 'update:open': [value: boolean]; restored: [] }>()

const confirm = useConfirm()
const revisions = ref<WikiPageRevision[] | null>(null)
const restoringId = ref<string | null>(null)

watch(
  () => [props.open, props.pageId] as const,
  async ([open]) => {
    if (!open || !props.pageId) {
      revisions.value = null
      return
    }
    revisions.value = null
    try {
      revisions.value = await wikiApi.history(props.pageId)
    } catch (error) {
      revisions.value = []
      toast.error(getErrorMessage(error))
    }
  },
)

async function restore(revision: WikiPageRevision) {
  if (!props.pageId) return
  const ok = await confirm({
    title: 'Restore this version?',
    description: 'The current page is saved to history first, then replaced with this version.',
    confirmLabel: 'Restore',
  })
  if (!ok) return
  restoringId.value = revision.id
  try {
    await wikiApi.restore(props.pageId, revision.id)
    toast.success('Version restored')
    emit('restored')
    emit('update:open', false)
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    restoringId.value = null
  }
}
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="gap-3 sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>Version history</DialogTitle>
        <DialogDescription>
          Earlier saves of {{ pageTitle ? `“${pageTitle}”` : 'this page' }}, newest first.
        </DialogDescription>
      </DialogHeader>
      <div class="max-h-96 space-y-3 overflow-y-auto scrollbar-thin">
        <template v-if="revisions === null">
          <Skeleton v-for="index in 2" :key="index" class="h-20 w-full rounded-lg" />
        </template>
        <p v-else-if="!revisions.length" class="py-8 text-center text-sm text-muted-foreground">No earlier versions yet.</p>
        <article v-for="revision in revisions" :key="revision.id" class="rounded-lg border border-border bg-card px-3 py-2.5">
          <div class="mb-1.5 flex items-center gap-2">
            <p class="min-w-0 flex-1 text-[11px] text-muted-foreground">
              {{ revision.editor?.name ?? 'Someone' }} · {{ format(parseISO(revision.createdAt), 'd MMM yyyy, HH:mm') }}
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              class="h-7 px-2 text-xs"
              :loading="restoringId === revision.id"
              :disabled="Boolean(restoringId)"
              @click="restore(revision)"
            >
              Restore
            </Button>
          </div>
          <p class="mb-1 text-[13px] font-semibold">{{ revision.title }}</p>
          <MarkdownContent :source="revision.body" class="text-[13px]" />
        </article>
      </div>
    </DialogContent>
  </Dialog>
</template>

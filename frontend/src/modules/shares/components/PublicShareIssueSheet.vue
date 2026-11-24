<script setup lang="ts">
import { X } from 'lucide-vue-next'
import { ref, watch } from 'vue'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { getErrorMessage } from '@/lib/http'
import { sharesApi, type PublicSharePayload } from '../shares.api'
import PublicIssueDetail from './PublicIssueDetail.vue'

const props = defineProps<{
  token: string
  issueId: string | null
}>()

const open = defineModel<boolean>({ default: false })
const detail = ref<PublicSharePayload | null>(null)
const error = ref('')
const isLoading = ref(false)

watch(
  () => [open.value, props.issueId] as const,
  async ([isOpen, issueId]) => {
    if (!isOpen || !issueId) {
      detail.value = null
      error.value = ''
      return
    }
    isLoading.value = true
    error.value = ''
    detail.value = null
    try {
      detail.value = await sharesApi.publicShareIssue(props.token, issueId)
    } catch (err) {
      error.value = getErrorMessage(err, 'Could not open this task.')
    } finally {
      isLoading.value = false
    }
  },
)
</script>

<template>
  <Sheet v-model:open="open">
    <SheetContent side="right" class="flex w-full flex-col gap-0 p-0 sm:max-w-xl" hide-close clear-backdrop>
      <div class="relative flex items-start justify-between gap-3 border-b border-border/70 bg-background/90 px-4 py-3.5 sm:px-5">
        <div
          class="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/35 to-transparent"
          aria-hidden="true"
        />
        <div class="min-w-0">
          <SheetTitle class="truncate font-mono text-sm font-semibold tracking-tight">
            {{ detail?.issue?.key ?? (isLoading ? 'Opening…' : 'Task') }}
          </SheetTitle>
          <SheetDescription class="mt-0.5 truncate text-xs">
            {{ detail?.issue?.title ?? 'Shared board task' }}
          </SheetDescription>
        </div>
        <Button type="button" variant="ghost" size="icon" class="size-8 shrink-0" aria-label="Close" @click="open = false">
          <X class="size-4" />
        </Button>
      </div>

      <div class="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-5 sm:py-6">
        <div v-if="isLoading" class="space-y-3">
          <Skeleton class="h-5 w-40" />
          <Skeleton class="h-8 w-3/4" />
          <Skeleton class="h-28 w-full rounded-xl" />
          <Skeleton class="h-16 w-full rounded-xl" />
        </div>
        <div v-else-if="error" class="space-y-3 py-12 text-center">
          <p class="text-sm font-medium">Couldn’t open task</p>
          <p class="text-xs text-muted-foreground">{{ error }}</p>
          <Button type="button" size="sm" variant="outline" @click="open = false">Back to board</Button>
        </div>
        <PublicIssueDetail
          v-else-if="detail?.issue"
          :token="token"
          :issue="detail.issue"
          :guest-comments-enabled="detail.guestCommentsEnabled"
          :comments="detail.comments"
        />
      </div>
    </SheetContent>
  </Sheet>
</template>

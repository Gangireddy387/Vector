<script setup lang="ts">
import { X } from 'lucide-vue-next'
import { ref } from 'vue'
import { toast } from 'vue-sonner'
import IssueTypeIcon from '@/components/common/IssueTypeIcon.vue'
import StatusBadge from '@/components/common/StatusBadge.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SelectField } from '@/components/forms'
import { getErrorMessage } from '@/lib/http'
import type { IssueDetail, IssueLinkType } from '@/types/models'
import { issuesApi } from '../../api/issues.api'

const props = withDefaults(defineProps<{ issue: IssueDetail; editable?: boolean }>(), { editable: true })
const emit = defineEmits<{ changed: [] }>()

const LINK_TYPES: Array<{ value: IssueLinkType; label: string }> = [
  { value: 'relates_to', label: 'relates to' },
  { value: 'blocks', label: 'blocks' },
  { value: 'duplicates', label: 'duplicates' },
]

const isAdding = ref(false)
const target = ref('')
const linkType = ref<IssueLinkType>('relates_to')
const isSaving = ref(false)

async function addLink() {
  if (!target.value.trim()) return
  isSaving.value = true
  try {
    await issuesApi.addLink(props.issue.id, { targetIssue: target.value.trim().toUpperCase(), type: linkType.value })
    target.value = ''
    isAdding.value = false
    emit('changed')
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    isSaving.value = false
  }
}

defineExpose({ startAdding: () => (isAdding.value = true) })

async function removeLink(linkId: string) {
  try {
    await issuesApi.removeLink(linkId)
    emit('changed')
  } catch (error) {
    toast.error(getErrorMessage(error))
  }
}
</script>

<template>
  <section v-if="issue.links.length || isAdding" class="space-y-3">
    <div class="flex items-center justify-between">
      <h2 class="text-sm font-semibold">Linked tasks</h2>
    </div>
    <ul v-if="issue.links.length" class="divide-y overflow-hidden border">
      <li v-for="link in issue.links" :key="link.id" class="flex items-center gap-2 bg-card px-3 py-2 text-sm">
        <span class="w-28 shrink-0 text-xs text-muted-foreground">{{ link.label }}</span>
        <IssueTypeIcon :type="link.issue.type" />
        <RouterLink :to="{ name: 'issue', params: { issueKey: link.issue.key } }" class="min-w-0 flex-1 truncate hover:underline">
          <span class="mr-1.5 text-xs text-muted-foreground">{{ link.issue.key }}</span>{{ link.issue.title }}
        </RouterLink>
        <StatusBadge v-if="link.issue.status" :status="link.issue.status" />
        <button
          v-if="editable && link.direction === 'outward'"
          type="button"
          class=" p-1 text-muted-foreground hover:text-destructive"
          aria-label="Remove link"
          @click="removeLink(link.id)"
        >
          <X class="size-3.5" />
        </button>
      </li>
    </ul>
    <form v-if="isAdding" class="flex flex-wrap items-center gap-2" @submit.prevent="addLink">
      <SelectField
        :model-value="linkType"
        :options="LINK_TYPES"
        size="sm"
        class="w-40"
        aria-label="Link type"
        @update:model-value="(value) => value && (linkType = value as IssueLinkType)"
      />
      <Input v-model="target" placeholder="Task key, e.g. VEC-12" class="h-8 w-44" autofocus />
      <Button type="submit" size="sm" :loading="isSaving">Link</Button>
      <Button type="button" size="sm" variant="ghost" @click="isAdding = false">Cancel</Button>
    </form>
  </section>
</template>

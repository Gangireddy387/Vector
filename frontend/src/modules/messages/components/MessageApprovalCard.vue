<script setup lang="ts">
import { Check, ClipboardCheck, X } from 'lucide-vue-next'
import { computed } from 'vue'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/modules/auth/auth.store'
import type { MessageApproval } from '../messages.api'

const props = defineProps<{ approval: MessageApproval }>()
const emit = defineEmits<{ respond: [decision: 'approved' | 'rejected'] }>()
const auth = useAuthStore()

const canRespond = computed(
  () => props.approval.status === 'pending' && props.approval.createdById !== auth.user?.id && !props.approval.myDecision,
)
const statusLabel = computed(() => {
  if (props.approval.status === 'approved') return 'Approved'
  if (props.approval.status === 'rejected') return 'Rejected'
  return 'Awaiting review'
})
</script>

<template>
  <div class="mt-2 rounded-lg border border-amber-200/80 bg-amber-50/50 p-3 dark:border-amber-400/20 dark:bg-amber-400/5">
    <p class="flex items-center gap-1.5 text-[12px] font-semibold text-amber-800 dark:text-amber-300">
      <ClipboardCheck class="size-3.5" /> Approval · {{ statusLabel }}
    </p>
    <p class="mt-1 text-[14px] font-medium">{{ approval.title }}</p>
    <p class="mt-1 text-[12px] text-muted-foreground">
      {{ approval.approved }} approved · {{ approval.rejected }} rejected
      <span v-if="approval.responses.length"> · {{ approval.responses.map((row) => row.user?.name ?? 'Someone').join(', ') }}</span>
    </p>
    <div v-if="canRespond" class="mt-2.5 flex gap-2">
      <Button size="sm" class="bg-emerald-600 hover:bg-emerald-600/90" @click="emit('respond', 'approved')"><Check class="size-3.5" /> Approve</Button>
      <Button size="sm" variant="destructive" @click="emit('respond', 'rejected')"><X class="size-3.5" /> Reject</Button>
    </div>
    <p v-else-if="approval.myDecision" class="mt-2 text-[12px] font-medium capitalize text-muted-foreground">You {{ approval.myDecision }}</p>
  </div>
</template>

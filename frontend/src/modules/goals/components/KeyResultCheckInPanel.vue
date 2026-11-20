<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import UserAvatar from '@/components/common/UserAvatar.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatDateTime } from '@/lib/format'
import { getErrorMessage } from '@/lib/http'
import type { Goal, KeyResult, KeyResultCheckIn } from '@/types/models'
import { goalsApi } from '../goals.api'

const props = defineProps<{
  goalId: string
  keyResult: KeyResult
}>()

const emit = defineEmits<{
  updated: [goal: Goal]
}>()

const checkIns = ref<KeyResultCheckIn[]>([])
const loading = ref(false)
const submitting = ref(false)
const value = ref(String(props.keyResult.currentValue ?? 0))
const note = ref('')

async function loadHistory() {
  loading.value = true
  try {
    checkIns.value = await goalsApi.listCheckIns(props.goalId, props.keyResult.id)
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void loadHistory()
})

watch(
  () => props.keyResult.id,
  () => {
    value.value = String(props.keyResult.currentValue ?? 0)
    note.value = ''
    void loadHistory()
  },
)

async function submit() {
  const next = Number(value.value)
  if (!Number.isFinite(next)) {
    toast.error('Enter a numeric value')
    return
  }
  submitting.value = true
  try {
    const result = await goalsApi.createCheckIn(props.goalId, props.keyResult.id, {
      value: next,
      note: note.value.trim() || null,
    })
    emit('updated', result.goal)
    checkIns.value = [result.checkIn, ...checkIns.value]
    note.value = ''
    toast.success('Check-in recorded')
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="mt-3 space-y-3 border-t pt-3">
    <form class="flex flex-col gap-2 sm:flex-row sm:items-end" @submit.prevent="submit">
      <label class="min-w-0 flex-1 space-y-1 text-xs">
        <span class="text-muted-foreground">Check-in value</span>
        <Input v-model="value" type="number" class="h-8" :disabled="submitting" />
      </label>
      <label class="min-w-0 flex-[2] space-y-1 text-xs">
        <span class="text-muted-foreground">Note (optional)</span>
        <Input v-model="note" placeholder="What changed?" class="h-8" :disabled="submitting" />
      </label>
      <Button type="submit" size="sm" :loading="submitting">Check in</Button>
    </form>

    <div class="space-y-1.5">
      <p class="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">History</p>
      <p v-if="loading && !checkIns.length" class="text-xs text-muted-foreground">Loading…</p>
      <p v-else-if="!checkIns.length" class="text-xs text-muted-foreground">No check-ins yet.</p>
      <ul v-else class="max-h-40 space-y-1.5 overflow-y-auto">
        <li
          v-for="item in checkIns"
          :key="item.id"
          class="flex items-start gap-2 rounded-md bg-muted/30 px-2 py-1.5 text-xs"
        >
          <UserAvatar v-if="item.createdBy" :user="item.createdBy" size="xs" class="mt-0.5 shrink-0" />
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span class="font-medium tabular-nums">
                {{ item.value }}{{ keyResult.unit ? ` ${keyResult.unit}` : '' }}
              </span>
              <span class="text-muted-foreground">{{ item.progress }}%</span>
              <span class="text-muted-foreground">{{ formatDateTime(item.createdAt) }}</span>
            </div>
            <p v-if="item.note" class="mt-0.5 text-muted-foreground">{{ item.note }}</p>
          </div>
        </li>
      </ul>
    </div>
  </div>
</template>

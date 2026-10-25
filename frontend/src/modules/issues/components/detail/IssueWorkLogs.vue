<script setup lang="ts">
import { Timer, Trash2 } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import EmptyState from '@/components/common/EmptyState.vue'
import UserAvatar from '@/components/common/UserAvatar.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatDateTime } from '@/lib/format'
import { getErrorMessage } from '@/lib/http'
import { formatMinutes, parseDuration } from '@/lib/utils'
import { useAuthStore } from '@/modules/auth/auth.store'
import type { WorkLog } from '@/types/models'
import { workLogsApi } from '../../api/collaboration.api'

const props = withDefaults(defineProps<{ issueId: string; editable?: boolean; refreshKey?: number }>(), { editable: true, refreshKey: 0 })
const emit = defineEmits<{ changed: [] }>()

const auth = useAuthStore()
const workLogs = ref<WorkLog[]>([])
const duration = ref('')
const note = ref('')
const isSaving = ref(false)

const parsedMinutes = computed(() => parseDuration(duration.value))
const total = computed(() => workLogs.value.reduce((sum, log) => sum + log.minutes, 0))

const load = async () => (workLogs.value = await workLogsApi.list(props.issueId))
watch(() => [props.issueId, props.refreshKey], load, { immediate: true })

async function submit() {
  if (!parsedMinutes.value) {
    toast.error('Enter a duration such as 45m, 1h 30m or 2')
    return
  }
  isSaving.value = true
  try {
    await workLogsApi.create(props.issueId, { minutes: parsedMinutes.value, note: note.value.trim() || null })
    duration.value = ''
    note.value = ''
    await load()
    emit('changed')
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    isSaving.value = false
  }
}

async function remove(log: WorkLog) {
  await workLogsApi.remove(log.id)
  await load()
  emit('changed')
}
</script>

<template>
  <div class="space-y-4">
    <form v-if="editable" class="flex flex-col gap-2 sm:flex-row" @submit.prevent="submit">
      <Input v-model="duration" placeholder="Time spent, e.g. 1h 30m" class="sm:w-44" aria-label="Time spent" />
      <Input v-model="note" placeholder="What did you work on? (optional)" class="flex-1" aria-label="Work note" />
      <Button type="submit" :loading="isSaving" :disabled="!duration">Log time</Button>
    </form>
    <p v-if="duration && parsedMinutes" class="-mt-2 text-xs text-muted-foreground">Will log {{ formatMinutes(parsedMinutes) }}</p>

    <EmptyState v-if="!workLogs.length" :icon="Timer" title="No time logged" class="py-6" />
    <template v-else>
      <p class="text-sm text-muted-foreground">Total logged: <span class="font-medium text-foreground">{{ formatMinutes(total) }}</span></p>
      <ul class="divide-y border">
        <li v-for="log in workLogs" :key="log.id" class="flex items-center gap-3 px-3 py-2 text-sm">
          <UserAvatar :user="log.user" size="sm" />
          <span class="w-16 font-medium tabular-nums">{{ formatMinutes(log.minutes) }}</span>
          <span class="min-w-0 flex-1 truncate text-muted-foreground">{{ log.note }}</span>
          <span class="hidden text-xs text-muted-foreground sm:inline">{{ formatDateTime(log.loggedAt) }}</span>
          <Button v-if="log.user?.id === auth.user?.id" variant="ghost" size="icon-sm" aria-label="Delete work log" @click="remove(log)">
            <Trash2 />
          </Button>
        </li>
      </ul>
    </template>
  </div>
</template>

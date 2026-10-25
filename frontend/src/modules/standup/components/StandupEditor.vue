<script setup lang="ts">
import { Sparkles, Trash2 } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import UserAvatar from '@/components/common/UserAvatar.vue'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useConfirm } from '@/composables/useConfirm'
import { formatDate } from '@/lib/format'
import { getErrorMessage } from '@/lib/http'
import { useAuthStore } from '@/modules/auth/auth.store'
import { type StandupUpdate, standupApi } from '../standup.api'

const props = defineProps<{ projectId: string; date: string; previousDate: string; update: StandupUpdate | null }>()
const emit = defineEmits<{ saved: []; cancel: [] }>()

const auth = useAuthStore()
const confirm = useConfirm()
const form = ref({ yesterday: '', today: '', blockers: '' })
const isSaving = ref(false)
const isDrafting = ref(false)
const draftNote = ref('')

watch(
  () => [props.update, props.date] as const,
  ([update]) => {
    form.value = { yesterday: update?.yesterday ?? '', today: update?.today ?? '', blockers: update?.blockers ?? '' }
    draftNote.value = ''
  },
  { immediate: true },
)

const isEmpty = computed(() => !form.value.yesterday.trim() && !form.value.today.trim() && !form.value.blockers.trim())
const isDirty = computed(
  () =>
    form.value.yesterday !== (props.update?.yesterday ?? '') || form.value.today !== (props.update?.today ?? '') || form.value.blockers !== (props.update?.blockers ?? ''),
)

async function draftFromActivity() {
  if (!isEmpty.value) {
    const ok = await confirm({ title: 'Replace what you wrote?', description: 'The draft is built from your tracked activity and will replace the current text.', confirmLabel: 'Replace' })
    if (!ok) return
  }
  isDrafting.value = true
  try {
    const draft = await standupApi.draft(props.projectId, props.date)
    form.value = { yesterday: draft.yesterday, today: draft.today, blockers: draft.blockers }
    const { facts } = draft
    draftNote.value = `Drafted from your activity since ${formatDate(draft.previousDate, 'EEE d MMM')}: ${facts.completed} completed, ${facts.moved} moved, ${facts.discussed} discussed, ${facts.inProgress} in progress. Review and save.`
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    isDrafting.value = false
  }
}

async function save() {
  isSaving.value = true
  try {
    await standupApi.save(props.projectId, { date: props.date, ...form.value })
    toast.success(props.update ? 'Standup updated' : 'Standup posted', { description: 'Tasks you mentioned now show it on their Follow-ups tab.' })
    draftNote.value = ''
    emit('saved')
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    isSaving.value = false
  }
}

async function remove() {
  const ok = await confirm({ title: 'Delete your standup for this day?', confirmLabel: 'Delete', destructive: true })
  if (!ok) return
  try {
    await standupApi.remove(props.projectId, props.date)
    emit('saved')
  } catch (error) {
    toast.error(getErrorMessage(error))
  }
}

const FIELDS = computed(() => [
  { key: 'yesterday' as const, label: `Since ${formatDate(props.previousDate, 'EEEE')}`, placeholder: '- Finished VEC-12 checkout flow\n- Reviewed VEC-15', tone: '' },
  { key: 'today' as const, label: 'Today', placeholder: '- Continue VEC-18 payments\n- Pair with Mei on VEC-20', tone: '' },
  { key: 'blockers' as const, label: 'Blockers', placeholder: 'Anything in your way? Leave empty if nothing. Admins are notified.', tone: 'text-destructive' },
])
</script>

<template>
  <section class="border border-primary/30 bg-card shadow-soft">
    <header class="flex flex-wrap items-center gap-3 border-b px-4 py-3">
      <UserAvatar :user="auth.user" size="md" />
      <div class="min-w-0 flex-1">
        <h2 class="text-sm font-semibold">{{ update ? 'Your update' : 'Post your update' }}</h2>
        <p class="text-xs text-muted-foreground">Mention task keys like VEC-12 and the update is recorded on those tasks.</p>
      </div>
      <Button variant="outline" size="sm" :loading="isDrafting" @click="draftFromActivity"><Sparkles /> Draft from my activity</Button>
    </header>

    <p v-if="draftNote" class="border-b bg-primary/5 px-4 py-2 text-xs text-primary">{{ draftNote }}</p>

    <div class="grid gap-4 p-4 lg:grid-cols-3">
      <label v-for="field in FIELDS" :key="field.key" class="space-y-1.5">
        <span class="text-xs font-semibold tracking-wide uppercase" :class="field.tone || 'text-muted-foreground'">{{ field.label }}</span>
        <Textarea v-model="form[field.key]" rows="5" :placeholder="field.placeholder" class="text-sm" />
      </label>
    </div>

    <footer class="flex flex-wrap items-center gap-2 border-t px-4 py-3">
      <Button size="sm" :loading="isSaving" :disabled="isEmpty || !isDirty" @click="save">{{ update ? 'Save changes' : 'Post update' }}</Button>
      <Button v-if="update" size="sm" variant="ghost" @click="emit('cancel')">Cancel</Button>
      <span v-if="update" class="text-xs text-muted-foreground">Last saved {{ formatDate(update.updatedAt, 'd MMM, HH:mm') }}</span>
      <Button v-if="update" size="sm" variant="ghost" class="ml-auto text-destructive" @click="remove"><Trash2 /> Delete</Button>
    </footer>
  </section>
</template>

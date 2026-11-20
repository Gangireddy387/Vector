<script setup lang="ts">
import { ClipboardPenLine, Copy, RefreshCw } from 'lucide-vue-next'
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { toast } from 'vue-sonner'
import FormField from '@/components/common/FormField.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { SelectField } from '@/components/forms'
import { useConfirm } from '@/composables/useConfirm'
import { getErrorMessage } from '@/lib/http'
import { useAuthStore } from '@/modules/auth/auth.store'
import type { IssuePriority, IssueType } from '@/types/models'
import { intakeApi, intakeLinkUrl, type IntakeFormState } from '../intake.api'

const props = defineProps<{ projectId: string }>()

const auth = useAuthStore()
const confirm = useConfirm()
const intake = ref<IntakeFormState>({ enabled: false, token: null })
const isLoading = ref(true)
const isSaving = ref(false)
const locked = computed(() => !auth.hasFeature('intakeForms'))
const link = computed(() => (intake.value.token ? intakeLinkUrl(intake.value.token) : ''))

const details = reactive({
  title: 'Submit a request',
  intro: '',
  issueType: 'task' as Exclude<IssueType, 'epic' | 'subtask'>,
  defaultPriority: 'medium' as IssuePriority,
  askDescription: true,
  askPriority: false,
})

const TYPE_OPTIONS = [
  { value: 'task', label: 'Task' },
  { value: 'bug', label: 'Bug' },
  { value: 'story', label: 'Story' },
]
const PRIORITY_OPTIONS = [
  { value: 'lowest', label: 'Lowest' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'highest', label: 'Highest' },
]

function syncDetails(next: IntakeFormState) {
  details.title = next.title ?? 'Submit a request'
  details.intro = next.intro ?? ''
  details.issueType = next.issueType ?? 'task'
  details.defaultPriority = next.defaultPriority ?? 'medium'
  details.askDescription = next.settings?.askDescription !== false
  details.askPriority = Boolean(next.settings?.askPriority)
}

async function load() {
  if (locked.value) {
    isLoading.value = false
    return
  }
  isLoading.value = true
  try {
    intake.value = await intakeApi.get(props.projectId)
    syncDetails(intake.value)
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    isLoading.value = false
  }
}

async function save(patch: Parameters<typeof intakeApi.set>[1], message?: string) {
  if (locked.value) return
  isSaving.value = true
  try {
    intake.value = await intakeApi.set(props.projectId, patch)
    syncDetails(intake.value)
    if (patch.reset) toast.success('New request link ready', { description: 'The old link no longer works.' })
    else if (message) toast.success(message)
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    isSaving.value = false
  }
}

async function saveDetails() {
  await save(
    {
      enabled: true,
      title: details.title,
      intro: details.intro || null,
      issueType: details.issueType,
      defaultPriority: details.defaultPriority,
      settings: { askDescription: details.askDescription, askPriority: details.askPriority },
    },
    'Request form updated',
  )
}

async function copyLink() {
  try {
    await navigator.clipboard.writeText(link.value)
    toast.success('Request link copied')
  } catch {
    toast.error('Copy the link from the box instead')
  }
}

async function reset() {
  const ok = await confirm({
    title: 'Make a new request link?',
    description: 'The current link stops working. Send the new one to people who should submit requests.',
    confirmLabel: 'New link',
  })
  if (ok) await save({ enabled: true, reset: true })
}

onMounted(load)
watch(() => props.projectId, load)
</script>

<template>
  <section class="space-y-3 border border-border/70 bg-card p-3">
    <div class="flex items-start gap-3">
      <span class="flex size-8 shrink-0 items-center justify-center bg-primary/10 text-primary"><ClipboardPenLine class="size-4" /></span>
      <div class="min-w-0 flex-1">
        <p class="text-sm font-semibold">Request form</p>
        <p class="text-xs text-muted-foreground">
          <template v-if="locked">
            Request forms are on Pro and above.
            <RouterLink :to="{ name: 'org-plan' }" class="font-medium text-foreground underline-offset-2 hover:underline">See your plan</RouterLink>
          </template>
          <template v-else>Anyone with the link can submit work into this project. No Vector account needed.</template>
        </p>
      </div>
      <Switch
        :model-value="intake.enabled"
        :disabled="isSaving || isLoading || locked"
        aria-label="Enable request form"
        @update:model-value="(value) => save({ enabled: Boolean(value) })"
      />
    </div>

    <template v-if="intake.enabled && !locked">
      <div class="grid gap-3 sm:grid-cols-2">
        <FormField label="Form title" for="intake-title">
          <Input id="intake-title" v-model="details.title" :disabled="isSaving" />
        </FormField>
        <FormField label="Creates as" for="intake-type">
          <SelectField v-model="details.issueType" :options="TYPE_OPTIONS" :disabled="isSaving" aria-label="Issue type" />
        </FormField>
        <FormField label="Default priority" for="intake-priority">
          <SelectField v-model="details.defaultPriority" :options="PRIORITY_OPTIONS" :disabled="isSaving" aria-label="Default priority" />
        </FormField>
        <div class="space-y-2 self-end pb-1">
          <label class="flex items-center justify-between gap-3 text-sm">
            <span>Ask for a description</span>
            <Switch v-model="details.askDescription" :disabled="isSaving" />
          </label>
          <label class="flex items-center justify-between gap-3 text-sm">
            <span>Let them pick priority</span>
            <Switch v-model="details.askPriority" :disabled="isSaving" />
          </label>
        </div>
      </div>
      <FormField label="Intro (optional)" for="intake-intro">
        <Textarea id="intake-intro" v-model="details.intro" rows="2" placeholder="Tell submitters what to include…" :disabled="isSaving" />
      </FormField>
      <Button type="button" size="sm" :loading="isSaving" @click="saveDetails">Save form settings</Button>
      <div class="flex items-center gap-1.5">
        <Input :model-value="link" readonly class="h-8 font-mono text-xs" @focus="($event.target as HTMLInputElement).select()" />
        <Button variant="outline" size="icon-sm" aria-label="Copy request link" @click="copyLink"><Copy /></Button>
        <Button variant="ghost" size="icon-sm" aria-label="Make a new link" title="Make a new link" :disabled="isSaving" @click="reset"><RefreshCw /></Button>
      </div>
    </template>
  </section>
</template>

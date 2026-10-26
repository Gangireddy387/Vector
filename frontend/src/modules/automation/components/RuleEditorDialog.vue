<script setup lang="ts">
import { Plus, Sparkles } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import FormField from '@/components/common/FormField.vue'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { SelectField, type SelectFieldOption } from '@/components/forms'
import { Switch } from '@/components/ui/switch'
import { getErrorMessage } from '@/lib/http'
import type { AutomationAction, AutomationCondition, AutomationRule, AutomationTrigger, ProjectDetail } from '@/types/models'
import { automationApi, type RuleInput } from '../automation.api'
import { describeRule, TRIGGER_OPTIONS } from '../automation.constants'
import RuleActionEditor from './RuleActionEditor.vue'
import RuleConditionEditor from './RuleConditionEditor.vue'

const props = defineProps<{ project: ProjectDetail; rule?: AutomationRule | null; draft?: RuleInput | null }>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ saved: [] }>()

const triggerOptions: SelectFieldOption[] = TRIGGER_OPTIONS.map((option) => ({ value: option.value, label: option.label, description: option.sentence }))

const emptyRule = (): RuleInput => ({ name: '', trigger: 'issue.created', conditions: [], actions: [], enabled: true, description: null })
const form = ref<RuleInput>(emptyRule())
const isSaving = ref(false)
const errorMessage = ref('')

watch(open, (isOpen) => {
  if (!isOpen) return
  errorMessage.value = ''
  const source = props.rule ?? props.draft
  form.value = source ? (JSON.parse(JSON.stringify({ ...emptyRule(), ...source })) as RuleInput) : emptyRule()
})

const preview = computed(() => describeRule(form.value, props.project))

const addCondition = () => form.value.conditions.push({ field: 'type', operator: 'equals', value: null } as AutomationCondition)
const addAction = () => form.value.actions.push({ type: 'assign', params: { strategy: 'least_loaded' } } as AutomationAction)

async function save() {
  if (!form.value.name.trim()) {
    errorMessage.value = 'Give the rule a name'
    return
  }
  if (!form.value.actions.length) {
    errorMessage.value = 'Add at least one action'
    return
  }
  isSaving.value = true
  errorMessage.value = ''
  try {
    const payload: RuleInput = { ...form.value, name: form.value.name.trim() }
    if (props.rule) await automationApi.updateRule(props.project.id, props.rule.id, payload)
    else await automationApi.createRule(props.project.id, payload)
    toast.success(props.rule ? 'Rule updated' : 'Rule created — it is live now')
    emit('saved')
    open.value = false
  } catch (error) {
    errorMessage.value = getErrorMessage(error)
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-3xl">
      <DialogHeader>
        <DialogTitle>{{ rule ? 'Edit rule' : 'New automation rule' }}</DialogTitle>
        <DialogDescription>Rules run instantly in the background whenever their trigger happens.</DialogDescription>
      </DialogHeader>

      <form class="space-y-5" @submit.prevent="save">
        <div class="grid gap-3 sm:grid-cols-[1fr_auto]">
          <FormField label="Rule name" for="rule-name"><Input id="rule-name" v-model="form.name" placeholder="e.g. Triage urgent bugs" /></FormField>
          <div class="flex items-center gap-2 self-end pb-2 text-sm"><Switch v-model="form.enabled" aria-label="Enabled" /> Enabled</div>
        </div>

        <section class="space-y-2">
          <h3 class="text-xs font-semibold tracking-wider text-muted-foreground uppercase">When</h3>
          <SelectField
            :model-value="form.trigger"
            :options="triggerOptions"
            aria-label="Trigger"
            @update:model-value="(value) => value && (form.trigger = value as AutomationTrigger)"
          />
        </section>

        <section class="space-y-2">
          <div class="flex items-center justify-between">
            <h3 class="text-xs font-semibold tracking-wider text-muted-foreground uppercase">If <span class="normal-case">(all must match)</span></h3>
            <Button type="button" variant="ghost" size="xs" @click="addCondition"><Plus /> Condition</Button>
          </div>
          <p v-if="!form.conditions.length" class="text-sm text-muted-foreground">No conditions — the rule runs for every task.</p>
          <RuleConditionEditor
            v-for="(_, index) in form.conditions"
            :key="index"
            v-model="form.conditions[index]"
            :project="project"
            @remove="form.conditions.splice(index, 1)"
          />
        </section>

        <section class="space-y-2">
          <div class="flex items-center justify-between">
            <h3 class="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Then</h3>
            <Button type="button" variant="ghost" size="xs" @click="addAction"><Plus /> Action</Button>
          </div>
          <p v-if="!form.actions.length" class="text-sm text-muted-foreground">Add what should happen.</p>
          <RuleActionEditor
            v-for="(_, index) in form.actions"
            :key="index"
            v-model="form.actions[index]"
            :index="index"
            :project="project"
            @remove="form.actions.splice(index, 1)"
          />
        </section>

        <div class="flex gap-2 bg-primary/5 p-3 text-sm">
          <Sparkles class="mt-0.5 size-4 shrink-0 text-primary" />
          <p>{{ preview }}</p>
        </div>

        <p v-if="errorMessage" class=" bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">{{ errorMessage }}</p>

        <DialogFooter>
          <Button type="button" variant="outline" @click="open = false">Cancel</Button>
          <Button type="submit" :loading="isSaving">{{ rule ? 'Save rule' : 'Create rule' }}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>

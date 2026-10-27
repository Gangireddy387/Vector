<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import FormField from '@/components/common/FormField.vue'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { getErrorMessage, getFieldErrors } from '@/lib/http'
import { PLAN_FEATURE_GROUPS, PLAN_FEATURES, type PlanFeatureGroup, type PlanFeatureKey } from '@/lib/plan-features'
import { type Plan, type PlanInput, superAdminApi } from '../super-admin.api'

const props = defineProps<{ plan: Plan | null }>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ saved: [plan: Plan] }>()

const noFeatures = () => Object.fromEntries(PLAN_FEATURES.map((feature) => [feature.key, false])) as Record<PlanFeatureKey, boolean>

const form = reactive({
  name: '',
  priceLabel: '',
  description: '',
  maxMembers: '',
  maxProjects: '',
  isDefault: false,
  features: noFeatures(),
})
const fieldErrors = ref<Record<string, string>>({})
const isSaving = ref(false)

watch(open, (isOpen) => {
  if (!isOpen) return
  const plan = props.plan
  fieldErrors.value = {}
  Object.assign(form, {
    name: plan?.name ?? '',
    priceLabel: plan?.priceLabel ?? '',
    description: plan?.description ?? '',
    maxMembers: plan?.maxMembers?.toString() ?? '',
    maxProjects: plan?.maxProjects?.toString() ?? '',
    isDefault: plan?.isDefault ?? false,
    features: { ...noFeatures(), ...(plan?.features ?? {}) },
  })
})

const enabledIn = (group: PlanFeatureGroup) => PLAN_FEATURES.filter((feature) => feature.group === group && form.features[feature.key]).length
const toLimit = (value: string | number) => (String(value).trim() === '' ? null : Number(value))

async function save() {
  isSaving.value = true
  fieldErrors.value = {}
  const payload: PlanInput = {
    name: form.name.trim(),
    priceLabel: form.priceLabel.trim() || null,
    description: form.description.trim() || null,
    maxMembers: toLimit(form.maxMembers),
    maxProjects: toLimit(form.maxProjects),
    isDefault: form.isDefault,
    features: { ...form.features },
  }
  try {
    const saved = props.plan ? await superAdminApi.updatePlan(props.plan.id, payload) : await superAdminApi.createPlan(payload)
    toast.success(props.plan ? `${saved.name} updated` : `${saved.name} created`)
    emit('saved', saved)
    open.value = false
  } catch (error) {
    fieldErrors.value = getFieldErrors(error)
    if (!Object.keys(fieldErrors.value).length) toast.error(getErrorMessage(error))
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>{{ plan ? `Edit ${plan.name}` : 'New plan' }}</DialogTitle>
        <DialogDescription>Choose what organizations on this plan can use. Changes apply to them right away.</DialogDescription>
      </DialogHeader>

      <form id="plan-editor" class="space-y-5" novalidate @submit.prevent="save">
        <div class="grid gap-4 sm:grid-cols-2">
          <FormField label="Plan name" for="plan-name" :error="fieldErrors.name">
            <Input id="plan-name" v-model="form.name" placeholder="e.g. Pro" maxlength="60" required />
          </FormField>
          <FormField label="Price label" for="plan-price" hint="Display only, e.g. “₹999 / month”." :error="fieldErrors.priceLabel">
            <Input id="plan-price" v-model="form.priceLabel" placeholder="Free" maxlength="60" />
          </FormField>
        </div>
        <FormField label="Description" for="plan-description" :error="fieldErrors.description">
          <Textarea id="plan-description" v-model="form.description" rows="2" maxlength="300" placeholder="Who this plan is for" />
        </FormField>

        <div class="grid gap-4 sm:grid-cols-2">
          <FormField label="People" for="plan-members" hint="Leave empty for unlimited." :error="fieldErrors.maxMembers">
            <Input id="plan-members" v-model="form.maxMembers" type="number" min="1" inputmode="numeric" placeholder="Unlimited" />
          </FormField>
          <FormField label="Projects" for="plan-projects" hint="Leave empty for unlimited." :error="fieldErrors.maxProjects">
            <Input id="plan-projects" v-model="form.maxProjects" type="number" min="1" inputmode="numeric" placeholder="Unlimited" />
          </FormField>
        </div>

        <section v-for="group in PLAN_FEATURE_GROUPS" :key="group.value" class="space-y-2">
          <div class="flex items-end justify-between gap-3">
            <div>
              <h3 class="text-sm font-medium">{{ group.label }}</h3>
              <p class="text-xs text-muted-foreground">{{ group.hint }}</p>
            </div>
            <span class="shrink-0 text-xs text-muted-foreground">
              {{ enabledIn(group.value) }} of {{ PLAN_FEATURES.filter((feature) => feature.group === group.value).length }} included
            </span>
          </div>
          <ul class="grid gap-2 sm:grid-cols-2">
            <li v-for="feature in PLAN_FEATURES.filter((item) => item.group === group.value)" :key="feature.key">
              <label
                class="flex cursor-pointer items-start gap-3 border p-3 transition-colors"
                :class="form.features[feature.key] ? 'border-primary/40 bg-primary/5' : 'border-border/70 hover:bg-accent/30'"
              >
                <span class="flex size-8 shrink-0 items-center justify-center bg-primary/10 text-primary"><component :is="feature.icon" class="size-4" /></span>
                <span class="min-w-0 flex-1">
                  <span class="block text-sm font-medium">{{ feature.label }}</span>
                  <span class="block text-xs text-muted-foreground">{{ feature.description }}</span>
                </span>
                <Switch v-model="form.features[feature.key]" :aria-label="feature.label" />
              </label>
            </li>
          </ul>
        </section>

        <label class="flex cursor-pointer items-start gap-3 border border-border/70 p-3">
          <Switch v-model="form.isDefault" :disabled="plan?.isDefault" aria-label="Default plan for new organizations" />
          <span>
            <span class="block text-sm font-medium">Default for new organizations</span>
            <span class="block text-xs text-muted-foreground">
              {{ plan?.isDefault ? 'This is the default plan. Make another plan the default to change it.' : 'Every new signup starts on this plan.' }}
            </span>
          </span>
        </label>
      </form>

      <DialogFooter>
        <Button variant="ghost" @click="open = false">Cancel</Button>
        <Button type="submit" form="plan-editor" :loading="isSaving" :disabled="form.name.trim().length < 2">{{ plan ? 'Save plan' : 'Create plan' }}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

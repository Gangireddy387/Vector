<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { toast } from 'vue-sonner'
import FormField from '@/components/common/FormField.vue'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { getErrorMessage, http } from '@/lib/http'

export type PricingCurrency = 'INR' | 'USD'

export interface PricingSettings {
  currency: PricingCurrency
  proAmountInr: number
  proAmountUsd: number
  enterpriseAmountInr: number
  enterpriseAmountUsd: number
}

const emit = defineEmits<{ saved: [pricing: PricingSettings] }>()

const form = reactive({
  currency: 'INR' as PricingCurrency,
  proAmountInr: 999,
  proAmountUsd: 12,
  enterpriseAmountInr: 2499,
  enterpriseAmountUsd: 29,
})
const isLoading = ref(true)
const isSaving = ref(false)

const proPreview = computed(() =>
  form.currency === 'USD' ? `$${form.proAmountUsd} / month` : `₹${form.proAmountInr} / month`,
)
const enterprisePreview = computed(() =>
  form.currency === 'USD' ? `$${form.enterpriseAmountUsd} / month` : `₹${form.enterpriseAmountInr} / month`,
)

async function load() {
  isLoading.value = true
  try {
    const { data } = await http.get<{ pricing: PricingSettings }>('/super-admin/pricing')
    Object.assign(form, data.pricing)
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    isLoading.value = false
  }
}

onMounted(load)

async function save() {
  isSaving.value = true
  try {
    const { data } = await http.put<{ pricing: PricingSettings }>('/super-admin/pricing', {
      currency: form.currency,
      proAmountInr: Number(form.proAmountInr),
      proAmountUsd: Number(form.proAmountUsd),
      enterpriseAmountInr: Number(form.enterpriseAmountInr),
      enterpriseAmountUsd: Number(form.enterpriseAmountUsd),
    })
    Object.assign(form, data.pricing)
    emit('saved', data.pricing)
    toast.success('Pricing updated', {
      description: `Pro ${proPreview.value} · Enterprise ${enterprisePreview.value}`,
    })
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle>List price currency</CardTitle>
      <CardDescription>
        Choose rupees or dollars, then set Pro and Enterprise monthly list prices. These update the public Pricing page and plan labels.
      </CardDescription>
    </CardHeader>
    <CardContent>
      <form class="space-y-4" @submit.prevent="save">
        <fieldset class="space-y-2" :disabled="isLoading">
          <legend class="text-sm font-medium">Currency</legend>
          <div class="flex flex-wrap gap-2">
            <button
              type="button"
              class="inline-flex h-9 items-center rounded-lg border px-3 text-sm font-medium transition-colors"
              :class="
                form.currency === 'INR'
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:bg-muted/60 hover:text-foreground'
              "
              :aria-pressed="form.currency === 'INR'"
              @click="form.currency = 'INR'"
            >
              ₹ Rupees (INR)
            </button>
            <button
              type="button"
              class="inline-flex h-9 items-center rounded-lg border px-3 text-sm font-medium transition-colors"
              :class="
                form.currency === 'USD'
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:bg-muted/60 hover:text-foreground'
              "
              :aria-pressed="form.currency === 'USD'"
              @click="form.currency = 'USD'"
            >
              $ Dollars (USD)
            </button>
          </div>
        </fieldset>

        <div class="grid gap-3 sm:grid-cols-2">
          <FormField label="Pro monthly (INR)" for="pro-inr">
            <Input
              id="pro-inr"
              v-model.number="form.proAmountInr"
              type="number"
              min="0"
              max="1000000"
              step="1"
              :disabled="isLoading"
            />
          </FormField>
          <FormField label="Pro monthly (USD)" for="pro-usd">
            <Input
              id="pro-usd"
              v-model.number="form.proAmountUsd"
              type="number"
              min="0"
              max="1000000"
              step="1"
              :disabled="isLoading"
            />
          </FormField>
          <FormField label="Enterprise monthly (INR)" for="enterprise-inr">
            <Input
              id="enterprise-inr"
              v-model.number="form.enterpriseAmountInr"
              type="number"
              min="0"
              max="1000000"
              step="1"
              :disabled="isLoading"
            />
          </FormField>
          <FormField label="Enterprise monthly (USD)" for="enterprise-usd">
            <Input
              id="enterprise-usd"
              v-model.number="form.enterpriseAmountUsd"
              type="number"
              min="0"
              max="1000000"
              step="1"
              :disabled="isLoading"
            />
          </FormField>
        </div>

        <p class="text-xs text-muted-foreground">
          Preview:
          <span class="font-medium text-foreground">Pro {{ proPreview }}</span>
          ·
          <span class="font-medium text-foreground">Enterprise {{ enterprisePreview }}</span>
        </p>

        <Button type="submit" variant="brand" class="max-sm:w-full" :loading="isSaving" :disabled="isLoading">
          Save pricing
        </Button>
      </form>
    </CardContent>
  </Card>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { toast } from 'vue-sonner'
import FormField from '@/components/common/FormField.vue'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import type { LegalContact } from '@/composables/useLegalContact'
import { getErrorMessage, http } from '@/lib/http'

/** Super admin sets the contact block shown on Privacy Policy and Terms. */
const form = reactive({
  companyName: '',
  contactEmail: '',
  contactPhone: '',
  postalAddress: '',
  jurisdiction: '',
  effectiveDate: '',
})
const isLoading = ref(true)
const isSaving = ref(false)

async function load() {
  isLoading.value = true
  try {
    const { data } = await http.get<{ legal: LegalContact }>('/super-admin/legal')
    Object.assign(form, {
      companyName: data.legal.companyName,
      contactEmail: data.legal.contactEmail,
      contactPhone: data.legal.contactPhone ?? '',
      postalAddress: data.legal.postalAddress ?? '',
      jurisdiction: data.legal.jurisdiction,
      effectiveDate: data.legal.effectiveDate,
    })
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
    const { data } = await http.put<{ legal: LegalContact }>('/super-admin/legal', {
      companyName: form.companyName.trim(),
      contactEmail: form.contactEmail.trim(),
      contactPhone: form.contactPhone.trim(),
      postalAddress: form.postalAddress.trim(),
      jurisdiction: form.jurisdiction.trim(),
      effectiveDate: form.effectiveDate.trim(),
    })
    Object.assign(form, data.legal)
    toast.success('Legal contact updated', { description: 'Privacy Policy and Terms show these details now.' })
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
      <CardTitle>Privacy &amp; Terms contact</CardTitle>
      <CardDescription>
        Shown on the public Privacy Policy and Terms pages — email, phone and address for privacy requests.
      </CardDescription>
    </CardHeader>
    <CardContent>
      <form class="space-y-4" @submit.prevent="save">
        <div class="grid gap-3 sm:grid-cols-2">
          <FormField label="Company name" for="legal-company">
            <Input id="legal-company" v-model="form.companyName" maxlength="120" required :disabled="isLoading" />
          </FormField>
          <FormField label="Effective date" for="legal-effective">
            <Input id="legal-effective" v-model="form.effectiveDate" maxlength="60" required :disabled="isLoading" placeholder="e.g. 24 October 2026" />
          </FormField>
          <FormField label="Contact email" for="legal-email">
            <Input id="legal-email" v-model="form.contactEmail" type="email" maxlength="120" required :disabled="isLoading" />
          </FormField>
          <FormField label="Contact phone (optional)" for="legal-phone">
            <Input id="legal-phone" v-model="form.contactPhone" maxlength="40" :disabled="isLoading" placeholder="+1 555 0100" />
          </FormField>
        </div>
        <FormField label="Postal address (optional)" for="legal-address">
          <Textarea id="legal-address" v-model="form.postalAddress" rows="2" maxlength="300" :disabled="isLoading" placeholder="Street, city, country" />
        </FormField>
        <FormField label="Jurisdiction" for="legal-jurisdiction">
          <Input id="legal-jurisdiction" v-model="form.jurisdiction" maxlength="200" required :disabled="isLoading" />
        </FormField>
        <Button type="submit" variant="brand" class="max-sm:w-full" :loading="isSaving" :disabled="isLoading">Save contact details</Button>
      </form>
    </CardContent>
  </Card>
</template>

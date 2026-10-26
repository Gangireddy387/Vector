<script setup lang="ts">
import { Building2, Crown } from 'lucide-vue-next'
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import EmptyState from '@/components/common/EmptyState.vue'
import FormField from '@/components/common/FormField.vue'
import { SelectField, type SelectFieldOption } from '@/components/forms'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { useDevice } from '@/composables/useDevice'
import { getErrorMessage, getFieldErrors } from '@/lib/http'
import StructureBreadcrumb from '../components/StructureBreadcrumb.vue'
import { structureApi } from '../departments.api'
import { useStructureStore } from '../departments.store'

/** Creates a department, or edits one when `departmentId` is given. */
const props = defineProps<{ departmentId?: string }>()
const structure = useStructureStore()
const router = useRouter()
const { isDesktop } = useDevice()

const form = reactive({ name: '', description: '', headId: null as string | null })
const fieldErrors = ref<Record<string, string>>({})
const isSaving = ref(false)

onMounted(() => structure.load().catch((error) => toast.error(getErrorMessage(error))))

const isEdit = computed(() => Boolean(props.departmentId))
const department = computed(() => (props.departmentId ? structure.department(props.departmentId) : null))

watch(
  department,
  (current) => {
    if (!current) return
    Object.assign(form, { name: current.name, description: current.description ?? '', headId: current.headId })
  },
  { immediate: true },
)

const headOptions = computed<SelectFieldOption[]>(() => [
  { value: null, label: 'No head yet', user: null },
  ...structure.people.map((person) => ({ value: person.id, label: person.name, description: person.email, user: person })),
])

const back = computed(() => (department.value ? { name: 'department', params: { departmentId: department.value.id } } : { name: 'departments' }))

async function save() {
  isSaving.value = true
  fieldErrors.value = {}
  const payload = { name: form.name.trim(), description: form.description.trim() || null, headId: form.headId }
  try {
    const next = department.value ? await structureApi.updateDepartment(department.value.id, payload) : await structureApi.createDepartment(payload)
    structure.set(next)
    const saved = department.value ?? next.find((item) => item.name.toLowerCase() === payload.name.toLowerCase())
    toast.success(department.value ? `${payload.name} updated` : `${payload.name} created`)
    await router.replace(saved ? { name: 'department', params: { departmentId: saved.id } } : { name: 'departments' })
  } catch (error) {
    fieldErrors.value = getFieldErrors(error)
    if (!Object.keys(fieldErrors.value).length) toast.error(getErrorMessage(error))
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <div class="w-full space-y-5" :class="isDesktop ? 'p-5' : 'p-3'">
    <div class="space-y-1.5">
      <StructureBreadcrumb
        :items="[
          { label: 'Departments', to: { name: 'departments' } },
          ...(department ? [{ label: department.name, to: back }] : []),
          { label: isEdit ? 'Edit' : 'New department' },
        ]"
      />
      <h1 class="text-2xl font-bold tracking-tight">{{ isEdit ? `Edit ${department?.name ?? 'department'}` : 'New department' }}</h1>
      <p class="text-sm text-muted-foreground">A department groups teams, like Engineering or Sales. Its head oversees every team in it.</p>
    </div>

    <Skeleton v-if="isEdit && structure.departments === null" class="h-80 w-full" />

    <EmptyState v-else-if="isEdit && !department" :icon="Building2" title="Department not found" class="border border-dashed py-16">
      <Button variant="outline" as-child><RouterLink :to="{ name: 'departments' }">All departments</RouterLink></Button>
    </EmptyState>

    <form v-else class="space-y-5" novalidate @submit.prevent="save">
      <div class="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_24rem]">
      <section class="space-y-4 border border-border/80 bg-card p-5 shadow-soft sm:p-6">
        <h2 class="flex items-center gap-2 text-sm font-semibold"><Building2 class="size-4 text-primary" /> Details</h2>
        <FormField label="Department name" for="department-name" :error="fieldErrors.name">
          <Input id="department-name" v-model="form.name" placeholder="e.g. Engineering" maxlength="80" autofocus />
        </FormField>
        <FormField label="Description" for="department-description" :error="fieldErrors.description">
          <Textarea id="department-description" v-model="form.description" rows="3" maxlength="300" placeholder="What this department is responsible for" />
        </FormField>
      </section>

      <section class="space-y-4 border border-border/80 bg-card p-5 shadow-soft sm:p-6">
        <h2 class="flex items-center gap-2 text-sm font-semibold"><Crown class="size-4 text-amber-500" /> Department head</h2>
        <FormField label="Head" for="department-head" hint="Anyone in the organization. You can change it later." :error="fieldErrors.headId">
          <SelectField id="department-head" v-model="form.headId" :options="headOptions" searchable search-placeholder="Search people…" aria-label="Department head" />
        </FormField>
      </section>
      </div>

      <div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="ghost" as-child><RouterLink :to="back">Cancel</RouterLink></Button>
        <Button type="submit" variant="brand" :loading="isSaving" :disabled="form.name.trim().length < 2">{{ isEdit ? 'Save department' : 'Create department' }}</Button>
      </div>
    </form>
  </div>
</template>

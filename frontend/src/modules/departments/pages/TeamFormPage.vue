<script setup lang="ts">
import { Crown, Search, Users, UsersRound } from 'lucide-vue-next'
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import EmptyState from '@/components/common/EmptyState.vue'
import FormField from '@/components/common/FormField.vue'
import UserAvatar from '@/components/common/UserAvatar.vue'
import { SelectField, type SelectFieldOption } from '@/components/forms'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { useDevice } from '@/composables/useDevice'
import { getErrorMessage, getFieldErrors } from '@/lib/http'
import StructureBreadcrumb from '../components/StructureBreadcrumb.vue'
import { structureApi } from '../departments.api'
import { useStructureStore } from '../departments.store'

/** Creates a team in `departmentId`, or edits the team `teamId` (and can move it to another department). */
const props = defineProps<{ departmentId?: string; teamId?: string }>()
const structure = useStructureStore()
const router = useRouter()
const { isDesktop } = useDevice()

const form = reactive({ name: '', description: '', departmentId: '', leadId: null as string | null, memberIds: [] as string[] })
const search = ref('')
const fieldErrors = ref<Record<string, string>>({})
const isSaving = ref(false)

onMounted(() => structure.load().catch((error) => toast.error(getErrorMessage(error))))

const isEdit = computed(() => Boolean(props.teamId))
const team = computed(() => (props.teamId ? structure.team(props.teamId) : null))
const department = computed(() => structure.department(team.value?.departmentId ?? props.departmentId ?? ''))

watch(
  [team, department],
  ([currentTeam, currentDepartment]) => {
    if (currentTeam) {
      Object.assign(form, {
        name: currentTeam.name,
        description: currentTeam.description ?? '',
        departmentId: currentTeam.departmentId,
        leadId: currentTeam.leadId,
        memberIds: currentTeam.members.map((member) => member.id),
      })
    } else if (currentDepartment && !form.departmentId) form.departmentId = currentDepartment.id
  },
  { immediate: true },
)

// The lead is always part of the team.
watch(
  () => form.leadId,
  (leadId) => {
    if (leadId && !form.memberIds.includes(leadId)) form.memberIds = [...form.memberIds, leadId]
  },
)

const departmentOptions = computed<SelectFieldOption[]>(() => (structure.departments ?? []).map((item) => ({ value: item.id, label: item.name })))
const leadOptions = computed<SelectFieldOption[]>(() => [
  { value: null, label: 'No lead yet', user: null },
  ...structure.people.map((person) => ({ value: person.id, label: person.name, description: person.email, user: person })),
])
const visiblePeople = computed(() => {
  const term = search.value.trim().toLowerCase()
  return structure.people.filter((person) => !term || person.name.toLowerCase().includes(term) || person.email.toLowerCase().includes(term))
})

function toggleMember(userId: string, checked: boolean) {
  if (userId === form.leadId) return
  form.memberIds = checked ? [...new Set([...form.memberIds, userId])] : form.memberIds.filter((id) => id !== userId)
}

const back = computed(() =>
  team.value ? { name: 'team', params: { teamId: team.value.id } } : department.value ? { name: 'department', params: { departmentId: department.value.id } } : { name: 'departments' },
)

async function save() {
  isSaving.value = true
  fieldErrors.value = {}
  const payload = { name: form.name.trim(), description: form.description.trim() || null, leadId: form.leadId, memberIds: form.memberIds }
  try {
    const next = team.value
      ? await structureApi.updateTeam(team.value.id, { ...payload, ...(form.departmentId !== team.value.departmentId ? { departmentId: form.departmentId } : {}) })
      : await structureApi.createTeam(form.departmentId, payload)
    structure.set(next)
    const saved =
      team.value ?? next.find((item) => item.id === form.departmentId)?.teams.find((item) => item.name.toLowerCase() === payload.name.toLowerCase())
    toast.success(team.value ? `${payload.name} updated` : `${payload.name} created`)
    await router.replace(saved ? { name: 'team', params: { teamId: saved.id } } : back.value)
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
          ...(department ? [{ label: department.name, to: { name: 'department', params: { departmentId: department.id } } }] : []),
          ...(team ? [{ label: team.name, to: { name: 'team', params: { teamId: team.id } } }] : []),
          { label: isEdit ? 'Edit' : 'New team' },
        ]"
      />
      <h1 class="text-2xl font-bold tracking-tight">{{ isEdit ? `Edit ${team?.name ?? 'team'}` : `New team${department ? ` in ${department.name}` : ''}` }}</h1>
      <p class="text-sm text-muted-foreground">Choose a team lead and the people who work in this team.</p>
    </div>

    <Skeleton v-if="structure.departments === null" class="h-96 w-full" />

    <EmptyState v-else-if="isEdit ? !team : !department" :icon="UsersRound" :title="isEdit ? 'Team not found' : 'Department not found'" class="border border-dashed py-16">
      <Button variant="outline" as-child><RouterLink :to="{ name: 'departments' }">All departments</RouterLink></Button>
    </EmptyState>

    <form v-else class="space-y-5" novalidate @submit.prevent="save">
      <div class="grid items-start gap-5 lg:grid-cols-2">
      <div class="space-y-5">
      <section class="space-y-4 border border-border/80 bg-card p-5 shadow-soft sm:p-6">
        <h2 class="flex items-center gap-2 text-sm font-semibold"><UsersRound class="size-4 text-primary" /> Details</h2>
        <FormField label="Team name" for="team-name" :error="fieldErrors.name">
          <Input id="team-name" v-model="form.name" placeholder="e.g. Frontend" maxlength="80" autofocus />
        </FormField>
        <FormField label="Description" for="team-description" :error="fieldErrors.description">
          <Textarea id="team-description" v-model="form.description" rows="3" maxlength="300" placeholder="What this team works on" />
        </FormField>
        <FormField v-if="isEdit" label="Department" for="team-department" :error="fieldErrors.departmentId">
          <SelectField id="team-department" v-model="form.departmentId" :options="departmentOptions" aria-label="Department" />
        </FormField>
      </section>

      <section class="space-y-4 border border-border/80 bg-card p-5 shadow-soft sm:p-6">
        <h2 class="flex items-center gap-2 text-sm font-semibold"><Crown class="size-4 text-amber-500" /> Team lead</h2>
        <FormField label="Lead" for="team-lead" hint="The lead is added to the team automatically." :error="fieldErrors.leadId">
          <SelectField id="team-lead" v-model="form.leadId" :options="leadOptions" searchable search-placeholder="Search people…" aria-label="Team lead" />
        </FormField>
      </section>
      </div>

      <section class="border border-border/80 bg-card shadow-soft">
        <div class="flex items-center justify-between gap-2 p-5 pb-3 sm:px-6">
          <h2 class="flex items-center gap-2 text-sm font-semibold"><Users class="size-4 text-primary" /> Members</h2>
          <span class="text-xs text-muted-foreground tabular-nums">{{ form.memberIds.length }} selected</span>
        </div>
        <p v-if="fieldErrors.memberIds" class="px-5 pb-2 text-xs text-destructive sm:px-6">{{ fieldErrors.memberIds }}</p>
        <div class="relative border-y border-border/60">
          <Search class="pointer-events-none absolute top-1/2 left-5 size-4 -translate-y-1/2 text-muted-foreground sm:left-6" />
          <input
            v-model="search"
            class="h-10 w-full bg-transparent pr-4 pl-11 text-sm outline-none placeholder:text-muted-foreground sm:pl-12"
            placeholder="Search people…"
            aria-label="Search people"
            autocomplete="off"
          />
        </div>
        <ul class="max-h-80 overflow-y-auto">
          <li v-for="person in visiblePeople" :key="person.id">
            <label class="flex cursor-pointer items-center gap-3 px-5 py-2.5 hover:bg-accent/40 sm:px-6">
              <Checkbox
                :model-value="form.memberIds.includes(person.id)"
                :disabled="person.id === form.leadId"
                :aria-label="`Add ${person.name} to the team`"
                @update:model-value="(value) => toggleMember(person.id, value === true)"
              />
              <UserAvatar :user="person" size="sm" />
              <span class="min-w-0 flex-1">
                <span class="block truncate text-sm font-medium">{{ person.name }}</span>
                <span class="block truncate text-xs text-muted-foreground">{{ person.email }}</span>
              </span>
              <Badge v-if="person.id === form.leadId" variant="soft"><Crown /> Lead</Badge>
            </label>
          </li>
          <li v-if="!visiblePeople.length" class="px-6 py-8 text-center text-sm text-muted-foreground">No one matches “{{ search }}”</li>
        </ul>
      </section>
      </div>

      <div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="ghost" as-child><RouterLink :to="back">Cancel</RouterLink></Button>
        <Button type="submit" variant="brand" :loading="isSaving" :disabled="form.name.trim().length < 2 || !form.departmentId">{{ isEdit ? 'Save team' : 'Create team' }}</Button>
      </div>
    </form>
  </div>
</template>

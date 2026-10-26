<script setup lang="ts">
import { Crown, Search, Star, UserMinus, UserPlus, X } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { toast } from 'vue-sonner'
import EmptyState from '@/components/common/EmptyState.vue'
import UserAvatar from '@/components/common/UserAvatar.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { getErrorMessage } from '@/lib/http'
import type { Team, UserSummary } from '@/types/models'
import { structureApi } from '../departments.api'
import { useStructureStore } from '../departments.store'

/** The Members tab of a team: who is in it, who leads it, and adding or removing people. */
const props = defineProps<{ team: Team }>()
const structure = useStructureStore()

const busy = ref(false)
const isAdding = ref(false)
const search = ref('')
const selected = ref<string[]>([])

const memberIds = computed(() => props.team.members.map((member) => member.id))
const candidates = computed(() => {
  const term = search.value.trim().toLowerCase()
  return structure.people.filter(
    (person) => !memberIds.value.includes(person.id) && (!term || person.name.toLowerCase().includes(term) || person.email.toLowerCase().includes(term)),
  )
})

async function save(nextIds: string[], changes: { leadId?: string | null } = {}, message?: string) {
  busy.value = true
  try {
    structure.set(await structureApi.updateTeam(props.team.id, { memberIds: nextIds, ...changes }))
    if (message) toast.success(message)
    return true
  } catch (error) {
    toast.error(getErrorMessage(error))
    return false
  } finally {
    busy.value = false
  }
}

const makeLead = (member: UserSummary) => save(memberIds.value, { leadId: member.id }, `${member.name} is now the team lead`)
const removeMember = (member: UserSummary) => save(memberIds.value.filter((id) => id !== member.id), {}, `${member.name} removed from ${props.team.name}`)

function openAdd() {
  search.value = ''
  selected.value = []
  isAdding.value = true
}
const toggle = (id: string, checked: boolean) => (selected.value = checked ? [...selected.value, id] : selected.value.filter((item) => item !== id))

async function addSelected() {
  const count = selected.value.length
  if (await save([...memberIds.value, ...selected.value], {}, `${count} ${count === 1 ? 'person' : 'people'} added to ${props.team.name}`)) isAdding.value = false
}

defineExpose({ openAdd })
</script>

<template>
  <section class="space-y-3">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <p class="text-sm text-muted-foreground">
        {{ team.members.length }} {{ team.members.length === 1 ? 'person' : 'people' }} in {{ team.name }}
      </p>
      <Button variant="brand" size="sm" @click="isAdding ? (isAdding = false) : openAdd()">
        <component :is="isAdding ? X : UserPlus" /> {{ isAdding ? 'Close' : 'Add people' }}
      </Button>
    </div>

    <div v-if="isAdding" class="border border-primary/30 bg-card shadow-soft">
      <div class="relative border-b border-border/60">
        <Search class="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          v-model="search"
          class="h-11 w-full bg-transparent pr-4 pl-10 text-sm outline-none placeholder:text-muted-foreground"
          placeholder="Search people in the organization…"
          aria-label="Search people to add"
          autofocus
        />
      </div>
      <ul class="grid max-h-72 overflow-y-auto sm:grid-cols-2">
        <li v-for="person in candidates" :key="person.id">
          <label class="flex cursor-pointer items-center gap-3 px-4 py-2.5 hover:bg-accent/40">
            <Checkbox :model-value="selected.includes(person.id)" :aria-label="`Select ${person.name}`" @update:model-value="(value) => toggle(person.id, value === true)" />
            <UserAvatar :user="person" size="sm" />
            <span class="min-w-0 flex-1">
              <span class="block truncate text-sm font-medium">{{ person.name }}</span>
              <span class="block truncate text-xs text-muted-foreground">{{ person.email }}</span>
            </span>
          </label>
        </li>
        <li v-if="!candidates.length" class="px-4 py-8 text-center text-sm text-muted-foreground sm:col-span-2">
          {{ search ? `No one matches “${search}”` : 'Everyone in the organization is already in this team.' }}
        </li>
      </ul>
      <div class="flex items-center justify-between gap-2 border-t border-border/60 px-4 py-3">
        <span class="text-xs text-muted-foreground">{{ selected.length }} selected</span>
        <div class="flex gap-2">
          <Button variant="ghost" size="sm" @click="isAdding = false">Cancel</Button>
          <Button size="sm" :loading="busy" :disabled="!selected.length" @click="addSelected">Add {{ selected.length || '' }} to team</Button>
        </div>
      </div>
    </div>

    <EmptyState
      v-if="!team.members.length && !isAdding"
      :icon="UserPlus"
      title="No one in this team yet"
      description="Add the people who work in this team, then pick one of them as the team lead."
      class="border border-dashed bg-card/60 py-14"
    >
      <Button variant="brand" @click="openAdd"><UserPlus /> Add people</Button>
    </EmptyState>

    <div v-else-if="team.members.length" class="overflow-hidden border border-border/80 bg-card shadow-soft">
      <div class="grid grid-cols-[minmax(0,1fr)_8rem_auto] items-center gap-3 border-b border-border/60 bg-muted/30 px-4 py-2 text-xs font-medium text-muted-foreground">
        <span>Person</span>
        <span>Role</span>
        <span class="sr-only">Actions</span>
      </div>
      <ul class="divide-y divide-border/60">
        <li v-for="member in team.members" :key="member.id" class="grid grid-cols-[minmax(0,1fr)_8rem_auto] items-center gap-3 px-4 py-3">
          <div class="flex min-w-0 items-center gap-3">
            <UserAvatar :user="member" size="md" />
            <div class="min-w-0">
              <p class="truncate text-sm font-medium">{{ member.name }}</p>
              <p class="truncate text-xs text-muted-foreground">{{ member.title || member.email }}</p>
            </div>
          </div>
          <div>
            <Badge v-if="member.id === team.leadId" variant="soft"><Crown /> Team lead</Badge>
            <span v-else class="text-sm text-muted-foreground">Member</span>
          </div>
          <div class="flex items-center justify-end gap-1">
            <template v-if="member.id !== team.leadId">
              <Button variant="ghost" size="sm" :disabled="busy" @click="makeLead(member)"><Star /> Make lead</Button>
              <Button
                variant="ghost"
                size="icon-sm"
                class="text-muted-foreground hover:text-destructive"
                :disabled="busy"
                :title="`Remove ${member.name}`"
                :aria-label="`Remove ${member.name}`"
                @click="removeMember(member)"
              >
                <UserMinus />
              </Button>
            </template>
            <span v-else class="text-xs text-muted-foreground">Make someone else lead to remove</span>
          </div>
        </li>
      </ul>
    </div>
  </section>
</template>

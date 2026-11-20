<script setup lang="ts">
import { Shield } from 'lucide-vue-next'
import { reactive, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { getErrorMessage } from '@/lib/http'
import {
  ISSUE_FIELD_ACL_KEYS,
  ISSUE_FIELD_ACL_LABELS,
  fieldPermissionsOf,
} from '@/lib/issue-field-acl'
import { TRANSITION_ACTOR_META, type TransitionActor } from '@/lib/workflow-transitions'
import type { IssueFieldAclKey, ProjectDetail } from '@/types/models'
import { useProjectsStore } from '../../projects.store'

const props = defineProps<{ project: ProjectDetail }>()
const projects = useProjectsStore()
const isSaving = ref(false)

const ACTOR_GROUPS: Array<{ key: string; label: string; actors: TransitionActor[] }> = [
  { key: 'admin', label: 'Admins', actors: ['admin'] },
  { key: 'leads', label: 'Leads', actors: ['scrum_master', 'team_lead'] },
  { key: 'members', label: 'Everyone else', actors: ['member', 'viewer'] },
]

type Draft = Record<IssueFieldAclKey, TransitionActor[]>
const drafts = reactive<Draft>({} as Draft)

function syncDrafts() {
  const current = fieldPermissionsOf(props.project.settings)
  for (const key of ISSUE_FIELD_ACL_KEYS) {
    drafts[key] = [...(current[key] ?? [])]
  }
}

watch(
  () => props.project.settings?.fieldPermissions,
  () => syncDrafts(),
  { immediate: true, deep: true },
)

function groupChecked(field: IssueFieldAclKey, actors: TransitionActor[]) {
  return actors.every((actor) => drafts[field]?.includes(actor))
}

function toggleGroup(field: IssueFieldAclKey, actors: TransitionActor[], on: boolean) {
  const set = new Set(drafts[field] ?? [])
  for (const actor of actors) {
    if (on) set.add(actor)
    else set.delete(actor)
  }
  drafts[field] = [...set]
}

async function save() {
  isSaving.value = true
  try {
    const fieldPermissions: Partial<Record<IssueFieldAclKey, TransitionActor[]>> = {}
    for (const key of ISSUE_FIELD_ACL_KEYS) {
      if (drafts[key]?.length) fieldPermissions[key] = [...drafts[key]]
    }
    await projects.updateProject(props.project.id, {
      settings: { ...props.project.settings, fieldPermissions },
    })
    toast.success('Field permissions saved')
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
      <CardTitle class="flex items-center gap-2 text-base">
        <Shield class="size-4" /> Field permissions
      </CardTitle>
      <CardDescription>
        Limit who can change specific task fields. Leave a row unchecked for everyone who can edit.
        Status changes stay under Workflow transitions.
      </CardDescription>
    </CardHeader>
    <CardContent class="space-y-4">
      <div class="overflow-x-auto rounded-lg border">
        <table class="w-full min-w-[36rem] text-left text-sm">
          <thead class="border-b bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th class="px-3 py-2 font-medium">Field</th>
              <th v-for="group in ACTOR_GROUPS" :key="group.key" class="px-3 py-2 font-medium">
                {{ group.label }}
                <span class="mt-0.5 block font-normal opacity-80">
                  {{ group.actors.map((actor) => TRANSITION_ACTOR_META[actor].hint).join(' · ') }}
                </span>
              </th>
            </tr>
          </thead>
          <tbody class="divide-y">
            <tr v-for="field in ISSUE_FIELD_ACL_KEYS" :key="field">
              <td class="px-3 py-2.5 font-medium">{{ ISSUE_FIELD_ACL_LABELS[field] }}</td>
              <td v-for="group in ACTOR_GROUPS" :key="`${field}-${group.key}`" class="px-3 py-2.5">
                <Checkbox
                  :model-value="groupChecked(field, group.actors)"
                  :aria-label="`${ISSUE_FIELD_ACL_LABELS[field]} — ${group.label}`"
                  @update:model-value="(value) => toggleGroup(field, group.actors, value === true)"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="text-xs text-muted-foreground">
        Checking a box means that actor may edit the field. If any boxes are checked on a row, only those actors may
        change it. Uncheck all to restore the default (any editor).
      </p>
      <Button :loading="isSaving" @click="save">Save field permissions</Button>
    </CardContent>
  </Card>
</template>

<script setup lang="ts">
import { ArrowRight, MessageSquareText, UserRound, Shield } from 'lucide-vue-next'
import { computed } from 'vue'
import { STATUS_CATEGORY_META } from '@/constants/issue'
import { TRANSITION_ACTOR_META, type TransitionActor } from '@/lib/workflow-transitions'
import type { Status, WorkflowTransitionRule } from '@/types/models'
import { cn } from '@/lib/utils'

type DraftOverlay = {
  enabled: boolean
  toStatusIds: string[]
  requireAssignee?: boolean
  requireComment?: boolean
  allowedRoles?: TransitionActor[]
}

const props = defineProps<{
  statuses: Status[]
  transitions: WorkflowTransitionRule[]
  /** Live draft overlay while editing (enabled rules only). */
  drafts?: Record<string, DraftOverlay>
}>()

type ResolvedRule = {
  fromId: string
  toStatusIds: string[]
  requireAssignee: boolean
  requireComment: boolean
  allowedRoles: TransitionActor[]
}

const resolved = computed(() => {
  const map = new Map<string, ResolvedRule>()
  for (const status of props.statuses) {
    const draft = props.drafts?.[status.id]
    const saved = props.transitions.find((rule) => rule.fromStatusId === status.id)
    const enabled = draft ? draft.enabled : Boolean(saved)
    if (!enabled) continue
    map.set(status.id, {
      fromId: status.id,
      toStatusIds: draft?.enabled ? [...draft.toStatusIds] : [...(saved?.toStatusIds ?? [])],
      requireAssignee: draft?.enabled ? Boolean(draft.requireAssignee) : Boolean(saved?.requireAssignee),
      requireComment: draft?.enabled ? Boolean(draft.requireComment) : Boolean(saved?.requireComment),
      allowedRoles: (draft?.enabled ? draft.allowedRoles : saved?.allowedRoles) ?? [],
    })
  }
  return map
})

const isRestricted = computed(() => resolved.value.size > 0)

const forwardEdges = computed(() => {
  const edges: Array<{ from: Status; to: Status; allowed: boolean; primary: boolean }> = []
  for (let i = 0; i < props.statuses.length - 1; i += 1) {
    const from = props.statuses[i]!
    const to = props.statuses[i + 1]!
    const rule = resolved.value.get(from.id)
    const allowed = !rule || rule.toStatusIds.includes(to.id)
    edges.push({ from, to, allowed, primary: true })
  }
  return edges
})

const skipEdges = computed(() => {
  if (!isRestricted.value) return [] as Array<{ from: Status; to: Status; label: string }>
  const result: Array<{ from: Status; to: Status; label: string }> = []
  for (const status of props.statuses) {
    const rule = resolved.value.get(status.id)
    if (!rule) continue
    const fromIndex = props.statuses.findIndex((item) => item.id === status.id)
    for (const toId of rule.toStatusIds) {
      const toIndex = props.statuses.findIndex((item) => item.id === toId)
      if (toIndex < 0 || Math.abs(toIndex - fromIndex) <= 1) continue
      const to = props.statuses[toIndex]!
      result.push({ from: status, to, label: `${status.name} → ${to.name}` })
    }
  }
  return result
})

const summary = computed(() => {
  if (!isRestricted.value) {
    return { title: 'Open workflow', detail: 'Any column can move to any other column.' }
  }
  const restricted = resolved.value.size
  const paths = [...resolved.value.values()].reduce((sum, rule) => sum + rule.toStatusIds.length, 0)
  return {
    title: 'Restricted workflow',
    detail: `${restricted} column${restricted === 1 ? '' : 's'} limited · ${paths} allowed path${paths === 1 ? '' : 's'}`,
  }
})

function ruleFor(statusId: string) {
  return resolved.value.get(statusId) ?? null
}

function actorLabels(roles: TransitionActor[]) {
  return roles.map((role) => TRANSITION_ACTOR_META[role]?.label ?? role)
}
</script>

<template>
  <div class="overflow-hidden rounded-xl border bg-gradient-to-b from-muted/40 to-muted/10">
    <div class="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-4 py-2.5">
      <div>
        <p class="text-sm font-medium">{{ summary.title }}</p>
        <p class="text-xs text-muted-foreground">{{ summary.detail }}</p>
      </div>
      <div class="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
        <span class="inline-flex items-center gap-1.5">
          <span class="h-0.5 w-5 rounded-full bg-primary" />
          Allowed
        </span>
        <span class="inline-flex items-center gap-1.5">
          <span class="h-0.5 w-5 rounded-full bg-border" style="background-image: repeating-linear-gradient(90deg, transparent, transparent 3px, currentColor 3px, currentColor 6px)" />
          Blocked
        </span>
      </div>
    </div>

    <div v-if="!statuses.length" class="px-4 py-8 text-center text-sm text-muted-foreground">
      Add statuses to see the workflow graph.
    </div>

    <div v-else class="space-y-4 p-4">
      <div class="overflow-x-auto pb-1">
        <div class="flex min-w-max items-stretch gap-0">
          <template v-for="(status, index) in statuses" :key="status.id">
            <div class="flex w-[148px] flex-col">
              <div
                :class="
                  cn(
                    'relative flex flex-1 flex-col gap-2 rounded-xl border bg-card p-3 shadow-sm transition-shadow',
                    ruleFor(status.id) && 'ring-1 ring-primary/30',
                  )
                "
              >
                <div class="absolute inset-x-3 top-0 h-1 rounded-b-full" :style="{ backgroundColor: status.color }" />
                <div class="mt-1 flex items-start gap-2">
                  <span class="mt-1 size-2.5 shrink-0 rounded-full" :style="{ backgroundColor: status.color }" />
                  <div class="min-w-0">
                    <p class="truncate text-sm font-semibold leading-tight">{{ status.name }}</p>
                    <p class="text-[11px] text-muted-foreground">{{ STATUS_CATEGORY_META[status.category].label }}</p>
                  </div>
                </div>

                <div v-if="ruleFor(status.id)" class="mt-auto space-y-1.5 border-t border-border/60 pt-2">
                  <p class="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    {{ ruleFor(status.id)!.toStatusIds.length }} destination{{ ruleFor(status.id)!.toStatusIds.length === 1 ? '' : 's' }}
                  </p>
                  <div class="flex flex-wrap gap-1">
                    <span
                      v-if="ruleFor(status.id)!.allowedRoles.length"
                      class="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                      :title="actorLabels(ruleFor(status.id)!.allowedRoles).join(', ')"
                    >
                      <Shield class="size-2.5" />
                      {{ actorLabels(ruleFor(status.id)!.allowedRoles).slice(0, 2).join(', ') }}
                      <template v-if="ruleFor(status.id)!.allowedRoles.length > 2">
                        +{{ ruleFor(status.id)!.allowedRoles.length - 2 }}
                      </template>
                    </span>
                    <span
                      v-else
                      class="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                    >
                      Anyone who can edit
                    </span>
                    <span
                      v-if="ruleFor(status.id)!.requireAssignee"
                      class="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                    >
                      <UserRound class="size-2.5" /> Assignee
                    </span>
                    <span
                      v-if="ruleFor(status.id)!.requireComment"
                      class="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                    >
                      <MessageSquareText class="size-2.5" /> Comment
                    </span>
                  </div>
                </div>
                <p v-else class="mt-auto text-[10px] text-muted-foreground">Open moves</p>
              </div>
            </div>

            <div
              v-if="index < statuses.length - 1"
              class="flex w-10 shrink-0 flex-col items-center justify-center px-0.5"
              aria-hidden="true"
            >
              <div
                :class="
                  cn(
                    'flex h-8 w-full items-center justify-center',
                    forwardEdges[index]?.allowed ? 'text-primary' : 'text-muted-foreground/40',
                  )
                "
              >
                <div
                  :class="
                    cn(
                      'h-0.5 flex-1',
                      forwardEdges[index]?.allowed
                        ? 'bg-primary'
                        : 'bg-border [background-image:repeating-linear-gradient(90deg,transparent,transparent_2px,currentColor_2px,currentColor_4px)]',
                    )
                  "
                />
                <ArrowRight
                  :class="cn('size-3.5 shrink-0', forwardEdges[index]?.allowed ? 'opacity-100' : 'opacity-40')"
                />
              </div>
              <span
                v-if="isRestricted"
                class="mt-1 text-[9px] font-medium uppercase tracking-wide"
                :class="forwardEdges[index]?.allowed ? 'text-primary' : 'text-muted-foreground/50'"
              >
                {{ forwardEdges[index]?.allowed ? 'ok' : 'no' }}
              </span>
            </div>
          </template>
        </div>
      </div>

      <div v-if="skipEdges.length" class="rounded-lg border border-dashed bg-background/60 px-3 py-2">
        <p class="mb-1.5 text-[11px] font-medium text-muted-foreground">Also allowed (skip / jump)</p>
        <div class="flex flex-wrap gap-1.5">
          <span
            v-for="edge in skipEdges"
            :key="`${edge.from.id}-${edge.to.id}`"
            class="inline-flex items-center gap-1 rounded-full border bg-card px-2.5 py-1 text-[11px]"
          >
            <span class="size-1.5 rounded-full" :style="{ backgroundColor: edge.from.color }" />
            {{ edge.from.name }}
            <ArrowRight class="size-3 text-muted-foreground" />
            <span class="size-1.5 rounded-full" :style="{ backgroundColor: edge.to.color }" />
            {{ edge.to.name }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Check, FolderKanban, Minus, Pencil, Plus, Star, Trash2, Users } from 'lucide-vue-next'
import { ref } from 'vue'
import { toast } from 'vue-sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useConfirm } from '@/composables/useConfirm'
import { getErrorMessage } from '@/lib/http'
import { PLAN_FEATURE_GROUPS, PLAN_FEATURES } from '@/lib/plan-features'
import { type Plan, superAdminApi } from '../super-admin.api'
import PlanEditorDialog from './PlanEditorDialog.vue'

/** Plans the super admin offers: limits and features, assigned to organizations on the Organizations tab. */
const props = defineProps<{ plans: Plan[] | null }>()
const emit = defineEmits<{ changed: [] }>()
const confirm = useConfirm()

const isEditorOpen = ref(false)
const editing = ref<Plan | null>(null)

function openEditor(plan: Plan | null = null) {
  editing.value = plan
  isEditorOpen.value = true
}

async function remove(plan: Plan) {
  if (!(await confirm({ title: `Delete ${plan.name}?`, description: 'This cannot be undone.', confirmLabel: 'Delete plan', destructive: true }))) return
  try {
    await superAdminApi.deletePlan(plan.id)
    toast.success(`${plan.name} deleted`)
    emit('changed')
  } catch (error) {
    toast.error(getErrorMessage(error))
  }
}

const limitLabel = (value: number | null, noun: string) => (value === null ? `Unlimited ${noun}` : `Up to ${value} ${noun}`)
</script>

<template>
  <section class="space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <p class="max-w-xl text-sm text-muted-foreground">
        Plans decide which features and emails an organization gets and how many people and projects it may have. Changes apply right away.
      </p>
      <Button variant="brand" @click="openEditor()"><Plus /> New plan</Button>
    </div>

    <div v-if="props.plans === null" class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <Skeleton v-for="index in 3" :key="index" class="h-96 w-full" />
    </div>

    <div v-else class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <article
        v-for="plan in props.plans"
        :key="plan.id"
        class="relative flex flex-col border bg-card shadow-soft transition-colors"
        :class="plan.isDefault ? 'border-primary/40 ring-4 ring-primary/10' : 'border-border/80 hover:border-primary/25'"
      >
        <div class="space-y-3 border-b border-border/60 p-5">
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0">
              <h3 class="truncate text-lg font-semibold tracking-tight">{{ plan.name }}</h3>
              <p class="text-brand text-sm font-semibold">{{ plan.priceLabel || 'No price set' }}</p>
            </div>
            <Badge v-if="plan.isDefault" variant="soft"><Star /> Default</Badge>
          </div>
          <p v-if="plan.description" class="text-sm text-muted-foreground">{{ plan.description }}</p>
          <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span class="inline-flex items-center gap-1"><Users class="size-3.5" /> {{ limitLabel(plan.maxMembers, 'people') }}</span>
            <span class="inline-flex items-center gap-1"><FolderKanban class="size-3.5" /> {{ limitLabel(plan.maxProjects, 'projects') }}</span>
          </div>
        </div>

        <ul class="flex-1 space-y-2 p-5 text-sm">
          <template v-for="group in PLAN_FEATURE_GROUPS" :key="group.value">
          <li class="pt-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase first:pt-0">{{ group.label }}</li>
          <li
            v-for="feature in PLAN_FEATURES.filter((item) => item.group === group.value)"
            :key="feature.key"
            class="flex items-start gap-2"
            :class="!plan.features[feature.key] && 'text-muted-foreground/70'"
            :title="feature.includes?.map((email) => `${email.name}: ${email.detail}`).join('\n')"
          >
            <span
              class="mt-px flex size-5 shrink-0 items-center justify-center"
              :class="plan.features[feature.key] ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground'"
            >
              <component :is="plan.features[feature.key] ? Check : Minus" class="size-3" />
            </span>
            <span class="min-w-0">
              <span class="block" :class="!plan.features[feature.key] && 'line-through decoration-muted-foreground/40'">{{ feature.label }}</span>
              <span v-if="feature.includes" class="block text-[11px] leading-snug text-muted-foreground">
                {{ feature.includes.map((email) => email.name).join(' · ') }}
              </span>
            </span>
          </li>
          </template>
        </ul>

        <div class="flex items-center justify-between gap-2 border-t border-border/60 px-5 py-3">
          <span class="text-xs text-muted-foreground tabular-nums">
            {{ plan.organizationCount }} organization{{ plan.organizationCount === 1 ? '' : 's' }}
          </span>
          <div class="flex gap-1">
            <Button variant="ghost" size="sm" @click="openEditor(plan)"><Pencil /> Edit</Button>
            <Button
              variant="ghost"
              size="icon-sm"
              class="text-destructive hover:text-destructive"
              :disabled="plan.isDefault || plan.organizationCount > 0"
              :title="plan.isDefault ? 'The default plan cannot be deleted' : plan.organizationCount ? 'Move its organizations to another plan first' : 'Delete plan'"
              :aria-label="`Delete ${plan.name}`"
              @click="remove(plan)"
            >
              <Trash2 />
            </Button>
          </div>
        </div>
      </article>
    </div>

    <PlanEditorDialog v-model:open="isEditorOpen" :plan="editing" @saved="emit('changed')" />
  </section>
</template>

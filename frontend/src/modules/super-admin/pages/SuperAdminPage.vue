<script setup lang="ts">
import { ArrowRight, Ban, Building2, Check, CircleCheck, Clock, Crown, Eye, FolderKanban, Gem, LogOut, RefreshCw, ShieldCheck, Users } from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import EmptyState from '@/components/common/EmptyState.vue'
import FormField from '@/components/common/FormField.vue'
import SelectField from '@/components/forms/SelectField.vue'
import BrandMark from '@/components/layout/BrandMark.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { formatDate, timeAgo } from '@/lib/format'
import { assetUrl, getErrorMessage } from '@/lib/http'
import { useAuthStore } from '@/modules/auth/auth.store'
import { organizationAddress } from '@/modules/auth/organization-slug'
import type { OrganizationStatus } from '@/types/models'
import UserAvatar from '@/components/common/UserAvatar.vue'
import OrganizationDetailSheet from '../components/OrganizationDetailSheet.vue'
import PlansPanel from '../components/PlansPanel.vue'
import { type Plan, type ReviewedOrganization, superAdminApi } from '../super-admin.api'

const auth = useAuthStore()
const router = useRouter()

const section = ref<'organizations' | 'plans'>('organizations')
const organizations = ref<ReviewedOrganization[] | null>(null)
const plans = ref<Plan[] | null>(null)
const isLoading = ref(false)
const filter = ref<OrganizationStatus | 'all'>('all')
const busyId = ref<string | null>(null)
const openId = ref<string | null>(null)

const SECTIONS = [
  { value: 'organizations', label: 'Organizations', icon: Building2 },
  { value: 'plans', label: 'Plans', icon: Gem },
] as const

const planOptions = computed(() => (plans.value ?? []).map((plan) => ({ value: plan.id, label: plan.name, description: plan.priceLabel ?? undefined })))

const STATUS = {
  pending: { label: 'Pending', variant: 'warning', icon: Clock },
  approved: { label: 'Approved', variant: 'success', icon: CircleCheck },
  rejected: { label: 'Rejected', variant: 'destructive', icon: Ban },
} as const

const FILTERS: Array<{
  value: OrganizationStatus | 'all'
  label: string
  description: string
  icon: typeof Clock
  accent: string
}> = [
  { value: 'all', label: 'All', description: 'Every organization', icon: Building2, accent: 'text-primary bg-primary/10 ring-primary/15' },
  { value: 'approved', label: 'Approved', description: 'Live on the portal', icon: CircleCheck, accent: 'text-success bg-success/15 ring-success/20' },
  { value: 'pending', label: 'Pending', description: 'Waiting for your decision', icon: Clock, accent: 'text-amber-700 bg-warning/15 ring-warning/20' },
  { value: 'rejected', label: 'Rejected', description: 'Blocked from the portal', icon: Ban, accent: 'text-destructive bg-destructive/12 ring-destructive/20' },
]

const count = (value: OrganizationStatus | 'all') =>
  (organizations.value ?? []).filter((organization) => value === 'all' || organization.status === value).length
const visible = computed(() => (organizations.value ?? []).filter((organization) => filter.value === 'all' || organization.status === filter.value))
const pendingCount = computed(() => count('pending'))

async function load() {
  isLoading.value = true
  try {
    ;[organizations.value, plans.value] = await Promise.all([superAdminApi.organizations(), superAdminApi.plans()])
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    isLoading.value = false
  }
}
onMounted(load)

function replace(next: ReviewedOrganization) {
  organizations.value = (organizations.value ?? []).map((organization) => (organization.id === next.id ? next : organization))
}

async function changePlan(organization: ReviewedOrganization, planId: string | null) {
  if (!planId || planId === organization.plan?.id) return
  busyId.value = organization.id
  try {
    replace(await superAdminApi.setPlan(organization.id, planId))
    plans.value = await superAdminApi.plans()
    toast.success(`${organization.name} moved to ${plans.value.find((plan) => plan.id === planId)?.name ?? 'the new plan'}`)
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    busyId.value = null
  }
}

async function approve(organization: ReviewedOrganization) {
  busyId.value = organization.id
  try {
    replace(await superAdminApi.approve(organization.id))
    toast.success(`${organization.name} is approved`, { description: organization.creator ? `${organization.creator.name} was emailed.` : undefined })
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    busyId.value = null
  }
}

const rejecting = ref<ReviewedOrganization | null>(null)
const reason = ref('')
const isRejectOpen = computed({
  get: () => Boolean(rejecting.value),
  set: (open: boolean) => {
    if (!open) rejecting.value = null
  },
})

function openReject(organization: ReviewedOrganization) {
  reason.value = ''
  rejecting.value = organization
}

async function confirmReject() {
  const organization = rejecting.value
  if (!organization) return
  busyId.value = organization.id
  try {
    replace(await superAdminApi.reject(organization.id, reason.value.trim() || undefined))
    toast.success(`${organization.name} was rejected`)
    rejecting.value = null
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    busyId.value = null
  }
}

function signOut() {
  void auth.logout()
}
</script>

<template>
  <div class="relative min-h-dvh overflow-x-hidden bg-background">
    <div
      class="pointer-events-none absolute inset-x-0 top-0 h-[28rem] opacity-90"
      style="
        background:
          radial-gradient(42rem 24rem at 8% -10%, color-mix(in oklch, var(--brand-from) 18%, transparent), transparent 70%),
          radial-gradient(36rem 22rem at 92% 0%, color-mix(in oklch, var(--brand-to) 14%, transparent), transparent 65%);
      "
    />

    <header class="sticky top-0 z-20 border-b border-border/70 bg-card/80 backdrop-blur-xl">
      <div class="flex h-16 w-full items-center gap-3 px-4 sm:px-6">
        <span class="relative flex size-9 shrink-0 items-center justify-center overflow-hidden bg-brand text-white shadow-glow">
          <span class="pointer-events-none absolute inset-0" style="background: radial-gradient(circle at 15% 5%, rgb(255 255 255 / 0.25), transparent 60%)" />
          <BrandMark class="relative size-[22px]" />
        </span>
        <span class="min-w-0 flex-1">
          <span class="block text-[15px] leading-tight font-semibold tracking-tight">Vector</span>
          <span class="flex items-center gap-1.5 text-[11px] leading-tight text-muted-foreground">
            <ShieldCheck class="size-3 text-primary" /> Portal control
          </span>
        </span>
        <span class="hidden max-w-[14rem] truncate text-sm text-muted-foreground md:block">{{ auth.user?.email }}</span>
        <Button v-if="auth.organization && !auth.isOrganizationBlocked" variant="outline" size="sm" @click="router.push({ name: 'home' })">
          Open app <ArrowRight />
        </Button>
        <Button variant="ghost" size="sm" @click="signOut"><LogOut /> <span class="hidden sm:inline">Sign out</span></Button>
      </div>
    </header>

    <main class="relative w-full space-y-6 px-4 py-6 sm:px-6">
      <section class="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div class="max-w-2xl space-y-3">
          <span class="inline-flex items-center gap-2 text-brand text-xs font-semibold tracking-[0.14em] uppercase">
            <ShieldCheck class="size-3.5" /> Super admin
          </span>
          <h1 class="text-3xl font-semibold tracking-tight sm:text-4xl">{{ section === 'plans' ? 'Plans & access' : 'Organizations' }}</h1>
          <p class="max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-[15px]">
            {{
              section === 'plans'
                ? 'Create plans, decide what each one includes, and set the default for new signups.'
                : 'Review every team that signs up, approve or reject it, and choose the plan it is on.'
            }}
          </p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <span
            v-if="pendingCount && section === 'organizations'"
            class="inline-flex items-center gap-2 border border-warning/30 bg-warning/10 px-3 py-1.5 text-sm font-medium text-amber-800 dark:text-warning"
          >
            <Clock class="size-3.5" /> {{ pendingCount }} waiting
          </span>
          <Button variant="outline" size="sm" :loading="isLoading" @click="load"><RefreshCw /> Refresh</Button>
        </div>
      </section>

      <nav class="flex gap-1 border-b border-border/70" aria-label="Super admin sections">
        <button
          v-for="item in SECTIONS"
          :key="item.value"
          type="button"
          class="-mb-px inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors"
          :class="section === item.value ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'"
          :aria-current="section === item.value ? 'page' : undefined"
          @click="section = item.value"
        >
          <component :is="item.icon" class="size-4" /> {{ item.label }}
          <span class="bg-muted px-1.5 text-xs text-foreground tabular-nums">
            {{ item.value === 'plans' ? (plans?.length ?? 0) : (organizations?.length ?? 0) }}
          </span>
        </button>
      </nav>

      <PlansPanel v-if="section === 'plans'" :plans="plans" @changed="load" />

      <template v-else>
      <section class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" role="tablist" aria-label="Filter organizations">
        <button
          v-for="item in FILTERS"
          :key="item.value"
          type="button"
          role="tab"
          :aria-selected="filter === item.value"
          class="group relative overflow-hidden border bg-card p-4 text-left shadow-soft transition-all duration-200"
          :class="
            filter === item.value
              ? 'border-primary/40 ring-4 ring-primary/10'
              : 'border-border/70 hover:border-primary/25 hover:bg-accent/30'
          "
          @click="filter = item.value"
        >
          <span class="flex items-start justify-between gap-3">
            <span class="flex size-10 items-center justify-center ring-4" :class="item.accent">
              <component :is="item.icon" class="size-4" />
            </span>
            <span class="text-2xl font-semibold tracking-tight tabular-nums">{{ count(item.value) }}</span>
          </span>
          <span class="mt-4 block text-sm font-semibold">{{ item.label }}</span>
          <span class="mt-0.5 block text-xs text-muted-foreground">{{ item.description }}</span>
        </button>
      </section>

      <section class="space-y-3">
        <div class="flex items-center justify-between gap-3">
          <h2 class="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
            {{ FILTERS.find((item) => item.value === filter)?.label }}
          </h2>
          <span class="text-xs text-muted-foreground tabular-nums">{{ visible.length }} shown</span>
        </div>

        <div v-if="organizations === null" class="space-y-3">
          <Skeleton v-for="index in 3" :key="index" class="h-28 w-full" />
        </div>

        <EmptyState
          v-else-if="!visible.length"
          :icon="filter === 'pending' ? CircleCheck : Building2"
          :title="filter === 'pending' ? 'Nothing waiting for approval' : 'No organizations here'"
          :description="
            filter === 'pending'
              ? 'When someone creates an organization, it lands here until you approve it.'
              : 'Try another filter, or wait for the next signup.'
          "
          class="border border-dashed border-border/80 bg-card/60 py-16"
        />

        <ul v-else class="space-y-3">
          <li
            v-for="organization in visible"
            :key="organization.id"
            class="group border border-border/80 bg-card p-4 shadow-soft transition-colors hover:border-primary/25 sm:p-5"
          >
            <div class="flex flex-col gap-5 lg:flex-row lg:items-center">
              <div class="flex min-w-0 flex-1 items-start gap-3.5">
                <span
                  v-if="organization.logoUrl"
                  class="flex size-12 shrink-0 items-center justify-center overflow-hidden border border-border bg-white"
                >
                  <img :src="assetUrl(organization.logoUrl)" alt="" class="size-full object-contain p-1" />
                </span>
                <span
                  v-else
                  class="flex size-12 shrink-0 items-center justify-center bg-brand text-sm font-bold tracking-wide text-white shadow-glow"
                >
                  {{ organization.name.slice(0, 2).toUpperCase() }}
                </span>

                <div class="min-w-0 flex-1 space-y-2">
                  <div class="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      class="truncate text-left text-base font-semibold tracking-tight transition-colors hover:text-primary"
                      :title="`Open ${organization.name}`"
                      @click="openId = organization.id"
                    >
                      {{ organization.name }}
                    </button>
                    <Badge :variant="STATUS[organization.status].variant">
                      <component :is="STATUS[organization.status].icon" /> {{ STATUS[organization.status].label }}
                    </Badge>
                  </div>
                  <p class="truncate text-xs text-muted-foreground">{{ organizationAddress(organization.slug) }}</p>

                  <button
                    v-if="organization.creator"
                    type="button"
                    class="flex max-w-full items-center gap-2.5 border border-border/60 bg-muted/30 py-1.5 pr-3 pl-1.5 text-left transition-colors hover:border-primary/30 hover:bg-accent/40"
                    :title="`View ${organization.creator.name}'s profile`"
                    @click="openId = organization.id"
                  >
                    <UserAvatar :user="organization.creator" size="md" />
                    <span class="min-w-0">
                      <span class="flex items-center gap-1.5 text-sm font-medium">
                        <span class="truncate">{{ organization.creator.name }}</span>
                        <Crown class="size-3.5 shrink-0 text-amber-500" />
                      </span>
                      <span class="block truncate text-xs text-muted-foreground">
                        {{ organization.creator.title ? `${organization.creator.title} · ` : 'Admin · ' }}{{ organization.creator.email }}
                      </span>
                    </span>
                  </button>

                  <div class="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
                    <span :title="formatDate(organization.createdAt)">Joined {{ timeAgo(organization.createdAt) }}</span>
                    <span class="inline-flex items-center gap-1"><Users class="size-3.5" /> {{ organization.memberCount }} people</span>
                    <span class="inline-flex items-center gap-1"><FolderKanban class="size-3.5" /> {{ organization.projectCount }} projects</span>
                  </div>

                  <p
                    v-if="organization.status === 'rejected' && organization.rejectionReason"
                    class="border-l-2 border-destructive bg-destructive/5 px-2.5 py-1.5 text-xs text-destructive"
                  >
                    {{ organization.rejectionReason }}
                  </p>
                </div>
              </div>

              <div class="flex shrink-0 flex-wrap items-center gap-2 lg:justify-end">
                <Button size="sm" variant="ghost" @click="openId = organization.id"><Eye /> Details</Button>
                <SelectField
                  :model-value="organization.plan?.id ?? null"
                  :options="planOptions"
                  placeholder="No plan"
                  size="sm"
                  class="w-40"
                  align="end"
                  :disabled="busyId !== null || !planOptions.length"
                  :aria-label="`Plan for ${organization.name}`"
                  @update:model-value="(value) => changePlan(organization, value ?? null)"
                />
                <Button
                  v-if="organization.status !== 'approved'"
                  size="sm"
                  :loading="busyId === organization.id && !rejecting"
                  :disabled="busyId !== null"
                  @click="approve(organization)"
                >
                  <Check /> Approve
                </Button>
                <Button
                  v-if="organization.status !== 'rejected'"
                  size="sm"
                  variant="outline"
                  class="text-destructive hover:bg-destructive/5 hover:text-destructive"
                  :disabled="busyId !== null"
                  @click="openReject(organization)"
                >
                  <Ban /> {{ organization.status === 'approved' ? 'Revoke' : 'Reject' }}
                </Button>
              </div>
            </div>
          </li>
        </ul>
      </section>
      </template>
    </main>

    <OrganizationDetailSheet v-model:organization-id="openId" />

    <Dialog v-model:open="isRejectOpen">
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{{ rejecting?.status === 'approved' ? 'Revoke' : 'Reject' }} {{ rejecting?.name }}?</DialogTitle>
          <DialogDescription>Its people lose access to the portal until you approve it again. The creator is emailed with your reason.</DialogDescription>
        </DialogHeader>
        <form id="reject-organization" @submit.prevent="confirmReject">
          <FormField label="Reason (optional)" for="reject-reason" hint="Shown to the organization's people.">
            <Textarea id="reject-reason" v-model="reason" rows="3" maxlength="500" placeholder="For example: we could not verify this company." />
          </FormField>
        </form>
        <DialogFooter>
          <Button variant="ghost" @click="rejecting = null">Cancel</Button>
          <Button type="submit" form="reject-organization" variant="destructive" :loading="busyId === rejecting?.id">
            {{ rejecting?.status === 'approved' ? 'Revoke access' : 'Reject organization' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>

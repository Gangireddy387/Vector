<script setup lang="ts">
import {
  ArrowRight,
  Ban,
  Building2,
  Check,
  CircleCheck,
  Clock,
  Crown,
  Eye,
  FolderKanban,
  Gem,
  LogOut,
  Monitor,
  Moon,
  RefreshCw,
  Search,
  ShieldCheck,
  Sun,
  UserRound,
  Users,
} from 'lucide-vue-next'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
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
import { useDevice } from '@/composables/useDevice'
import { useTheme } from '@/composables/useTheme'
import { getSocket } from '@/lib/realtime'
import { portalSupportApi, type SupportMessage } from '@/modules/support/support.api'
import { formatDate, timeAgo } from '@/lib/format'
import { assetUrl, getErrorMessage } from '@/lib/http'
import { useAuthStore } from '@/modules/auth/auth.store'
import { organizationAddress } from '@/modules/auth/organization-slug'
import type { OrganizationStatus } from '@/types/models'
import OrganizationLogo from '@/components/common/OrganizationLogo.vue'
import UserAvatar from '@/components/common/UserAvatar.vue'
import OrganizationDetailSheet from '../components/OrganizationDetailSheet.vue'
import PlansPanel from '../components/PlansPanel.vue'
import SuperAdminProfile from '../components/SuperAdminProfile.vue'
import { type Plan, type ReviewedOrganization, superAdminApi } from '../super-admin.api'

const auth = useAuthStore()
const router = useRouter()
const { isDesktop } = useDevice()

/** Quick theme switch beside sign-out: light → dark → system (the full choice is on Your profile). */
const { preference } = useTheme()
const THEME_CYCLE = { light: 'dark', dark: 'auto', auto: 'light' } as const
const themeLabel = computed(() => ({ light: 'Light', dark: 'Dark', auto: 'System' })[preference.value])
const themeIcon = computed(() => ({ light: Sun, dark: Moon, auto: Monitor })[preference.value])
const cycleTheme = () => (preference.value = THEME_CYCLE[preference.value])

const section = ref<'organizations' | 'plans' | 'profile'>('organizations')
const organizations = ref<ReviewedOrganization[] | null>(null)
const plans = ref<Plan[] | null>(null)
const isLoading = ref(false)
const filter = ref<OrganizationStatus | 'all'>('all')
const busyId = ref<string | null>(null)
const openId = ref<string | null>(null)

/** Every organization in the sidebar, waiting ones first; clicking one opens its details. */
const sidebarSearch = ref('')
const STATUS_ORDER = { pending: 0, approved: 1, rejected: 2 } as const
const STATUS_DOT = { pending: 'bg-warning', approved: 'bg-success', rejected: 'bg-destructive' } as const
const sidebarOrganizations = computed(() => {
  const term = sidebarSearch.value.trim().toLowerCase()
  return [...(organizations.value ?? [])]
    .filter((organization) => !term || `${organization.name} ${organization.slug}`.toLowerCase().includes(term))
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.name.localeCompare(b.name))
})

const SECTIONS = [
  { value: 'organizations', label: 'Organizations', icon: Building2 },
  { value: 'plans', label: 'Plans', icon: Gem },
  { value: 'profile', label: 'Your profile', icon: UserRound },
] as const

const HEADINGS = {
  organizations: { title: 'Organizations', text: 'Review every team that signs up, approve or reject it, and choose the plan it is on.' },
  plans: { title: 'Plans & access', text: 'Create plans, decide what each one includes, and set the default for new signups.' },
  profile: { title: 'Your profile', text: 'Your name and photo, as organization admins see them in the Vector team chat.' },
} as const

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

/** Unread chat messages per organization; new ones arrive live and clear when the conversation is opened. */
const unread = ref<Record<string, number>>({})
function onSupportMessage(message: SupportMessage) {
  if (!message.fromPortal) unread.value[message.organizationId] = (unread.value[message.organizationId] ?? 0) + 1
}
onMounted(() => getSocket()?.on('support:message', onSupportMessage))
onBeforeUnmount(() => getSocket()?.off('support:message', onSupportMessage))

async function load() {
  isLoading.value = true
  try {
    ;[organizations.value, plans.value, unread.value] = await Promise.all([superAdminApi.organizations(), superAdminApi.plans(), portalSupportApi.unread()])
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
  <!-- Same frame as the app: navigation on the left, the selected section on the right. -->
  <div class="flex h-dvh overflow-hidden bg-app">
    <aside
      v-if="isDesktop"
      class="flex w-64 shrink-0 flex-col border-r border-sidebar-border/70 bg-sidebar/75 text-sidebar-foreground backdrop-blur-xl"
      aria-label="Super admin navigation"
    >
      <div class="flex h-14 items-center gap-2.5 px-4">
        <span class="relative flex size-8 shrink-0 items-center justify-center overflow-hidden bg-brand text-white shadow-glow">
          <span class="pointer-events-none absolute inset-0" style="background: radial-gradient(circle at 15% 5%, rgb(255 255 255 / 0.25), transparent 60%)" />
          <BrandMark class="relative size-[20px]" />
        </span>
        <span class="min-w-0">
          <span class="block text-[15px] leading-tight font-semibold tracking-tight">Vector</span>
          <span class="flex items-center gap-1 text-[11px] leading-tight text-muted-foreground"><ShieldCheck class="size-3 text-primary" /> Portal control</span>
        </span>
      </div>

      <nav class="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-2 scrollbar-thin">
        <p class="mt-2 mb-1 px-2 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Portal</p>
        <button
          v-for="item in SECTIONS"
          :key="item.value"
          type="button"
          class="group relative flex h-9 items-center gap-2.5 px-2.5 text-left text-sm text-sidebar-foreground/75 transition-all hover:bg-card/80 hover:text-sidebar-foreground"
          :class="
            section === item.value &&
            'bg-card font-medium text-primary shadow-soft before:absolute before:top-1/2 before:-left-3 before:h-5 before:w-1 before:-translate-y-1/2 before:bg-brand'
          "
          :aria-current="section === item.value ? 'page' : undefined"
          @click="section = item.value"
        >
          <component :is="item.icon" class="size-4 shrink-0" />
          <span class="min-w-0 flex-1 truncate">{{ item.label }}</span>
          <span v-if="item.value !== 'profile'" class="bg-muted px-1.5 text-[11px] text-foreground tabular-nums">
            {{ item.value === 'plans' ? (plans?.length ?? 0) : (organizations?.length ?? 0) }}
          </span>
        </button>

        <p class="mt-5 mb-1 flex items-center justify-between px-2 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
          Organizations <span class="tabular-nums">{{ organizations?.length ?? 0 }}</span>
        </p>
        <div v-if="(organizations?.length ?? 0) > 8" class="relative mb-1">
          <Search class="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            v-model="sidebarSearch"
            class="h-8 w-full border border-border/70 bg-card/60 pr-2 pl-8 text-[13px] outline-none placeholder:text-muted-foreground focus:border-primary/40"
            placeholder="Find an organization"
            aria-label="Find an organization"
          />
        </div>
        <button
          v-for="organization in sidebarOrganizations"
          :key="organization.id"
          type="button"
          class="flex h-11 items-center gap-2.5 px-2 text-left text-[13px] text-sidebar-foreground/80 transition-all hover:bg-card/80 hover:text-sidebar-foreground"
          :class="openId === organization.id && 'bg-card font-medium text-foreground shadow-soft'"
          :title="`${organization.name} · ${STATUS[organization.status].label}`"
          @click="openId = organization.id"
        >
          <OrganizationLogo v-if="organization.logoUrl" :src="assetUrl(organization.logoUrl)!" :alt="organization.name" size="sm" bare class="h-8 max-w-24" />
          <span v-else class="flex size-6 shrink-0 items-center justify-center bg-brand text-[10px] font-bold text-white">
            {{ organization.name.slice(0, 2).toUpperCase() }}
          </span>
          <span class="min-w-0 flex-1 truncate">{{ organization.name }}</span>
          <span
            v-if="unread[organization.id]"
            class="flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground tabular-nums"
            :title="`${unread[organization.id]} unread message${unread[organization.id] === 1 ? '' : 's'}`"
          >
            {{ unread[organization.id] }}
          </span>
          <span class="size-2 shrink-0 rounded-full" :class="STATUS_DOT[organization.status]" :aria-label="STATUS[organization.status].label" />
        </button>
        <p v-if="organizations && !sidebarOrganizations.length" class="px-2 py-2 text-xs text-muted-foreground">
          {{ organizations.length ? 'No match' : 'No organizations yet' }}
        </p>
      </nav>

      <div class="space-y-2 border-t border-sidebar-border p-3">
        <Button v-if="auth.organization && !auth.isOrganizationBlocked" variant="outline" size="sm" class="w-full" @click="router.push({ name: 'home' })">
          Open app <ArrowRight />
        </Button>
        <div class="flex items-center gap-2.5">
          <button
            type="button"
            class="flex min-w-0 flex-1 items-center gap-2.5 p-1 text-left transition-colors hover:bg-card/80"
            title="Edit your profile"
            @click="section = 'profile'"
          >
            <UserAvatar :user="auth.user" size="md" />
            <span class="min-w-0 flex-1">
              <span class="block truncate text-sm font-medium">{{ auth.user?.name }}</span>
              <span class="block truncate text-xs text-muted-foreground">{{ auth.user?.email }}</span>
            </span>
          </button>
          <Button variant="ghost" size="icon-sm" :aria-label="`Theme: ${themeLabel}. Change`" :title="`Theme: ${themeLabel} (click to change)`" @click="cycleTheme">
            <component :is="themeIcon" />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Sign out" title="Sign out" @click="signOut"><LogOut /></Button>
        </div>
      </div>
    </aside>

    <div class="flex min-w-0 flex-1 flex-col">
      <header v-if="!isDesktop" class="sticky top-0 z-20 border-b border-border/70 bg-card/80 backdrop-blur-xl">
        <div class="flex h-14 items-center gap-3 px-3">
          <span class="relative flex size-8 shrink-0 items-center justify-center overflow-hidden bg-brand text-white shadow-glow">
            <BrandMark class="relative size-[20px]" />
          </span>
          <span class="min-w-0 flex-1">
            <span class="block text-[15px] leading-tight font-semibold tracking-tight">Vector</span>
            <span class="block text-[11px] leading-tight text-muted-foreground">Portal control</span>
          </span>
          <Button variant="ghost" size="sm" @click="signOut"><LogOut /> Sign out</Button>
        </div>
        <nav class="flex gap-1 px-3" aria-label="Super admin sections">
          <button
            v-for="item in SECTIONS"
            :key="item.value"
            type="button"
            class="-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition-colors"
            :class="section === item.value ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'"
            @click="section = item.value"
          >
            <component :is="item.icon" class="size-4" /> {{ item.label }}
          </button>
        </nav>
      </header>

    <main class="relative min-h-0 w-full flex-1 space-y-6 overflow-y-auto p-5 scrollbar-thin">
      <section class="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div class="max-w-2xl space-y-3">
          <span class="inline-flex items-center gap-2 text-brand text-xs font-semibold tracking-[0.14em] uppercase">
            <ShieldCheck class="size-3.5" /> Super admin
          </span>
          <h1 class="text-3xl font-semibold tracking-tight sm:text-4xl">{{ HEADINGS[section].title }}</h1>
          <p class="max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-[15px]">{{ HEADINGS[section].text }}</p>
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

      <PlansPanel v-if="section === 'plans'" :plans="plans" @changed="load" />
      <SuperAdminProfile v-else-if="section === 'profile'" />

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

        <div v-else class="overflow-hidden border border-border/80 bg-card shadow-soft">
          <!-- Column headings (wide screens); each row lines up under them. -->
          <div
            class="hidden grid-cols-[minmax(0,2.2fr)_minmax(0,1.8fr)_7.5rem_10rem_6.5rem_7rem_auto] items-center gap-4 border-b border-border/70 bg-muted/40 px-4 py-2.5 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase xl:grid"
          >
            <span>Organization</span>
            <span>Admin</span>
            <span>Status</span>
            <span>Plan</span>
            <span>Usage</span>
            <span>Created</span>
            <span class="text-right">Actions</span>
          </div>

          <ul class="divide-y divide-border/60">
            <li
              v-for="organization in visible"
              :key="organization.id"
              class="grid gap-3 px-4 py-3.5 transition-colors hover:bg-accent/30 xl:grid-cols-[minmax(0,2.2fr)_minmax(0,1.8fr)_7.5rem_10rem_6.5rem_7rem_auto] xl:items-center xl:gap-4"
              :class="openId === organization.id && 'bg-primary/5'"
            >
              <!-- Organization -->
              <button type="button" class="group flex min-w-0 items-center gap-3 text-left" :title="`Open ${organization.name}`" @click="openId = organization.id">
                <span class="flex h-10 w-32 shrink-0 items-center justify-start">
                  <OrganizationLogo v-if="organization.logoUrl" :src="assetUrl(organization.logoUrl)!" :alt="organization.name" size="md" bare class="h-10 max-w-32" />
                  <span v-else class="flex size-10 items-center justify-center bg-brand text-xs font-bold tracking-wide text-white shadow-glow">
                    {{ organization.name.slice(0, 2).toUpperCase() }}
                  </span>
                </span>
                <span class="min-w-0">
                  <span class="block truncate text-sm font-semibold tracking-tight transition-colors group-hover:text-primary">{{ organization.name }}</span>
                  <span class="block truncate text-xs text-muted-foreground">{{ organizationAddress(organization.slug) }}</span>
                </span>
              </button>

              <!-- Admin -->
              <button
                v-if="organization.creator"
                type="button"
                class="flex min-w-0 items-center gap-2.5 text-left"
                :title="`View ${organization.creator.name}'s profile`"
                @click="openId = organization.id"
              >
                <UserAvatar :user="organization.creator" size="md" />
                <span class="min-w-0">
                  <span class="flex items-center gap-1 text-sm font-medium">
                    <span class="truncate">{{ organization.creator.name }}</span>
                    <Crown class="size-3.5 shrink-0 text-amber-500" />
                  </span>
                  <span class="block truncate text-xs text-muted-foreground">{{ organization.creator.title || organization.creator.email }}</span>
                </span>
              </button>
              <span v-else class="text-xs text-muted-foreground">No admin</span>

              <!-- Status -->
              <div>
                <Badge :variant="STATUS[organization.status].variant">
                  <component :is="STATUS[organization.status].icon" /> {{ STATUS[organization.status].label }}
                </Badge>
              </div>

              <!-- Plan -->
              <div class="min-w-0 space-y-1">
                <SelectField
                  :model-value="organization.plan?.id ?? null"
                  :options="planOptions"
                  placeholder="No plan"
                  size="sm"
                  class="w-full max-w-48"
                  :disabled="busyId !== null || !planOptions.length"
                  :aria-label="`Plan for ${organization.name}`"
                  @update:model-value="(value) => changePlan(organization, value ?? null)"
                />
                <button
                  v-if="organization.customFeatureCount"
                  type="button"
                  class="block text-[11px] font-medium text-brand hover:underline"
                  @click="openId = organization.id"
                >
                  + {{ organization.customFeatureCount }} custom feature{{ organization.customFeatureCount === 1 ? '' : 's' }}
                </button>
              </div>

              <!-- Usage -->
              <div class="flex gap-3 text-xs text-muted-foreground xl:flex-col xl:gap-0.5">
                <span class="inline-flex items-center gap-1" title="People"><Users class="size-3.5" /> {{ organization.memberCount }} people</span>
                <span class="inline-flex items-center gap-1" title="Projects"><FolderKanban class="size-3.5" /> {{ organization.projectCount }} projects</span>
              </div>

              <!-- Created -->
              <span class="text-xs text-muted-foreground" :title="formatDate(organization.createdAt, 'd MMM yyyy, HH:mm')">
                <span class="xl:hidden">Created </span>{{ timeAgo(organization.createdAt) }}
              </span>

              <!-- Actions -->
              <div class="flex flex-wrap items-center gap-1.5 xl:justify-end">
                <Button size="sm" variant="ghost" @click="openId = organization.id"><Eye /> Details</Button>
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

              <p
                v-if="organization.status === 'rejected' && organization.rejectionReason"
                class="border-l-2 border-destructive bg-destructive/5 px-2.5 py-1.5 text-xs text-destructive xl:col-span-7"
              >
                Reason: {{ organization.rejectionReason }}
              </p>
            </li>
          </ul>
        </div>
      </section>
      </template>
    </main>
    </div>

    <OrganizationDetailSheet v-model:organization-id="openId" :unread="openId ? unread[openId] : 0" @read="(id) => (unread[id] = 0)" @updated="replace" />

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

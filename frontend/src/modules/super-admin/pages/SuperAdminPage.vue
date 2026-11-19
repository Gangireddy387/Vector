<script setup lang="ts">
import {
  Activity,
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
  SunDim,
  Trash2,
  Images,
  Scale,
  UserRound,
  Users,
} from 'lucide-vue-next'
import { useDebounceFn } from '@vueuse/core'
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import EmptyState from '@/components/common/EmptyState.vue'
import FormField from '@/components/common/FormField.vue'
import SelectField from '@/components/forms/SelectField.vue'
import BrandMark from '@/components/layout/BrandMark.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { useDevice } from '@/composables/useDevice'
import { useSoundPreferences } from '@/composables/useSoundPreferences'
import { useTheme } from '@/composables/useTheme'
import { applyBrand } from '@/lib/brand-theme'
import { useSocketEvents } from '@/lib/socket-events'
import { playSound } from '@/lib/sounds'
import IncomingCall from '@/modules/meetings/components/IncomingCall.vue'
import { portalSupportApi, type SupportMessage } from '@/modules/support/support.api'
import { formatDate, timeAgo } from '@/lib/format'
import { assetUrl, getErrorMessage } from '@/lib/http'
import { useAuthStore } from '@/modules/auth/auth.store'
import { organizationAddress } from '@/modules/auth/organization-slug'
import type { OrganizationStatus } from '@/types/models'
import OrganizationLogo from '@/components/common/OrganizationLogo.vue'
import UserAvatar from '@/components/common/UserAvatar.vue'
import OrganizationDetailSheet from '../components/OrganizationDetailSheet.vue'
import OpsPanel from '../components/OpsPanel.vue'
import PlansPanel from '../components/PlansPanel.vue'
import LegalContactPanel from '../components/LegalContactPanel.vue'
import ShowcaseGalleryPanel from '../components/ShowcaseGalleryPanel.vue'
import SuperAdminProfile from '../components/SuperAdminProfile.vue'
import { type Plan, type ReviewedOrganization, superAdminApi } from '../super-admin.api'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
/** Full sidebar from 1024px up; phone and tablet use the top section bar. */
const { isWide } = useDevice()

/** Quick theme switch beside sign-out: light → dim → dark → system (the full choice is on Your profile). */
const { preference } = useTheme()
const THEME_CYCLE = { light: 'dim', dim: 'dark', dark: 'auto', auto: 'light' } as const
const themeLabel = computed(() => ({ light: 'Light', dim: 'Dim', dark: 'Dark', auto: 'System' })[preference.value])
const themeIcon = computed(() => ({ light: Sun, dim: SunDim, dark: Moon, auto: Monitor })[preference.value])
const cycleTheme = () => (preference.value = THEME_CYCLE[preference.value])

const SECTION_VALUES = ['organizations', 'plans', 'gallery', 'legal', 'ops', 'profile'] as const
type SuperAdminSection = (typeof SECTION_VALUES)[number]
/** The open section lives in the address (?section=plans) so links land on it. */
const section = computed<SuperAdminSection>({
  get: () => (SECTION_VALUES.includes(route.query.section as SuperAdminSection) ? (route.query.section as SuperAdminSection) : 'organizations'),
  set: (value) => void router.replace({ query: { ...route.query, section: value === 'organizations' ? undefined : value } }),
})
const organizations = ref<ReviewedOrganization[] | null>(null)
const plans = ref<Plan[] | null>(null)
const isLoading = ref(false)
const opsPanel = ref<InstanceType<typeof OpsPanel> | null>(null)
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
  { value: 'organizations', label: 'Organizations', short: 'Orgs', icon: Building2 },
  { value: 'plans', label: 'Plans', short: 'Plans', icon: Gem },
  { value: 'gallery', label: 'Showcase', short: 'Gallery', icon: Images },
  { value: 'legal', label: 'Legal', short: 'Legal', icon: Scale },
  { value: 'ops', label: 'Ops', short: 'Ops', icon: Activity },
  { value: 'profile', label: 'Your profile', short: 'Profile', icon: UserRound },
] as const

const HEADINGS = {
  organizations: { title: 'Organizations', text: 'Review every team that signs up, approve or reject it, and choose the plan it is on.' },
  plans: { title: 'Plans & access', text: 'Create plans, decide what each one includes, and set the default for new signups.' },
  gallery: { title: 'Showcase gallery', text: 'Upload portraits used on About and sign-in — they replace the built-in illustrations in the rich UI.' },
  legal: { title: 'Legal contact', text: 'Company name, email, phone and address shown on the public Privacy Policy and Terms pages.' },
  ops: { title: 'Ops', text: 'Payments, scheduled jobs, and automation health for this backend.' },
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
/** New signups, renames and removals arrive live; the list is fetched again (a burst of changes fetches once). */
const refreshOrganizations = useDebounceFn(async () => {
  try {
    organizations.value = await superAdminApi.organizations()
  } catch {
    // The next change or reload catches up.
  }
}, 400)
function onOrganization(event: { action: 'created' | 'updated' | 'deleted'; organization: { id: string; name: string; status: OrganizationStatus } }) {
  if (event.action === 'created' && event.organization.status === 'pending') {
    playSound('notification', { id: `organization-${event.organization.id}` })
    toast(`${event.organization.name} is waiting for approval`, {
      description: 'A new organization signed up.',
      action: { label: 'Review', onClick: () => (filter.value = 'pending') },
    })
  }
  void refreshOrganizations()
}
// After the connection drops and comes back, anything missed meanwhile is fetched.
let connectedBefore = false
useSocketEvents(
  { 'support:message': onSupportMessage, 'portal:organization': onOrganization },
  {
    onConnect: () => {
      if (connectedBefore) void refreshOrganizations()
      connectedBefore = true
    },
  },
)

async function refresh() {
  if (section.value === 'ops') {
    isLoading.value = true
    try {
      await opsPanel.value?.reload()
    } finally {
      isLoading.value = false
    }
    return
  }
  await load()
}

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
useSoundPreferences()
onMounted(() => {
  applyBrand(null, { remember: false })
  load()
})

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

/** Removing an organization for good: its name is typed to confirm. */
const removing = ref<ReviewedOrganization | null>(null)
const confirmName = ref('')
const isRemoveOpen = computed({
  get: () => Boolean(removing.value),
  set: (open: boolean) => {
    if (!open) removing.value = null
  },
})
const nameMatches = computed(() => Boolean(removing.value && confirmName.value.trim() === removing.value.name))

function openRemove(organization: ReviewedOrganization) {
  confirmName.value = ''
  removing.value = organization
}

async function confirmRemove() {
  const organization = removing.value
  if (!organization || !nameMatches.value) return
  busyId.value = organization.id
  try {
    const { removedAccounts } = await superAdminApi.remove(organization.id, confirmName.value)
    organizations.value = (organizations.value ?? []).filter((item) => item.id !== organization.id)
    if (openId.value === organization.id) openId.value = null
    removing.value = null
    toast.success(`${organization.name} was removed`, {
      description: removedAccounts
        ? `${removedAccounts} ${removedAccounts === 1 ? 'account' : 'accounts'} that belonged only to it ${removedAccounts === 1 ? 'was' : 'were'} removed too.`
        : undefined,
    })
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
    <!-- Organization admins can call the Vector team: their call rings here. -->
    <IncomingCall />
    <aside
      v-if="isWide"
      class="flex w-64 shrink-0 flex-col border-r border-sidebar-border/70 bg-sidebar/75 text-sidebar-foreground backdrop-blur-xl"
      aria-label="Super admin navigation"
    >
      <div class="flex h-14 items-center gap-2.5 px-4">
        <span class="relative flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-brand text-white shadow-glow">
          <span class="pointer-events-none absolute inset-0" style="background: radial-gradient(circle at 15% 5%, rgb(255 255 255 / 0.25), transparent 60%)" />
          <BrandMark class="relative size-[20px]" />
        </span>
        <span class="min-w-0">
          <span class="block text-[15px] leading-tight font-semibold tracking-tight">Vector</span>
          <span class="flex items-center gap-1 text-[11px] leading-tight text-muted-foreground"><ShieldCheck class="size-3 text-primary" /> Portal control</span>
        </span>
      </div>

      <nav class="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-2 scrollbar-thin">
        <p class="mt-2 mb-1 px-2 text-xs font-medium text-muted-foreground">Portal</p>
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

        <p class="mt-5 mb-1 flex items-center justify-between px-2 text-xs font-medium text-muted-foreground">
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
            v-if="organization.upgradeRequest"
            class="rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:text-amber-200"
            title="Pending plan request"
          >
            Plan
          </span>
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
      <header v-if="!isWide" class="sticky top-0 z-20 border-b border-border/70 bg-card/90 pt-safe backdrop-blur-xl">
        <div class="flex h-14 items-center gap-2.5 px-3">
          <span class="relative flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-brand text-white shadow-glow">
            <BrandMark class="relative size-[20px]" />
          </span>
          <span class="min-w-0 flex-1">
            <span class="block text-[15px] leading-tight font-semibold tracking-tight">Vector</span>
            <span class="block text-[11px] leading-tight text-muted-foreground">Portal control</span>
          </span>
          <Button variant="ghost" size="icon-sm" :aria-label="`Theme: ${themeLabel}. Change`" :title="`Theme: ${themeLabel}`" @click="cycleTheme">
            <component :is="themeIcon" />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Sign out" @click="signOut"><LogOut /></Button>
        </div>
        <nav class="-mx-0 flex gap-1 overflow-x-auto px-3 scrollbar-none" aria-label="Super admin sections">
          <button
            v-for="item in SECTIONS"
            :key="item.value"
            type="button"
            class="-mb-px inline-flex shrink-0 items-center gap-1.5 border-b-2 px-2.5 py-2.5 text-sm font-medium transition-colors sm:gap-2 sm:px-3"
            :class="section === item.value ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'"
            @click="section = item.value"
          >
            <component :is="item.icon" class="size-4" />
            <span class="sm:hidden">{{ item.short }}</span>
            <span class="max-sm:hidden">{{ item.label }}</span>
            <span
              v-if="item.value === 'organizations' && pendingCount"
              class="rounded-full bg-warning/20 px-1.5 text-[10px] font-semibold text-amber-800 tabular-nums dark:text-warning"
            >
              {{ pendingCount }}
            </span>
          </button>
        </nav>
      </header>

    <main class="relative min-h-0 w-full flex-1 space-y-4 overflow-y-auto p-3 pb-safe scrollbar-thin sm:space-y-6 sm:p-5">
      <section class="flex items-start justify-between gap-3 sm:flex-col sm:gap-5 lg:flex-row lg:items-end">
        <div class="min-w-0 max-w-2xl space-y-1 sm:space-y-3">
          <span class="inline-flex items-center gap-2 text-xs font-medium text-brand max-sm:hidden">
            <ShieldCheck class="size-3.5" /> Super admin
          </span>
          <h1 class="text-xl font-semibold tracking-tight sm:text-3xl lg:text-4xl">{{ HEADINGS[section].title }}</h1>
          <p class="max-w-xl text-[13px] leading-relaxed text-muted-foreground max-sm:hidden sm:text-sm sm:text-[15px]">{{ HEADINGS[section].text }}</p>
        </div>
        <div class="flex shrink-0 flex-wrap items-center gap-2">
          <span
            v-if="pendingCount && section === 'organizations'"
            class="inline-flex items-center gap-1.5 rounded-lg border border-warning/30 bg-warning/10 px-2.5 py-1 text-xs font-medium text-amber-800 sm:gap-2 sm:px-3 sm:py-1.5 sm:text-sm dark:text-warning"
          >
            <Clock class="size-3.5" /> {{ pendingCount }} waiting
          </span>
          <Button variant="outline" size="icon-sm" class="sm:hidden" :loading="isLoading" aria-label="Refresh" @click="refresh"><RefreshCw /></Button>
          <Button variant="outline" size="sm" class="max-sm:hidden" :loading="isLoading" @click="refresh"><RefreshCw /> Refresh</Button>
        </div>
      </section>

      <PlansPanel v-if="section === 'plans'" :plans="plans" @changed="load" />
      <ShowcaseGalleryPanel v-else-if="section === 'gallery'" />
      <LegalContactPanel v-else-if="section === 'legal'" />
      <OpsPanel v-else-if="section === 'ops'" ref="opsPanel" />
      <SuperAdminProfile v-else-if="section === 'profile'" />

      <template v-else>
      <!-- Phone/tablet: 2×2 fit, no horizontal scroll. Wide screens: stat cards. -->
      <section class="grid grid-cols-2 gap-2 xl:grid-cols-4 xl:gap-3" role="tablist" aria-label="Filter organizations">
        <button
          v-for="item in FILTERS"
          :key="item.value"
          type="button"
          role="tab"
          :aria-selected="filter === item.value"
          class="group relative min-w-0 overflow-hidden rounded-xl border bg-card p-2.5 text-left shadow-soft transition-all duration-200 sm:p-3 xl:p-4"
          :class="
            filter === item.value
              ? 'border-primary/40 ring-2 ring-primary/15 xl:ring-4 xl:ring-primary/10'
              : 'border-border/70 hover:border-primary/25 hover:bg-accent/30'
          "
          @click="filter = item.value"
        >
          <span class="flex items-center justify-between gap-2 xl:hidden">
            <span class="flex min-w-0 items-center gap-1.5">
              <span class="flex size-7 shrink-0 items-center justify-center rounded-md" :class="item.accent">
                <component :is="item.icon" class="size-3.5" />
              </span>
              <span class="truncate text-xs font-semibold">{{ item.label }}</span>
            </span>
            <span class="text-sm font-semibold tabular-nums">{{ count(item.value) }}</span>
          </span>
          <span class="hidden xl:block">
            <span class="flex items-start justify-between gap-3">
              <span class="flex size-10 items-center justify-center rounded-lg ring-4" :class="item.accent">
                <component :is="item.icon" class="size-4" />
              </span>
              <span class="text-2xl font-semibold tracking-tight tabular-nums">{{ count(item.value) }}</span>
            </span>
            <span class="mt-4 block text-sm font-semibold">{{ item.label }}</span>
            <span class="mt-0.5 block text-xs text-muted-foreground">{{ item.description }}</span>
          </span>
        </button>
      </section>

      <section class="space-y-3">
        <div class="flex items-center justify-between gap-3">
          <h2 class="text-sm font-medium text-muted-foreground">
            {{ FILTERS.find((item) => item.value === filter)?.label }}
          </h2>
          <span class="text-xs text-muted-foreground tabular-nums">{{ visible.length }} shown</span>
        </div>

        <div v-if="organizations === null" class="space-y-3">
          <Skeleton v-for="index in 3" :key="index" class="h-36 w-full rounded-xl" />
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
          class="rounded-xl py-14 sm:py-16"
        />

        <!-- Mobile / tablet cards -->
        <ul v-else class="space-y-3 xl:hidden">
          <li
            v-for="organization in visible"
            :key="organization.id"
            class="rounded-xl border border-border/80 bg-card p-3.5 shadow-soft"
            :class="openId === organization.id && 'border-primary/40 bg-primary/5'"
          >
            <button type="button" class="flex w-full min-w-0 items-start gap-3 text-left" :title="`Open ${organization.name}`" @click="openId = organization.id">
              <OrganizationLogo
                v-if="organization.logoUrl"
                :src="assetUrl(organization.logoUrl)!"
                :alt="organization.name"
                size="md"
                bare
                class="mt-0.5 h-10 max-w-24 shrink-0"
              />
              <span
                v-else
                class="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand text-xs font-bold tracking-wide text-white shadow-glow"
              >
                {{ organization.name.slice(0, 2).toUpperCase() }}
              </span>
              <span class="min-w-0 flex-1">
                <span class="flex items-start justify-between gap-2">
                  <span class="truncate text-[15px] font-semibold tracking-tight">{{ organization.name }}</span>
                  <span class="flex shrink-0 flex-wrap justify-end gap-1">
                    <Badge v-if="organization.upgradeRequest" variant="warning">Plan request</Badge>
                    <Badge :variant="STATUS[organization.status].variant">
                      <component :is="STATUS[organization.status].icon" /> {{ STATUS[organization.status].label }}
                    </Badge>
                  </span>
                </span>
                <span class="mt-0.5 block truncate text-xs text-muted-foreground">{{ organizationAddress(organization.slug) }}</span>
              </span>
            </button>

            <div class="mt-3 flex items-center gap-2.5">
              <template v-if="organization.creator">
                <UserAvatar :user="organization.creator" size="sm" />
                <div class="min-w-0 flex-1">
                  <p class="flex items-center gap-1 truncate text-sm font-medium">
                    {{ organization.creator.name }}
                    <Crown class="size-3 shrink-0 text-amber-500" />
                  </p>
                  <p class="truncate text-xs text-muted-foreground">{{ organization.creator.title || organization.creator.email }}</p>
                </div>
              </template>
              <p v-else class="text-xs text-muted-foreground">No admin</p>
            </div>

            <div class="mt-3 flex items-center gap-2">
              <SelectField
                :model-value="organization.plan?.id ?? null"
                :options="planOptions"
                placeholder="No plan"
                size="sm"
                class="min-w-0 flex-1"
                :disabled="busyId !== null || !planOptions.length"
                :aria-label="`Plan for ${organization.name}`"
                @update:model-value="(value) => changePlan(organization, value ?? null)"
              />
              <button
                v-if="organization.customFeatureCount"
                type="button"
                class="shrink-0 text-[11px] font-medium text-brand hover:underline"
                @click="openId = organization.id"
              >
                +{{ organization.customFeatureCount }}
              </button>
            </div>

            <p class="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span class="inline-flex items-center gap-1"><Users class="size-3.5" /> {{ organization.memberCount }}</span>
              <span class="inline-flex items-center gap-1"><FolderKanban class="size-3.5" /> {{ organization.projectCount }}</span>
              <span :title="formatDate(organization.createdAt, 'd MMM yyyy, HH:mm')">{{ timeAgo(organization.createdAt) }}</span>
            </p>

            <p
              v-if="organization.status === 'rejected' && organization.rejectionReason"
              class="mt-2.5 rounded-md border-l-2 border-destructive bg-destructive/5 px-2.5 py-1.5 text-xs text-destructive"
            >
              Reason: {{ organization.rejectionReason }}
            </p>

            <div class="mt-3 flex items-center gap-2 border-t border-border/60 pt-3">
              <Button size="sm" variant="outline" class="min-w-0 flex-1" @click="openId = organization.id"><Eye /> Details</Button>
              <Button
                v-if="organization.status !== 'approved'"
                size="sm"
                class="shrink-0"
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
                class="shrink-0 text-destructive hover:bg-destructive/5 hover:text-destructive"
                :disabled="busyId !== null"
                @click="openReject(organization)"
              >
                <Ban /> {{ organization.status === 'approved' ? 'Revoke' : 'Reject' }}
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                class="shrink-0 text-muted-foreground hover:bg-destructive/5 hover:text-destructive"
                :disabled="busyId !== null"
                :aria-label="`Delete ${organization.name}`"
                title="Delete the organization and everything in it"
                @click="openRemove(organization)"
              >
                <Trash2 />
              </Button>
            </div>
          </li>
        </ul>

        <!-- Wide desktop table -->
        <div v-if="visible.length" class="hidden overflow-hidden rounded-xl border border-border/80 bg-card shadow-soft xl:block">
          <div
            class="grid grid-cols-[minmax(0,2.2fr)_minmax(0,1.8fr)_7.5rem_10rem_6.5rem_7rem_auto] items-center gap-4 border-b border-border/70 bg-muted/40 px-4 py-2.5 text-xs font-medium text-muted-foreground"
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
              :key="`table-${organization.id}`"
              class="grid grid-cols-[minmax(0,2.2fr)_minmax(0,1.8fr)_7.5rem_10rem_6.5rem_7rem_auto] items-center gap-4 px-4 py-3.5 transition-colors hover:bg-accent/30"
              :class="openId === organization.id && 'bg-primary/5'"
            >
              <button type="button" class="group flex min-w-0 items-center gap-3 text-left" :title="`Open ${organization.name}`" @click="openId = organization.id">
                <span class="flex h-10 w-32 shrink-0 items-center justify-start">
                  <OrganizationLogo v-if="organization.logoUrl" :src="assetUrl(organization.logoUrl)!" :alt="organization.name" size="md" bare class="h-10 max-w-32" />
                  <span v-else class="flex size-10 items-center justify-center rounded-lg bg-brand text-xs font-bold tracking-wide text-white shadow-glow">
                    {{ organization.name.slice(0, 2).toUpperCase() }}
                  </span>
                </span>
                <span class="min-w-0">
                  <span class="block truncate text-sm font-semibold tracking-tight transition-colors group-hover:text-primary">{{ organization.name }}</span>
                  <span class="block truncate text-xs text-muted-foreground">{{ organizationAddress(organization.slug) }}</span>
                </span>
              </button>

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

              <div class="flex flex-col items-start gap-1">
                <Badge :variant="STATUS[organization.status].variant">
                  <component :is="STATUS[organization.status].icon" /> {{ STATUS[organization.status].label }}
                </Badge>
                <Badge v-if="organization.upgradeRequest" variant="warning">Plan request</Badge>
              </div>

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
                <p v-if="organization.upgradeRequest" class="text-[11px] text-amber-800 dark:text-amber-200">
                  Wants
                  {{
                    organization.upgradeRequest.target === 'pro'
                      ? 'Pro'
                      : organization.upgradeRequest.target === 'seats'
                        ? 'more people'
                        : 'more projects'
                  }}
                </p>
              </div>

              <div class="flex flex-col gap-0.5 text-xs text-muted-foreground">
                <span class="inline-flex items-center gap-1" title="People"><Users class="size-3.5" /> {{ organization.memberCount }} people</span>
                <span class="inline-flex items-center gap-1" title="Projects"><FolderKanban class="size-3.5" /> {{ organization.projectCount }} projects</span>
              </div>

              <span class="text-xs text-muted-foreground" :title="formatDate(organization.createdAt, 'd MMM yyyy, HH:mm')">
                {{ timeAgo(organization.createdAt) }}
              </span>

              <div class="flex flex-wrap items-center justify-end gap-1.5">
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
                <Button
                  size="icon-sm"
                  variant="ghost"
                  class="text-muted-foreground hover:bg-destructive/5 hover:text-destructive"
                  :disabled="busyId !== null"
                  :aria-label="`Delete ${organization.name}`"
                  title="Delete the organization and everything in it"
                  @click="openRemove(organization)"
                >
                  <Trash2 />
                </Button>
              </div>

              <p
                v-if="organization.status === 'rejected' && organization.rejectionReason"
                class="col-span-7 rounded-md border-l-2 border-destructive bg-destructive/5 px-2.5 py-1.5 text-xs text-destructive"
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
        <DialogFooter class="max-sm:flex-col-reverse max-sm:gap-2">
          <Button variant="ghost" class="max-sm:w-full" @click="rejecting = null">Cancel</Button>
          <Button type="submit" form="reject-organization" variant="destructive" class="max-sm:w-full" :loading="busyId === rejecting?.id">
            {{ rejecting?.status === 'approved' ? 'Revoke access' : 'Reject organization' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog v-model:open="isRemoveOpen">
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete {{ removing?.name }}?</DialogTitle>
          <DialogDescription>This removes the organization for good. It cannot be undone.</DialogDescription>
        </DialogHeader>
        <ul class="space-y-1.5 border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm">
          <li>
            All its work is deleted: {{ removing?.projectCount ?? 0 }} {{ removing?.projectCount === 1 ? 'project' : 'projects' }} with their tasks and files,
            meetings and recordings, chats, calendars and support messages.
          </li>
          <li>Its {{ removing?.memberCount ?? 0 }} {{ removing?.memberCount === 1 ? 'person loses' : 'people lose' }} access right away.</li>
          <li>Accounts that belong to no other organization are deleted too, so those emails can sign up again.</li>
        </ul>
        <form id="remove-organization" @submit.prevent="confirmRemove">
          <FormField :label="`Type ${removing?.name ?? 'the name'} to confirm`" for="remove-confirm">
            <Input id="remove-confirm" v-model="confirmName" autocomplete="off" :placeholder="removing?.name" />
          </FormField>
        </form>
        <DialogFooter class="max-sm:flex-col-reverse max-sm:gap-2">
          <Button variant="ghost" class="max-sm:w-full" @click="removing = null">Cancel</Button>
          <Button type="submit" form="remove-organization" variant="destructive" class="max-sm:w-full" :disabled="!nameMatches" :loading="busyId === removing?.id">
            <Trash2 /> Delete for good
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>

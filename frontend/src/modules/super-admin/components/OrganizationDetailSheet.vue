<script setup lang="ts">
import { useClipboard } from '@vueuse/core'
import { Building2, CalendarDays, CheckCircle2, Clock, Copy, Crown, FolderKanban, ListTodo, Mail, MapPin, Phone, Users, UsersRound, X } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import UserAvatar from '@/components/common/UserAvatar.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDate, timeAgo } from '@/lib/format'
import { assetUrl, getErrorMessage } from '@/lib/http'
import { cityOf, localTime } from '@/lib/timezone'
import { organizationAddress } from '@/modules/auth/organization-slug'
import { profileCoverStyle } from '@/modules/admin/profile-cover'
import { type OrganizationDetail, superAdminApi } from '../super-admin.api'

/** The super admin's look inside one organization: who runs it, who is in it and how much of its plan it uses. */
const organizationId = defineModel<string | null>('organizationId', { default: null })

const detail = ref<OrganizationDetail | null>(null)
const { copy } = useClipboard()

const isOpen = computed({
  get: () => organizationId.value !== null,
  set: (open) => {
    if (!open) organizationId.value = null
  },
})

watch(
  organizationId,
  async (id) => {
    detail.value = null
    if (!id) return
    try {
      detail.value = await superAdminApi.organization(id)
    } catch (error) {
      toast.error(getErrorMessage(error))
      organizationId.value = null
    }
  },
  { immediate: true },
)

const STATUS = {
  pending: { label: 'Pending', variant: 'warning' },
  approved: { label: 'Approved', variant: 'success' },
  rejected: { label: 'Rejected', variant: 'destructive' },
} as const
const PERSON_STATUS = { active: 'Active', invited: 'Invited', disabled: 'Deactivated' } as const

const usage = computed(() => {
  const value = detail.value
  if (!value) return []
  const row = (label: string, used: number, limit: number | null) => ({
    label,
    used,
    limit,
    percent: limit ? Math.min(100, Math.round((used / limit) * 100)) : 0,
  })
  return [row('People', value.organization.memberCount, value.limits.maxMembers), row('Projects', value.organization.projectCount, value.limits.maxProjects)]
})

const COUNTS = computed(() => {
  const counts = detail.value?.counts
  if (!counts) return []
  return [
    { label: 'Departments', value: counts.departments, icon: Building2 },
    { label: 'Teams', value: counts.teams, icon: UsersRound },
    { label: 'Open tasks', value: counts.openTasks, icon: ListTodo },
    { label: 'Done tasks', value: counts.doneTasks, icon: CheckCircle2 },
  ]
})

const isOnline = (lastSeenAt: string | null) => Boolean(lastSeenAt) && Date.now() - new Date(lastSeenAt!).getTime() < 15 * 60_000

async function copyEmail(email: string) {
  await copy(email)
  toast.success('Email copied')
}
</script>

<template>
  <Sheet v-model:open="isOpen">
    <SheetContent side="right" class="flex w-full flex-col gap-0 p-0 sm:max-w-2xl" hide-close clear-backdrop>
      <header class="flex shrink-0 items-center gap-3 border-b border-border/70 px-5 py-3.5">
        <template v-if="detail">
          <span v-if="detail.organization.logoUrl" class="flex size-10 shrink-0 items-center justify-center overflow-hidden border border-border bg-white">
            <img :src="assetUrl(detail.organization.logoUrl)" alt="" class="size-full object-contain p-1" />
          </span>
          <span v-else class="flex size-10 shrink-0 items-center justify-center bg-brand text-sm font-bold text-white shadow-glow">
            {{ detail.organization.name.slice(0, 2).toUpperCase() }}
          </span>
        </template>
        <Skeleton v-else class="size-10" />
        <div class="min-w-0 flex-1">
          <SheetTitle class="flex items-center gap-2 truncate text-base font-semibold">
            {{ detail?.organization.name ?? 'Organization' }}
            <Badge v-if="detail" :variant="STATUS[detail.organization.status].variant">{{ STATUS[detail.organization.status].label }}</Badge>
          </SheetTitle>
          <SheetDescription class="truncate text-xs">
            {{ detail ? `${organizationAddress(detail.organization.slug)} · created ${formatDate(detail.organization.createdAt, 'd MMM yyyy')}` : 'Loading…' }}
          </SheetDescription>
        </div>
        <Button variant="ghost" size="icon-sm" aria-label="Close" @click="isOpen = false"><X /></Button>
      </header>

      <div class="min-h-0 flex-1 space-y-6 overflow-y-auto p-5 scrollbar-thin">
        <template v-if="!detail">
          <Skeleton class="h-72 w-full" />
          <Skeleton class="h-32 w-full" />
        </template>

        <template v-else>
          <!-- Admins: full profile cards -->
          <section class="space-y-3">
            <h3 class="flex items-center gap-2 text-sm font-semibold"><Crown class="size-4 text-amber-500" /> Organization admins</h3>
            <article v-for="admin in detail.admins" :key="admin.id" class="overflow-hidden border border-border/80 bg-card shadow-soft">
              <div class="h-20" :style="profileCoverStyle(admin.avatarColor)" />
              <div class="px-4 pb-4">
                <div class="-mt-10 flex items-end justify-between gap-3">
                  <span class="relative">
                    <UserAvatar :user="admin" size="xl" class="ring-4 ring-card shadow-md" />
                    <span v-if="isOnline(admin.lastSeenAt)" class="absolute right-1 bottom-1 size-4 rounded-full bg-success ring-3 ring-card" title="Active now" />
                  </span>
                  <Button variant="outline" size="sm" as-child>
                    <a :href="`mailto:${admin.email}`"><Mail /> Email</a>
                  </Button>
                </div>
                <div class="mt-2 space-y-1">
                  <p class="flex flex-wrap items-center gap-2">
                    <span class="text-lg font-semibold tracking-tight">{{ admin.name }}</span>
                    <Badge v-if="admin.isCreator" variant="soft">Created the organization</Badge>
                    <Badge :variant="admin.status === 'active' ? 'success' : admin.status === 'invited' ? 'warning' : 'outline'">{{ PERSON_STATUS[admin.status] }}</Badge>
                  </p>
                  <p class="text-sm text-foreground/80">{{ admin.title || 'No job title yet' }}</p>
                  <p class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span v-if="admin.location" class="inline-flex items-center gap-1"><MapPin class="size-3.5" /> {{ admin.location }}</span>
                    <span class="inline-flex items-center gap-1"><Clock class="size-3.5" /> {{ localTime(admin.timezone) }} · {{ cityOf(admin.timezone) }}</span>
                    <span class="inline-flex items-center gap-1"><CalendarDays class="size-3.5" /> Joined {{ formatDate(admin.joinedAt, 'd MMM yyyy') }}</span>
                    <span>{{ admin.lastSeenAt ? `Active ${timeAgo(admin.lastSeenAt)}` : 'Not signed in yet' }}</span>
                  </p>
                </div>

                <p v-if="admin.about" class="mt-3 text-sm leading-relaxed whitespace-pre-line text-foreground/85">{{ admin.about }}</p>

                <ul class="mt-3 grid gap-2 border-t border-border/60 pt-3 text-sm sm:grid-cols-2">
                  <li class="flex min-w-0 items-center gap-2">
                    <Mail class="size-4 shrink-0 text-muted-foreground" />
                    <a :href="`mailto:${admin.email}`" class="min-w-0 truncate hover:text-primary">{{ admin.email }}</a>
                    <button type="button" class="text-muted-foreground hover:text-foreground" aria-label="Copy email" @click="copyEmail(admin.email)"><Copy class="size-3.5" /></button>
                  </li>
                  <li class="flex items-center gap-2">
                    <Phone class="size-4 shrink-0 text-muted-foreground" />
                    <a v-if="admin.phone" :href="`tel:${admin.phone.replace(/[^\d+]/g, '')}`" class="hover:text-primary">{{ admin.phone }}</a>
                    <span v-else class="text-muted-foreground">No phone number</span>
                  </li>
                </ul>

                <div v-if="admin.skills.length" class="mt-3 flex flex-wrap gap-1.5">
                  <span v-for="skill in admin.skills" :key="skill" class="border border-primary/20 bg-primary/5 px-2 py-0.5 text-xs font-medium text-primary">{{ skill }}</span>
                </div>
              </div>
            </article>
            <p v-if="!detail.admins.length" class="border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">This organization has no admin.</p>
          </section>

          <!-- Plan usage and work -->
          <section class="grid gap-3 sm:grid-cols-2">
            <div class="space-y-3 border border-border/80 bg-card p-4 shadow-soft">
              <h3 class="text-sm font-semibold">Plan · {{ detail.organization.plan?.name ?? 'No plan' }}</h3>
              <div v-for="item in usage" :key="item.label" class="space-y-1">
                <div class="flex items-center justify-between text-xs">
                  <span class="text-muted-foreground">{{ item.label }}</span>
                  <span class="font-medium tabular-nums">{{ item.used }} / {{ item.limit ?? '∞' }}</span>
                </div>
                <Progress :model-value="item.limit ? item.percent : 0" class="h-1.5" :indicator-class="item.percent >= 90 ? 'bg-destructive' : 'bg-brand'" />
              </div>
            </div>
            <div class="grid grid-cols-2 gap-2">
              <div v-for="item in COUNTS" :key="item.label" class="border border-border/80 bg-card p-3 shadow-soft">
                <component :is="item.icon" class="mb-1.5 size-4 text-muted-foreground" />
                <span class="block text-xl leading-none font-semibold tabular-nums">{{ item.value }}</span>
                <span class="mt-1 block text-[11px] text-muted-foreground">{{ item.label }}</span>
              </div>
            </div>
          </section>

          <!-- Everyone else -->
          <section class="space-y-2">
            <h3 class="flex items-center gap-2 text-sm font-semibold"><Users class="size-4 text-muted-foreground" /> Members <span class="text-xs font-normal text-muted-foreground">{{ detail.members.length }}</span></h3>
            <ul v-if="detail.members.length" class="divide-y divide-border/60 border border-border/70">
              <li v-for="member in detail.members" :key="member.id" class="flex items-center gap-3 px-3 py-2.5">
                <UserAvatar :user="member" size="md" />
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-sm font-medium">{{ member.name }}</span>
                  <span class="block truncate text-xs text-muted-foreground">{{ member.title ? `${member.title} · ` : '' }}{{ member.email }}</span>
                </span>
                <Badge :variant="member.status === 'active' ? 'secondary' : member.status === 'invited' ? 'warning' : 'outline'">{{ PERSON_STATUS[member.status] }}</Badge>
              </li>
            </ul>
            <p v-else class="flex items-center gap-2 border border-dashed px-4 py-4 text-sm text-muted-foreground"><FolderKanban class="size-4" /> No other members yet.</p>
          </section>
        </template>
      </div>
    </SheetContent>
  </Sheet>
</template>

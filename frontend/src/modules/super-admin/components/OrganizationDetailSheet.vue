<script setup lang="ts">
import { useClipboard } from '@vueuse/core'
import {
  ArrowLeft,
  Ban,
  Building2,
  CalendarDays,
  CheckCircle2,
  CircleCheck,
  Clock,
  Copy,
  Crown,
  FolderKanban,
  Gem,
  Link2,
  ListTodo,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  ShieldCheck,
  Users,
  UsersRound,
  X,
} from 'lucide-vue-next'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import OrganizationLogo from '@/components/common/OrganizationLogo.vue'
import UserAvatar from '@/components/common/UserAvatar.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDate, timeAgo } from '@/lib/format'
import { assetUrl, getErrorMessage } from '@/lib/http'
import { cityOf, localTime } from '@/lib/timezone'
import { organizationAddress, organizationUrl } from '@/modules/auth/organization-slug'
import { profileCoverStyle } from '@/modules/admin/profile-cover'
import SupportChatThread from '@/modules/support/components/SupportChatThread.vue'
import { type DisappearHours, portalSupportApi } from '@/modules/support/support.api'
import { getSocket } from '@/lib/realtime'
import { type OrganizationDetail, type OrganizationPerson, superAdminApi } from '../super-admin.api'

/** The super admin's look inside one organization: who runs it, who is in it and how much of its plan it uses. */
const organizationId = defineModel<string | null>('organizationId', { default: null })
/** Unread messages from this organization, shown on the Chat button. */
defineProps<{ unread?: number }>()
const emit = defineEmits<{ read: [organizationId: string] }>()

const detail = ref<OrganizationDetail | null>(null)
const view = ref<'details' | 'chat'>('details')

/** Like a messaging app: "online" when an admin was active in the last few minutes, otherwise when they were last seen. */
const adminsOnline = computed(() => (detail.value?.admins ?? []).some((admin) => admin.isOnline))
const chatPresence = computed(() => {
  const admins = detail.value?.admins ?? []
  const who = admins.length === 1 ? admins[0]!.name.split(' ')[0] : `${admins.length} admins`
  if (adminsOnline.value) return `${who} · online`
  const lastSeen = admins.map((admin) => admin.lastSeenAt).filter(Boolean).sort().at(-1)
  return lastSeen ? `${who} · last seen ${timeAgo(lastSeen)}` : `${who} · not signed in yet`
})

const chatOrganizationId = () => detail.value!.organization.id
const loadChat = () => portalSupportApi.thread(chatOrganizationId())
const sendChat = (body: string) => portalSupportApi.send(chatOrganizationId(), body)
const markChatRead = () => portalSupportApi.markRead(chatOrganizationId())
const removeChatMessage = (messageId: string) => portalSupportApi.remove(chatOrganizationId(), messageId)
const setChatDisappearing = (hours: DisappearHours) => portalSupportApi.setDisappearing(chatOrganizationId(), hours)
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
    view.value = 'details'
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
  pending: { label: 'Pending', variant: 'warning', icon: Clock },
  approved: { label: 'Approved', variant: 'success', icon: CircleCheck },
  rejected: { label: 'Rejected', variant: 'destructive', icon: Ban },
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

/** People come online and go offline while the panel is open; their dot and "last seen" follow along. */
function onPresence(event: { userId: string; online: boolean; lastSeenAt: string }) {
  if (!detail.value) return
  const update = (person: OrganizationPerson) => (person.id === event.userId ? { ...person, isOnline: event.online, lastSeenAt: event.lastSeenAt } : person)
  detail.value = { ...detail.value, admins: detail.value.admins.map(update), members: detail.value.members.map(update) }
}
onMounted(() => getSocket()?.on('presence:changed', onPresence))
onBeforeUnmount(() => getSocket()?.off('presence:changed', onPresence))

async function copyEmail(email: string) {
  await copy(email)
  toast.success('Email copied')
}
</script>

<template>
  <Sheet v-model:open="isOpen">
    <SheetContent side="right" class="flex w-full flex-col gap-0 p-0 sm:max-w-2xl" hide-close clear-backdrop>
      <!-- Chat view: the conversation with this organization's admins -->
      <template v-if="view === 'chat' && detail">
        <header class="flex shrink-0 items-center gap-3 border-b border-border/70 px-4 py-3">
          <Button variant="ghost" size="icon-sm" aria-label="Back to details" @click="view = 'details'"><ArrowLeft /></Button>
          <div class="flex -space-x-2">
            <UserAvatar v-for="admin in detail.admins.slice(0, 3)" :key="admin.id" :user="admin" size="md" class="ring-2 ring-card" />
          </div>
          <div class="min-w-0 flex-1">
            <SheetTitle class="truncate text-base font-semibold">Chat with {{ detail.organization.name }}</SheetTitle>
            <SheetDescription class="flex items-center gap-1.5 truncate text-xs">
              <span v-if="adminsOnline" class="size-2 shrink-0 rounded-full bg-[#25d366]" />
              {{ chatPresence }}
            </SheetDescription>
          </div>
          <Button variant="ghost" size="icon-sm" aria-label="Close" @click="isOpen = false"><X /></Button>
        </header>
        <SupportChatThread
          class="min-h-0 flex-1"
          side="portal"
          :organization-id="detail.organization.id"
          :load="loadChat"
          :send="sendChat"
          :mark-read="markChatRead"
          :remove="removeChatMessage"
          :set-disappearing="setChatDisappearing"
          placeholder="Type a message"
          :notice="`Messages are shared with every admin of ${detail.organization.name}. They read and reply in Organization settings → Vector support.`"
          @read="emit('read', detail!.organization.id)"
        />
      </template>

      <template v-else>
      <header class="relative shrink-0 border-b border-border/70">
        <div
          class="h-14"
          style="
            background:
              radial-gradient(circle at 85% 15%, rgb(255 255 255 / 0.25), transparent 45%),
              linear-gradient(120deg, var(--brand-from), var(--brand-to));
          "
        />
        <Button
          variant="ghost"
          size="icon-sm"
          class="absolute top-3 right-3 bg-black/20 text-white backdrop-blur-sm hover:bg-black/35 hover:text-white"
          aria-label="Close"
          @click="isOpen = false"
        >
          <X />
        </Button>

        <div class="px-5 pt-4 pb-4">
          <!-- Shown the way the organization sees it in its own sidebar: the full logo, unboxed. -->
          <Skeleton v-if="!detail" class="h-14 w-40" />
          <OrganizationLogo
            v-else-if="detail.organization.logoUrl"
            :src="assetUrl(detail.organization.logoUrl)!"
            :alt="detail.organization.name"
            size="lg"
            bare
            class="h-14 max-w-64"
          />
          <span v-else class="flex size-14 items-center justify-center bg-brand text-lg font-bold text-white shadow-glow">
            {{ detail.organization.name.slice(0, 2).toUpperCase() }}
          </span>

          <SheetTitle class="mt-3 flex flex-wrap items-center gap-2 text-xl font-semibold tracking-tight">
            {{ detail?.organization.name ?? 'Organization' }}
            <Badge v-if="detail" :variant="STATUS[detail.organization.status].variant">
              <component :is="STATUS[detail.organization.status].icon" /> {{ STATUS[detail.organization.status].label }}
            </Badge>
          </SheetTitle>
          <SheetDescription as="div" class="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <template v-if="detail">
              <a
                :href="organizationUrl(detail.organization.slug)"
                target="_blank"
                rel="noopener"
                class="inline-flex items-center gap-1 transition-colors hover:text-primary"
                title="Open the organization's address"
              >
                <Link2 class="size-3.5" /> {{ organizationAddress(detail.organization.slug) }}
              </a>
              <span class="inline-flex items-center gap-1"><CalendarDays class="size-3.5" /> Created {{ formatDate(detail.organization.createdAt, 'd MMM yyyy') }}</span>
              <span class="inline-flex items-center gap-1"><Gem class="size-3.5" /> {{ detail.organization.plan?.name ?? 'No plan' }} plan</span>
              <span class="inline-flex items-center gap-1"><Users class="size-3.5" /> {{ detail.organization.memberCount }} people</span>
              <span v-if="detail.organization.reviewedAt" class="inline-flex items-center gap-1">
                <ShieldCheck class="size-3.5" /> Reviewed {{ formatDate(detail.organization.reviewedAt, 'd MMM yyyy') }}
              </span>
            </template>
            <span v-else>Loading…</span>
          </SheetDescription>
          <p
            v-if="detail?.organization.status === 'rejected' && detail.organization.rejectionReason"
            class="mt-2 border-l-2 border-destructive bg-destructive/5 px-2.5 py-1.5 text-xs text-destructive"
          >
            Reason: {{ detail.organization.rejectionReason }}
          </p>
        </div>
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
                    <span v-if="admin.isOnline" class="absolute right-1 bottom-1 size-4 rounded-full bg-success ring-3 ring-card" title="Online now" />
                  </span>
                  <div class="flex items-center gap-2">
                    <Button variant="brand" size="sm" @click="view = 'chat'">
                      <MessageCircle /> Chat
                      <span v-if="unread" class="bg-white/25 px-1.5 text-[10px] font-semibold tabular-nums">{{ unread }}</span>
                    </Button>
                    <Button variant="outline" size="sm" as-child>
                      <a :href="`mailto:${admin.email}`"><Mail /> Email</a>
                    </Button>
                  </div>
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
                    <span>{{ admin.isOnline ? 'Online now' : admin.lastSeenAt ? `Last seen ${timeAgo(admin.lastSeenAt)}` : 'Not signed in yet' }}</span>
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
      </template>
    </SheetContent>
  </Sheet>
</template>

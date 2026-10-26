<script setup lang="ts">
import { Check, ChevronsUpDown, Link2, Plus, Settings2 } from 'lucide-vue-next'
import { useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { assetUrl, getErrorMessage } from '@/lib/http'
import { useAuthStore } from '@/modules/auth/auth.store'
import { organizationAddress, organizationUrl } from '@/modules/auth/organization-slug'
import type { OrganizationSummary } from '@/types/models'
import BrandMark from './BrandMark.vue'

/** The sidebar's brand area: shows the current organization and switches between the person's organizations. */
defineProps<{ compact?: boolean }>()

const auth = useAuthStore()
const router = useRouter()

const TILE_COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#8b5cf6', '#14b8a6']
const tileColor = (organization: OrganizationSummary) => TILE_COLORS[[...organization.slug].reduce((total, char) => total + char.charCodeAt(0), 0) % TILE_COLORS.length]

async function open(organization: OrganizationSummary) {
  if (organization.id === auth.organization?.id) return
  try {
    await auth.switchOrganization(organization.id)
  } catch (error) {
    toast.error(getErrorMessage(error))
  }
}

async function copyLink() {
  if (!auth.organization) return
  await navigator.clipboard.writeText(organizationUrl(auth.organization.slug))
  toast.success('Organization link copied', { description: 'Members who open it land in this organization.' })
}
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger
      class="group flex min-w-0 items-center gap-2.5 p-1 text-left transition-colors hover:bg-card hover:shadow-soft focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      :class="compact ? 'justify-center' : 'flex-1'"
      :aria-label="`Organization: ${auth.organization?.name ?? 'none'}. Switch organization`"
    >
      <span
        v-if="auth.organization?.logoUrl"
        class="flex size-8 shrink-0 items-center justify-center overflow-hidden border border-border bg-white transition-transform duration-200 group-hover:-rotate-3"
      >
        <img :src="assetUrl(auth.organization.logoUrl)" alt="" class="size-full object-contain p-0.5" />
      </span>
      <span v-else class="relative flex size-8 shrink-0 items-center justify-center overflow-hidden bg-brand text-white shadow-glow transition-transform duration-200 group-hover:-rotate-3">
        <span class="pointer-events-none absolute inset-0" style="background: radial-gradient(circle at 15% 5%, rgb(255 255 255 / 0.25), transparent 60%)" />
        <BrandMark class="relative size-[22px]" />
      </span>
      <span v-if="!compact" class="min-w-0 flex-1">
        <span class="block truncate text-[15px] leading-tight font-semibold tracking-tight">{{ auth.organization?.name ?? 'Vector' }}</span>
        <span class="block truncate text-[11px] leading-tight text-muted-foreground">{{ auth.organization ? `/${auth.organization.slug}` : 'No organization' }}</span>
      </span>
      <ChevronsUpDown v-if="!compact" class="size-4 shrink-0 text-muted-foreground" />
    </DropdownMenuTrigger>

    <DropdownMenuContent align="start" class="w-72">
      <DropdownMenuLabel>Your organizations</DropdownMenuLabel>
      <DropdownMenuItem v-for="organization in auth.organizations" :key="organization.id" class="py-2" @select="open(organization)">
        <span v-if="organization.logoUrl" class="flex size-8 shrink-0 items-center justify-center overflow-hidden border border-border bg-white">
          <img :src="assetUrl(organization.logoUrl)" alt="" class="size-full object-contain p-0.5" />
        </span>
        <span v-else class="flex size-8 shrink-0 items-center justify-center text-xs font-bold text-white" :style="{ backgroundColor: tileColor(organization) }">
          {{ organization.name.slice(0, 2).toUpperCase() }}
        </span>
        <span class="min-w-0 flex-1">
          <span class="block truncate text-sm font-medium text-foreground">{{ organization.name }}</span>
          <span class="block truncate text-xs text-muted-foreground">
            {{ organization.role === 'admin' ? 'Admin' : 'Member' }} · {{ organization.memberCount ?? 0 }} people · {{ organization.projectCount ?? 0 }} projects
          </span>
        </span>
        <Check v-if="organization.id === auth.organization?.id" class="size-4 text-primary" aria-label="Current organization" />
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem @select="router.push({ name: 'organization-create' })"><Plus /> Create organization</DropdownMenuItem>
      <DropdownMenuItem v-if="auth.organization" :title="organizationAddress(auth.organization.slug)" @select="copyLink"><Link2 /> Copy organization link</DropdownMenuItem>
      <DropdownMenuItem v-if="auth.isOrganizationAdmin" @select="router.push({ name: 'workspace-admin' })"><Settings2 /> Organization settings</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>

<script setup lang="ts">
import { Ban, Building2, Clock, LogOut, RefreshCw } from 'lucide-vue-next'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { assetUrl, getErrorMessage } from '@/lib/http'
import { useWorkspaceStore } from '@/stores/workspace.store'
import { useAuthStore } from '../auth.store'
import AuthHeading from '../components/AuthHeading.vue'
import { organizationAddress } from '../organization-slug'

/** Shown while the current organization is pending or was rejected by the super admin. */
const auth = useAuthStore()
const workspace = useWorkspaceStore()
const router = useRouter()
const isChecking = ref(false)

const organization = computed(() => auth.organization)
const isRejected = computed(() => organization.value?.status === 'rejected')
const otherOrganizations = computed(() => auth.organizations.filter((item) => item.id !== organization.value?.id && item.status === 'approved'))

async function checkAgain(silent = false) {
  isChecking.value = true
  try {
    await auth.refreshSession()
    if (!silent && auth.isOrganizationBlocked) toast.info(isRejected.value ? 'This organization is still not approved' : 'Still waiting for approval')
  } catch (error) {
    if (!silent) toast.error(getErrorMessage(error))
  } finally {
    isChecking.value = false
  }
}

watch(
  () => auth.isOrganizationBlocked,
  (blocked) => {
    if (blocked) return
    toast.success(`${organization.value?.name ?? 'Your organization'} is approved`, { description: 'Welcome to Vector!' })
    void router.replace({ name: 'home' })
  },
)

// Approval arrives in real time; the poll is a fallback when the live connection is unavailable.
let poll: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  workspace.bindRealtime()
  poll = setInterval(() => void checkAgain(true), 30_000)
})
onBeforeUnmount(() => clearInterval(poll))

function signOut() {
  void auth.logout()
}
</script>

<template>
  <AuthHeading
    :title="isRejected ? 'Organization not approved' : 'Waiting for approval'"
    :description="
      isRejected
        ? 'The portal administrator did not approve this organization, so it cannot be used.'
        : 'Your organization was created. The portal administrator reviews every new organization before it can be used.'
    "
  />

  <div v-if="organization" class="flex items-center gap-3 border border-border bg-card p-3.5 shadow-soft">
    <span v-if="organization.logoUrl" class="flex size-10 shrink-0 items-center justify-center overflow-hidden border border-border bg-white">
      <img :src="assetUrl(organization.logoUrl)" alt="" class="size-full object-contain p-0.5" />
    </span>
    <span v-else class="flex size-10 shrink-0 items-center justify-center bg-primary/10 text-primary"><Building2 class="size-5" /></span>
    <span class="min-w-0 flex-1">
      <span class="block truncate font-medium">{{ organization.name }}</span>
      <span class="block truncate text-xs text-muted-foreground">{{ organizationAddress(organization.slug) }}</span>
    </span>
    <Badge :variant="isRejected ? 'destructive' : 'warning'">
      <component :is="isRejected ? Ban : Clock" /> {{ isRejected ? 'Not approved' : 'Pending' }}
    </Badge>
  </div>

  <p v-if="isRejected && organization?.rejectionReason" class="mt-3 border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-sm">
    <span class="font-medium">Reason:</span> {{ organization.rejectionReason }}
  </p>
  <p class="mt-4 text-sm text-muted-foreground">
    {{
      isRejected
        ? 'If you think this is a mistake, contact the portal administrator.'
        : 'You will get an email as soon as it is approved. This page also updates by itself.'
    }}
  </p>

  <Button class="mt-5 w-full" size="lg" variant="outline" :loading="isChecking" @click="checkAgain()"><RefreshCw /> Check again</Button>

  <div v-if="otherOrganizations.length" class="mt-6 space-y-2">
    <p class="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Your other organizations</p>
    <button
      v-for="item in otherOrganizations"
      :key="item.id"
      type="button"
      class="flex w-full items-center gap-3 border border-border bg-card px-3 py-2.5 text-left text-sm transition-colors hover:bg-accent/40"
      @click="auth.switchOrganization(item.id)"
    >
      <Building2 class="size-4 text-muted-foreground" />
      <span class="min-w-0 flex-1 truncate font-medium">{{ item.name }}</span>
      <span class="text-xs text-muted-foreground">Open</span>
    </button>
  </div>

  <div class="mt-6 flex justify-center">
    <Button variant="ghost" size="sm" @click="signOut"><LogOut /> Sign out ({{ auth.user?.email }})</Button>
  </div>
</template>

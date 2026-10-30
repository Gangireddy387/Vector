<script setup lang="ts">
import { Crown, Download, Keyboard, LogOut, Monitor, Moon, Settings, ShieldCheck, Sun } from 'lucide-vue-next'
import { useRouter } from 'vue-router'
import UserAvatar from '@/components/common/UserAvatar.vue'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { toast } from 'vue-sonner'
import { computed } from 'vue'
import PresenceBadge from '@/components/common/PresenceBadge.vue'
import { usePwaInstall } from '@/composables/usePwaInstall'
import { type ThemePreference, useTheme } from '@/composables/useTheme'
import { type ChosenPresence, PRESENCE_CHOICES, PRESENCE_LOOK } from '@/lib/presence'
import { useAuthStore } from '@/modules/auth/auth.store'
import { usePresenceStore } from '@/stores/presence.store'

defineProps<{ collapsed?: boolean }>()
defineEmits<{ showShortcuts: [] }>()

const auth = useAuthStore()
const router = useRouter()
const { preference } = useTheme()
const { canInstall, install } = usePwaInstall()

const THEMES: Array<{ value: ThemePreference; label: string; icon: typeof Sun }> = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'auto', label: 'System', icon: Monitor },
]

async function signOut() {
  await auth.logout()
}

const presence = usePresenceStore()
/** What this person sees as their own status: their choice ("Appear offline"), else what others see. */
const myStatus = computed(() => presence.statusOf(auth.user?.id) ?? 'available')
const myLabel = computed(() => PRESENCE_CHOICES.find((choice) => choice.value === presence.chosen && choice.value)?.label ?? PRESENCE_LOOK[myStatus.value].label)

async function choose(value: ChosenPresence) {
  try {
    await presence.choose(value)
  } catch (error) {
    toast.error(error instanceof Error ? error.message : 'Could not change your status')
  }
}
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger
      class="flex w-full items-center gap-2.5 p-2 text-left transition-colors hover:bg-card hover:shadow-soft focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      :class="collapsed && 'justify-center'"
      aria-label="Account menu"
    >
      <span class="relative inline-flex shrink-0">
        <UserAvatar :user="auth.user" size="md" />
        <PresenceBadge :status="myStatus" size="sm" class="absolute -right-0.5 -bottom-0.5" />
      </span>
      <span v-if="!collapsed" class="min-w-0 flex-1">
        <span class="block truncate text-sm font-medium">{{ auth.user?.name }}</span>
        <span class="block truncate text-xs" :class="PRESENCE_LOOK[myStatus].text">{{ myLabel }}</span>
      </span>
    </DropdownMenuTrigger>
    <DropdownMenuContent side="top" align="start" class="w-60">
      <DropdownMenuLabel>{{ auth.user?.email }}</DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuLabel class="text-xs text-muted-foreground">Status</DropdownMenuLabel>
      <DropdownMenuCheckboxItem
        v-for="choice in PRESENCE_CHOICES"
        :key="choice.label"
        :model-value="presence.chosen === choice.value"
        @select="choose(choice.value)"
      >
        <PresenceBadge :status="choice.status" size="sm" /> {{ choice.label }}
      </DropdownMenuCheckboxItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem @select="router.push({ name: 'settings' })"><Settings /> Settings</DropdownMenuItem>
      <DropdownMenuItem v-if="auth.isOrganizationAdmin" @select="router.push({ name: 'workspace-admin' })">
        <ShieldCheck /> Organization settings
      </DropdownMenuItem>
      <DropdownMenuItem v-if="auth.isSuperAdmin" @select="router.push({ name: 'super-admin' })"><Crown /> Super admin</DropdownMenuItem>
      <DropdownMenuItem @select="$emit('showShortcuts')"><Keyboard /> Keyboard shortcuts</DropdownMenuItem>
      <DropdownMenuItem v-if="canInstall" @select="install"><Download /> Install app</DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuLabel>Appearance</DropdownMenuLabel>
      <DropdownMenuCheckboxItem
        v-for="theme in THEMES"
        :key="theme.value"
        :model-value="preference === theme.value"
        @select="preference = theme.value"
      >
        <component :is="theme.icon" /> {{ theme.label }}
      </DropdownMenuCheckboxItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem variant="destructive" @select="signOut"><LogOut /> Sign out</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>

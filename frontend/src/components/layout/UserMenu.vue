<script setup lang="ts">
import { Download, Keyboard, LogOut, Monitor, Moon, Settings, ShieldCheck, Sun } from 'lucide-vue-next'
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
import { usePwaInstall } from '@/composables/usePwaInstall'
import { type ThemePreference, useTheme } from '@/composables/useTheme'
import { useAuthStore } from '@/modules/auth/auth.store'
import { useNotificationsStore } from '@/modules/notifications/notifications.store'

defineProps<{ collapsed?: boolean }>()
defineEmits<{ showShortcuts: [] }>()

const auth = useAuthStore()
const notifications = useNotificationsStore()
const router = useRouter()
const { preference } = useTheme()
const { canInstall, install } = usePwaInstall()

const THEMES: Array<{ value: ThemePreference; label: string; icon: typeof Sun }> = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'auto', label: 'System', icon: Monitor },
]

async function signOut() {
  auth.logout()
  notifications.reset()
  await router.push({ name: 'login' })
}
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger
      class="flex w-full items-center gap-2.5 p-2 text-left transition-colors hover:bg-card hover:shadow-soft focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      :class="collapsed && 'justify-center'"
      aria-label="Account menu"
    >
      <UserAvatar :user="auth.user" size="md" />
      <span v-if="!collapsed" class="min-w-0 flex-1">
        <span class="block truncate text-sm font-medium">{{ auth.user?.name }}</span>
        <span class="block truncate text-xs text-muted-foreground">{{ auth.user?.email }}</span>
      </span>
    </DropdownMenuTrigger>
    <DropdownMenuContent side="top" align="start" class="w-60">
      <DropdownMenuLabel>{{ auth.user?.email }}</DropdownMenuLabel>
      <DropdownMenuItem @select="router.push({ name: 'settings' })"><Settings /> Settings</DropdownMenuItem>
      <DropdownMenuItem v-if="auth.isOrganizationAdmin" @select="router.push({ name: 'workspace-admin' })">
        <ShieldCheck /> Organization settings
      </DropdownMenuItem>
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

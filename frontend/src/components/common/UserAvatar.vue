<script setup lang="ts">
import { User as UserIcon } from 'lucide-vue-next'
import { computed } from 'vue'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { assetUrl } from '@/lib/http'
import { cn, initials } from '@/lib/utils'
import { usePresenceStore } from '@/stores/presence.store'
import type { UserSummary } from '@/types/models'
import PresenceBadge from './PresenceBadge.vue'

const props = withDefaults(
  defineProps<{
    user?: UserSummary | null
    size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
    showTooltip?: boolean
    /** Shows the person's live status (available, away, in a call…) on the avatar. */
    presence?: boolean
    class?: string
  }>(),
  { size: 'sm', showTooltip: false, presence: false },
)

const SIZE_CLASSES = {
  xs: 'size-5 text-[9px]',
  sm: 'size-6 text-[10px]',
  md: 'size-8 text-xs',
  lg: 'size-11 text-sm',
  xl: 'size-20 text-2xl',
}
const BADGE_SIZES = { xs: 'xs', sm: 'xs', md: 'sm', lg: 'md', xl: 'lg' } as const

const presenceStore = usePresenceStore()
const sizeClass = computed(() => SIZE_CLASSES[props.size])
const label = computed(() => props.user?.name ?? 'Unassigned')
const photo = computed(() => assetUrl(props.user?.avatarUrl))
/** Guests in calls have ids like "guest:…" and no presence. */
const status = computed(() => (props.presence && props.user?.id && !props.user.id.startsWith('guest:') ? presenceStore.statusOf(props.user.id) : null))
const tooltip = computed(() => (status.value ? `${label.value} · ${presenceStore.describe(props.user?.id)}` : label.value))
</script>

<template>
  <Tooltip v-if="showTooltip" :delay-duration="300">
    <TooltipTrigger as-child>
      <span class="relative inline-flex">
        <Avatar :class="cn(sizeClass, props.class)" :aria-label="label">
          <AvatarImage v-if="photo" :src="photo" :alt="label" class="object-cover" />
          <AvatarFallback v-if="user" class="font-semibold text-white" :style="{ backgroundColor: user.avatarColor }">
            {{ initials(user.name) }}
          </AvatarFallback>
          <AvatarFallback v-else class="border border-dashed border-muted-foreground/40 bg-transparent text-muted-foreground">
            <UserIcon class="size-3/5" />
          </AvatarFallback>
        </Avatar>
        <PresenceBadge v-if="status" :status="status" :size="BADGE_SIZES[size]" class="absolute -right-0.5 -bottom-0.5" />
      </span>
    </TooltipTrigger>
    <TooltipContent>{{ tooltip }}</TooltipContent>
  </Tooltip>
  <span v-else-if="status" class="relative inline-flex shrink-0" :title="tooltip">
    <Avatar :class="cn(sizeClass, props.class)" :aria-label="label">
      <AvatarImage v-if="photo" :src="photo" :alt="label" class="object-cover" />
      <AvatarFallback v-if="user" class="font-semibold text-white" :style="{ backgroundColor: user.avatarColor }">
        {{ initials(user.name) }}
      </AvatarFallback>
    </Avatar>
    <PresenceBadge :status="status" :size="BADGE_SIZES[size]" class="absolute -right-0.5 -bottom-0.5" />
  </span>
  <Avatar v-else :class="cn(sizeClass, props.class)" :aria-label="label">
    <AvatarImage v-if="photo" :src="photo" :alt="label" class="object-cover" />
    <AvatarFallback v-if="user" class="font-semibold text-white" :style="{ backgroundColor: user.avatarColor }">
      {{ initials(user.name) }}
    </AvatarFallback>
    <AvatarFallback v-else class="border border-dashed border-muted-foreground/40 bg-transparent text-muted-foreground">
      <UserIcon class="size-3/5" />
    </AvatarFallback>
  </Avatar>
</template>

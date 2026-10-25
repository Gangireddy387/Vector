<script setup lang="ts">
import { User as UserIcon } from 'lucide-vue-next'
import { computed } from 'vue'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { assetUrl } from '@/lib/http'
import { cn, initials } from '@/lib/utils'
import type { UserSummary } from '@/types/models'

const props = withDefaults(
  defineProps<{
    user?: UserSummary | null
    size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
    showTooltip?: boolean
    class?: string
  }>(),
  { size: 'sm', showTooltip: false },
)

const SIZE_CLASSES = {
  xs: 'size-5 text-[9px]',
  sm: 'size-6 text-[10px]',
  md: 'size-8 text-xs',
  lg: 'size-11 text-sm',
  xl: 'size-20 text-2xl',
}

const sizeClass = computed(() => SIZE_CLASSES[props.size])
const label = computed(() => props.user?.name ?? 'Unassigned')
const photo = computed(() => assetUrl(props.user?.avatarUrl))
</script>

<template>
  <Tooltip v-if="showTooltip" :delay-duration="300">
    <TooltipTrigger as-child>
      <span class="inline-flex">
        <Avatar :class="cn(sizeClass, props.class)" :aria-label="label">
          <AvatarImage v-if="photo" :src="photo" :alt="label" class="object-cover" />
          <AvatarFallback v-if="user" class="font-semibold text-white" :style="{ backgroundColor: user.avatarColor }">
            {{ initials(user.name) }}
          </AvatarFallback>
          <AvatarFallback v-else class="border border-dashed border-muted-foreground/40 bg-transparent text-muted-foreground">
            <UserIcon class="size-3/5" />
          </AvatarFallback>
        </Avatar>
      </span>
    </TooltipTrigger>
    <TooltipContent>{{ label }}</TooltipContent>
  </Tooltip>
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

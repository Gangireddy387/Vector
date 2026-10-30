<script setup lang="ts">
import { Check, Clock3, Minus, Undo2, X } from 'lucide-vue-next'
import { computed } from 'vue'
import { PRESENCE_LOOK, type PresenceStatus } from '@/lib/presence'
import { cn } from '@/lib/utils'

/** The small status mark on an avatar, shaped like Teams': a tick, a clock, a bar, or an empty ring when offline. */
const props = withDefaults(defineProps<{ status: PresenceStatus; size?: 'xs' | 'sm' | 'md' | 'lg'; class?: string }>(), { size: 'sm' })

const SIZES = { xs: 'size-2.5', sm: 'size-3', md: 'size-3.5', lg: 'size-4' }
const ICON_SIZES = { xs: 'size-1.5', sm: 'size-2', md: 'size-2.5', lg: 'size-3' }
const icon = computed(() => ({ available: Check, away: Clock3, brb: Undo2, busy: null, 'in-call': null, dnd: Minus, offline: X })[props.status])
const look = computed(() => PRESENCE_LOOK[props.status])
</script>

<template>
  <span
    :class="
      cn(
        'flex items-center justify-center rounded-full ring-2 ring-card',
        SIZES[size],
        status === 'offline' ? 'border border-muted-foreground/60 bg-card text-muted-foreground' : `${look.dot} text-white`,
        props.class,
      )
    "
    :title="look.label"
    role="img"
    :aria-label="look.label"
  >
    <component :is="icon" v-if="icon && size !== 'xs'" :class="ICON_SIZES[size]" :stroke-width="3.5" />
  </span>
</template>

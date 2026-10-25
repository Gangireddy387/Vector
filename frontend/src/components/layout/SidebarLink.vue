<script setup lang="ts">
import type { Component } from 'vue'
import type { RouteLocationRaw } from 'vue-router'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

withDefaults(
  defineProps<{
    to: RouteLocationRaw
    label: string
    icon?: Component
    color?: string
    badge?: number
    collapsed?: boolean
    exact?: boolean
    nested?: boolean
  }>(),
  { collapsed: false, exact: false, nested: false },
)
</script>

<template>
  <RouterLink v-slot="{ href, navigate, isActive, isExactActive }" :to="to" custom>
    <Tooltip :disabled="!collapsed" :delay-duration="100">
      <TooltipTrigger as-child>
        <a
          :href="href"
          :aria-current="(exact ? isExactActive : isActive) ? 'page' : undefined"
          :class="
            cn(
              'group relative flex h-9 items-center gap-2.5 px-2.5 text-sm text-sidebar-foreground/75 transition-all hover:bg-card/80 hover:text-sidebar-foreground',
              (exact ? isExactActive : isActive) &&
                'bg-card font-medium text-primary shadow-soft before:absolute before:top-1/2 before:-left-3 before:h-5 before:w-1 before:-translate-y-1/2 before:bg-brand',
              nested && 'h-8 pl-8 text-[13px] before:hidden',
              collapsed && 'justify-center px-0',
            )
          "
          @click="navigate"
        >
          <span v-if="color" class="size-2.5 shrink-0" :style="{ backgroundColor: color }" />
          <component :is="icon" v-else-if="icon" class="size-4 shrink-0" />
          <span v-if="!collapsed" class="min-w-0 flex-1 truncate">{{ label }}</span>
          <span
            v-if="badge && !collapsed"
            class="ml-auto flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] leading-none font-semibold text-primary-foreground tabular-nums"
          >
            {{ badge > 99 ? '99+' : badge }}
          </span>
        </a>
      </TooltipTrigger>
      <TooltipContent side="right">{{ label }}</TooltipContent>
    </Tooltip>
  </RouterLink>
</template>

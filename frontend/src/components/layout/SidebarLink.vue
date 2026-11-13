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
    /** Keyboard shortcut, e.g. "G I": shown on hover and in the collapsed tooltip. */
    shortcut?: string
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
              'group relative flex h-8 items-center gap-2.5 rounded-md px-2 text-[13px] text-sidebar-foreground/75 transition-colors hover:bg-sidebar-accent/70 hover:text-sidebar-foreground',
              (exact ? isExactActive : isActive) && 'bg-sidebar-accent font-medium text-sidebar-foreground',
              nested && 'h-7 pl-7 text-[12.5px]',
              collapsed && 'justify-center px-0',
            )
          "
          @click="navigate"
        >
          <span v-if="color" class="size-2.5 shrink-0 rounded-[3px]" :style="{ backgroundColor: color }" />
          <component
            :is="icon"
            v-else-if="icon"
            class="size-4 shrink-0 transition-colors"
            :class="(exact ? isExactActive : isActive) ? 'text-primary' : 'text-muted-foreground group-hover:text-sidebar-foreground'"
          />
          <span v-if="!collapsed" class="min-w-0 flex-1 truncate">{{ label }}</span>
          <span
            v-if="badge && !collapsed"
            class="ml-auto flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary/12 px-1.5 text-[10.5px] leading-none font-semibold text-primary tabular-nums dark:bg-primary/20"
          >
            {{ badge > 99 ? '99+' : badge }}
          </span>
          <span v-else-if="badge && collapsed" class="absolute top-1 right-1.5 size-1.5 rounded-full bg-primary" />
          <span
            v-else-if="shortcut && !collapsed"
            class="ml-auto hidden items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 lg:flex"
            aria-hidden="true"
          >
            <kbd v-for="key in shortcut.split(' ')" :key="key" class="rounded-[4px] border border-border bg-card px-1 font-sans text-[10px] leading-4 font-medium text-muted-foreground">
              {{ key }}
            </kbd>
          </span>
        </a>
      </TooltipTrigger>
      <TooltipContent side="right" class="flex items-center gap-2">
        {{ label }}
        <span v-if="shortcut" class="text-[10.5px] opacity-70">{{ shortcut }}</span>
      </TooltipContent>
    </Tooltip>
  </RouterLink>
</template>

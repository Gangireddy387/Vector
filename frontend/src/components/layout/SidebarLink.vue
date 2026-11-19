<script setup lang="ts">
import { Lock } from 'lucide-vue-next'
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
    /** Plan-gated teaser: muted look, still navigates to the unlock page. */
    locked?: boolean
  }>(),
  { collapsed: false, exact: false, nested: false, locked: false },
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
              'group relative flex h-8 items-center gap-2.5 rounded-lg px-2 text-[13px] text-sidebar-foreground/75 transition-[background-color,color,transform,box-shadow] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-sidebar-accent/70 hover:text-sidebar-foreground active:scale-[0.98]',
              (exact ? isExactActive : isActive) &&
                !locked &&
                'bg-sidebar-accent font-medium text-sidebar-foreground shadow-[inset_3px_0_0_0_var(--primary)]',
              nested && 'h-7 pl-7 text-[12.5px]',
              collapsed && 'justify-center px-0',
              locked && 'opacity-70',
            )
          "
          @click="navigate"
        >
          <span v-if="color" class="size-2.5 shrink-0 rounded-[3px] transition-transform duration-200 group-hover:scale-110" :style="{ backgroundColor: color }" />
          <component
            :is="icon"
            v-else-if="icon"
            class="size-4 shrink-0 transition-[color,transform] duration-200"
            :class="(exact ? isExactActive : isActive) && !locked ? 'scale-110 text-primary' : 'text-muted-foreground group-hover:text-sidebar-foreground'"
          />
          <span v-if="!collapsed" class="min-w-0 flex-1 truncate">{{ label }}</span>
          <span
            v-if="locked && !collapsed"
            class="inline-flex items-center gap-0.5 rounded bg-muted px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground"
          >
            <Lock class="size-2.5" aria-hidden="true" /> Pro
          </span>
          <span
            v-if="badge && !collapsed"
            class="pop-in ml-auto flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary/12 px-1.5 text-[10.5px] leading-none font-semibold text-primary tabular-nums dark:bg-primary/20"
          >
            {{ badge > 99 ? '99+' : badge }}
          </span>
          <span v-else-if="badge && collapsed" class="absolute top-1 right-1.5 size-1.5 animate-pulse rounded-full bg-primary" />
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
        <span v-if="locked" class="inline-flex items-center gap-0.5 text-[10.5px] opacity-70"><Lock class="size-2.5" /> Pro</span>
        <span v-else-if="shortcut" class="text-[10.5px] opacity-70">{{ shortcut }}</span>
      </TooltipContent>
    </Tooltip>
  </RouterLink>
</template>

<script setup lang="ts">
import type { Component } from 'vue'
import { useDevice } from '@/composables/useDevice'

export interface SettingsSection {
  value: string
  label: string
  icon?: Component
}

/**
 * Settings shell: a vertical section menu beside full-width content on desktop,
 * a scrollable chip row above it on mobile. Each section renders the slot named after its `value`.
 */
defineProps<{ sections: SettingsSection[]; ariaLabel?: string }>()
const active = defineModel<string>({ required: true })
const { isDesktop } = useDevice()
</script>

<template>
  <div :class="isDesktop ? 'grid grid-cols-[13rem_minmax(0,1fr)] items-start gap-5' : 'space-y-3'">
    <nav
      role="tablist"
      :aria-label="ariaLabel ?? 'Settings sections'"
      :aria-orientation="isDesktop ? 'vertical' : 'horizontal'"
      :class="isDesktop ? 'sticky top-0 flex flex-col gap-0.5' : 'flex gap-1.5 overflow-x-auto scrollbar-none'"
    >
      <button
        v-for="section in sections"
        :key="section.value"
        type="button"
        role="tab"
        :aria-selected="active === section.value"
        :class="
          isDesktop
            ? [
                'flex h-9 items-center gap-2.5 border-l-2 px-3 text-left text-sm font-medium transition-colors',
                active === section.value
                  ? 'border-primary bg-card text-foreground shadow-soft'
                  : 'border-transparent text-muted-foreground hover:bg-card/60 hover:text-foreground',
              ]
            : [
                'flex shrink-0 items-center gap-1.5 px-3 py-1.5 text-sm font-medium',
                active === section.value ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
              ]
        "
        @click="active = section.value"
      >
        <component :is="section.icon" v-if="section.icon" class="size-4 shrink-0" />
        {{ section.label }}
      </button>
    </nav>

    <div role="tabpanel" class="min-w-0">
      <slot :name="active" />
    </div>
  </div>
</template>

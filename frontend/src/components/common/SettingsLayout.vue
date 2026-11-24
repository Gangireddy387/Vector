<script setup lang="ts">
import type { Component } from 'vue'
import { computed } from 'vue'
import MobileSectionSelect from '@/components/common/MobileSectionSelect.vue'
import { useDevice } from '@/composables/useDevice'

export interface SettingsSection {
  value: string
  label: string
  icon?: Component
}

/**
 * Settings shell: side nav on wide screens, section dropdown on phone and tablet
 * (tablet side-by-side with a collapsed app sidebar is too tight for long labels).
 */
const props = defineProps<{ sections: SettingsSection[]; ariaLabel?: string }>()
const active = defineModel<string>({ required: true })
const { isWide } = useDevice()

const mobileOptions = computed(() =>
  props.sections.map((section) => ({ value: section.value, label: section.label, icon: section.icon })),
)
</script>

<template>
  <!-- Narrower section rail at lg (1024) so People / General panels keep room to align. -->
  <div :class="isWide ? 'grid grid-cols-[9.75rem_minmax(0,1fr)] items-start gap-4 xl:grid-cols-[11.5rem_minmax(0,1fr)]' : 'space-y-3'">
    <nav v-if="isWide" role="tablist" :aria-label="ariaLabel ?? 'Settings sections'" aria-orientation="vertical" class="sticky top-0 flex flex-col gap-0.5">
      <button
        v-for="section in sections"
        :key="section.value"
        type="button"
        role="tab"
        :aria-selected="active === section.value"
        :class="[
          'flex h-9 items-center gap-2 rounded-r-md border-l-2 px-2 text-left text-sm font-medium transition-colors xl:px-2.5',
          active === section.value
            ? 'border-primary bg-card text-foreground shadow-soft'
            : 'border-transparent text-muted-foreground hover:bg-card/60 hover:text-foreground',
        ]"
        @click="active = section.value"
      >
        <component :is="section.icon" v-if="section.icon" class="size-4 shrink-0" />
        <span class="truncate">{{ section.label }}</span>
      </button>
    </nav>

    <MobileSectionSelect v-else v-model="active" :options="mobileOptions" :aria-label="ariaLabel ?? 'Settings sections'" />

    <div role="tabpanel" class="min-w-0">
      <slot :name="active" />
    </div>
  </div>
</template>

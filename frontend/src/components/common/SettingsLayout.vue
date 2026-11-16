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
 * Settings shell: a vertical section menu beside content on tablet/desktop,
 * a clear section dropdown on phones (no hidden horizontal chip scroll).
 */
const props = defineProps<{ sections: SettingsSection[]; ariaLabel?: string }>()
const active = defineModel<string>({ required: true })
const { isDesktop } = useDevice()

const mobileOptions = computed(() =>
  props.sections.map((section) => ({ value: section.value, label: section.label, icon: section.icon })),
)
</script>

<template>
  <div
    :class="
      isDesktop
        ? 'grid grid-cols-[10rem_minmax(0,1fr)] items-start gap-4 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-5'
        : 'space-y-3'
    "
  >
    <nav v-if="isDesktop" role="tablist" :aria-label="ariaLabel ?? 'Settings sections'" aria-orientation="vertical" class="sticky top-0 flex flex-col gap-0.5">
      <button
        v-for="section in sections"
        :key="section.value"
        type="button"
        role="tab"
        :aria-selected="active === section.value"
        :class="[
          'flex h-9 items-center gap-2 border-l-2 px-2.5 text-left text-sm font-medium transition-colors lg:gap-2.5 lg:px-3',
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

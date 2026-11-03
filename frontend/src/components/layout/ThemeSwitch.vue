<script setup lang="ts">
import { Monitor, Moon, Sun } from 'lucide-vue-next'
import { type ThemePreference, useTheme } from '@/composables/useTheme'

/**
 * Light, dark or the device's own setting, as three small buttons. The choice is saved on this device and is the
 * same one as in Settings. `inverted`: white, for use on the brand gradient.
 */
withDefaults(defineProps<{ inverted?: boolean }>(), { inverted: false })
const { preference } = useTheme()

const OPTIONS: Array<{ value: ThemePreference; label: string; icon: typeof Sun }> = [
  { value: 'light', label: 'Light theme', icon: Sun },
  { value: 'dark', label: 'Dark theme', icon: Moon },
  { value: 'auto', label: 'Use the device’s theme', icon: Monitor },
]
</script>

<template>
  <div
    class="inline-flex items-center gap-0.5 rounded-full border p-0.5 backdrop-blur"
    :class="inverted ? 'border-white/25 bg-white/10' : 'border-border/70 bg-muted/50'"
    role="radiogroup"
    aria-label="Colour theme"
  >
    <button
      v-for="option in OPTIONS"
      :key="option.value"
      type="button"
      role="radio"
      :aria-checked="preference === option.value"
      :aria-label="option.label"
      :title="option.label"
      class="flex size-7 items-center justify-center rounded-full transition-colors"
      :class="
        preference === option.value
          ? inverted
            ? 'bg-white text-indigo-700 shadow-sm'
            : 'bg-background text-foreground shadow-sm'
          : inverted
            ? 'text-white/75 hover:bg-white/15 hover:text-white'
            : 'text-muted-foreground hover:text-foreground'
      "
      @click="preference = option.value"
    >
      <component :is="option.icon" class="size-3.5" />
    </button>
  </div>
</template>

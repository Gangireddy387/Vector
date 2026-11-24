<script setup lang="ts">
import { Eye, EyeOff } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { Input } from '@/components/ui/input'

defineOptions({ inheritAttrs: false })

withDefaults(defineProps<{ showStrength?: boolean }>(), { showStrength: false })
const model = defineModel<string>({ required: true })
const isVisible = ref(false)

const strength = computed(() => {
  const value = model.value ?? ''
  let score = 0
  if (value.length >= 8) score += 1
  if (value.length >= 12) score += 1
  if (/[A-Za-z]/.test(value) && /\d/.test(value)) score += 1
  if (/[^A-Za-z0-9]/.test(value)) score += 1
  return score
})

const strengthLabel = computed(() => {
  if (!model.value) return ''
  if (strength.value <= 1) return 'Weak'
  if (strength.value === 2) return 'Okay'
  if (strength.value === 3) return 'Strong'
  return 'Very strong'
})

const strengthClass = computed(() => {
  if (strength.value <= 1) return 'bg-destructive'
  if (strength.value === 2) return 'bg-warning'
  return 'bg-success'
})
</script>

<template>
  <div class="space-y-1.5">
    <div class="relative">
      <Input v-model="model" v-bind="$attrs" :type="isVisible ? 'text' : 'password'" class="pr-10" />
      <button
        type="button"
        class="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground"
        :aria-label="isVisible ? 'Hide password' : 'Show password'"
        @click="isVisible = !isVisible"
      >
        <EyeOff v-if="isVisible" class="size-4" />
        <Eye v-else class="size-4" />
      </button>
    </div>
    <div v-if="showStrength && model" class="space-y-1" aria-live="polite">
      <div class="flex gap-1">
        <span
          v-for="index in 4"
          :key="index"
          class="h-1 flex-1 rounded-full bg-muted"
          :class="index <= strength && strengthClass"
        />
      </div>
      <p class="text-[11px] text-muted-foreground">{{ strengthLabel }} · use 8+ characters with letters and numbers</p>
    </div>
  </div>
</template>

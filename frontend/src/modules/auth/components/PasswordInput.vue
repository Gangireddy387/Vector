<script setup lang="ts">
import { Eye, EyeOff } from 'lucide-vue-next'
import { ref } from 'vue'
import { Input } from '@/components/ui/input'

defineOptions({ inheritAttrs: false })

const model = defineModel<string>({ required: true })
const isVisible = ref(false)
</script>

<template>
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
</template>

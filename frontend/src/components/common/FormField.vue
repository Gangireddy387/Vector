<script setup lang="ts">
import { Label } from '@/components/ui/label'

defineProps<{ label: string; for?: string; error?: string | null; hint?: string; optional?: boolean }>()
</script>

<template>
  <div class="grid content-start gap-1.5">
    <Label :for="$props.for">
      {{ label }}
      <span v-if="optional" class="font-normal text-muted-foreground">(optional)</span>
    </Label>
    <slot />
    <p v-if="error" class="text-xs text-destructive" role="alert">{{ error }}</p>
    <p v-else-if="hint" class="text-xs text-muted-foreground">{{ hint }}</p>
  </div>
</template>

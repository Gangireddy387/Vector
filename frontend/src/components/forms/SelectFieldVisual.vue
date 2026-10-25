<script setup lang="ts">
import UserAvatar from '@/components/common/UserAvatar.vue'
import type { SelectFieldOption } from './select-field.types'

defineProps<{ option: SelectFieldOption }>()
</script>

<template>
  <UserAvatar v-if="'user' in option" :user="option.user ?? null" size="xs" />
  <component :is="option.icon" v-else-if="option.icon" class="size-4 shrink-0" :style="option.iconColor ? { color: option.iconColor } : undefined" />
  <span v-else-if="option.color" class="size-2.5 shrink-0" :style="{ backgroundColor: option.color }" />
</template>

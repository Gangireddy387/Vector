<script setup lang="ts">
import { computed } from 'vue'
import { getJumboEmojis } from '@/lib/emoji-stickers'
import { cn } from '@/lib/utils'

const props = withDefaults(
  defineProps<{
    body: string
    /** Slightly smaller when shown in a reply thread. */
    compact?: boolean
  }>(),
  { compact: false },
)

const emojis = computed(() => getJumboEmojis(props.body) ?? [])

const sizeClass = computed(() => {
  const count = emojis.value.length
  if (props.compact) {
    if (count <= 1) return 'text-[2.75rem] leading-none'
    if (count === 2) return 'text-[2.25rem] leading-none'
    return 'text-[1.85rem] leading-none'
  }
  if (count <= 1) return 'text-5xl leading-none sm:text-6xl'
  if (count === 2) return 'text-4xl leading-none sm:text-5xl'
  return 'text-3xl leading-none sm:text-4xl'
})
</script>

<template>
  <p
    v-if="emojis.length"
    class="mt-1 flex flex-wrap items-center gap-1"
    :class="cn(sizeClass)"
    role="img"
    :aria-label="emojis.join(' ')"
  >
    <span v-for="(emoji, index) in emojis" :key="`${emoji}-${index}`" class="inline-block">{{ emoji }}</span>
  </p>
</template>

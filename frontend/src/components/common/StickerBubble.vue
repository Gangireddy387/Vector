<script setup lang="ts">
import { computed } from 'vue'
import { type Sticker, STICKER_MOTION_CLASS, STICKER_TONE_CLASS, parseSticker } from '@/lib/emoji-stickers'
import { cn } from '@/lib/utils'

const props = withDefaults(
  defineProps<{
    /** Full message body (`[[sticker:id]]`) or a sticker object. */
    body?: string | null
    sticker?: Sticker | null
    size?: 'sm' | 'md' | 'lg'
    /** Play entrance pop when the bubble mounts (message thread). */
    enter?: boolean
    /** Keep looping motion (default true). */
    animate?: boolean
  }>(),
  { body: null, sticker: null, size: 'md', enter: true, animate: true },
)

const item = computed(() => props.sticker ?? parseSticker(props.body))

const sizeClass = computed(() => {
  if (props.size === 'sm') return { card: 'size-[3.5rem]', emoji: 'text-xl', label: 'text-[8px]' }
  if (props.size === 'lg') return { card: 'size-[5.5rem]', emoji: 'text-4xl', label: 'text-[10px]' }
  return { card: 'size-[4.25rem]', emoji: 'text-3xl', label: 'text-[9px]' }
})
</script>

<template>
  <div
    v-if="item"
    class="sticker-bubble inline-flex flex-col items-center justify-center gap-0.5 rounded-xl bg-gradient-to-br p-1.5 shadow-soft ring-1 ring-black/5 dark:ring-white/10"
    :class="cn(STICKER_TONE_CLASS[item.tone], sizeClass.card, enter && 'sticker-enter')"
    role="img"
    :aria-label="`${item.label} sticker`"
  >
    <span
      class="inline-block origin-center leading-none drop-shadow-sm will-change-transform"
      :class="cn(sizeClass.emoji, animate && STICKER_MOTION_CLASS[item.motion])"
    >
      {{ item.emoji }}
    </span>
    <span class="max-w-full truncate font-medium text-foreground/70" :class="sizeClass.label">{{ item.label }}</span>
  </div>
</template>

<style scoped>
@media (prefers-reduced-motion: reduce) {
  .sticker-enter,
  .sticker-motion-wave,
  .sticker-motion-bounce,
  .sticker-motion-pulse,
  .sticker-motion-spin,
  .sticker-motion-float,
  .sticker-motion-shake,
  .sticker-motion-wiggle,
  .sticker-motion-pop,
  .sticker-motion-heartbeat,
  .sticker-motion-flicker,
  .sticker-motion-blast,
  .sticker-motion-ring {
    animation: none !important;
  }
}

.sticker-enter {
  animation: sticker-enter 0.55s cubic-bezier(0.22, 1.4, 0.36, 1) both;
}

.sticker-motion-wave {
  animation: sticker-wave 1.1s ease-in-out infinite;
  transform-origin: 70% 70%;
}

.sticker-motion-bounce {
  animation: sticker-bounce 0.9s ease-in-out infinite;
}

.sticker-motion-pulse {
  animation: sticker-pulse 1.4s ease-in-out infinite;
}

.sticker-motion-spin {
  animation: sticker-spin 2.4s linear infinite;
}

.sticker-motion-float {
  animation: sticker-float 2s ease-in-out infinite;
}

.sticker-motion-shake {
  animation: sticker-shake 0.7s ease-in-out infinite;
}

.sticker-motion-wiggle {
  animation: sticker-wiggle 0.85s ease-in-out infinite;
}

.sticker-motion-pop {
  animation: sticker-pop 1.2s ease-in-out infinite;
}

.sticker-motion-heartbeat {
  animation: sticker-heartbeat 1.1s ease-in-out infinite;
}

.sticker-motion-flicker {
  animation: sticker-flicker 1.3s ease-in-out infinite;
}

.sticker-motion-blast {
  animation: sticker-blast 1.15s ease-in-out infinite;
}

.sticker-motion-ring {
  animation: sticker-ring 1s ease-in-out infinite;
  transform-origin: top center;
}

@keyframes sticker-enter {
  0% {
    opacity: 0;
    transform: scale(0.35) translateY(18px) rotate(-8deg);
  }
  70% {
    opacity: 1;
    transform: scale(1.08) translateY(-2px) rotate(2deg);
  }
  100% {
    opacity: 1;
    transform: scale(1) translateY(0) rotate(0deg);
  }
}

@keyframes sticker-wave {
  0%,
  100% {
    transform: rotate(0deg);
  }
  20% {
    transform: rotate(18deg);
  }
  40% {
    transform: rotate(-10deg);
  }
  60% {
    transform: rotate(14deg);
  }
  80% {
    transform: rotate(-6deg);
  }
}

@keyframes sticker-bounce {
  0%,
  100% {
    transform: translateY(0) scale(1);
  }
  40% {
    transform: translateY(-10px) scale(1.08);
  }
  60% {
    transform: translateY(0) scale(0.96);
  }
}

@keyframes sticker-pulse {
  0%,
  100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.18);
  }
}

@keyframes sticker-spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

@keyframes sticker-float {
  0%,
  100% {
    transform: translateY(0) rotate(-3deg);
  }
  50% {
    transform: translateY(-8px) rotate(3deg);
  }
}

@keyframes sticker-shake {
  0%,
  100% {
    transform: translateX(0) rotate(0deg);
  }
  25% {
    transform: translateX(-4px) rotate(-6deg);
  }
  75% {
    transform: translateX(4px) rotate(6deg);
  }
}

@keyframes sticker-wiggle {
  0%,
  100% {
    transform: rotate(-8deg) scale(1);
  }
  50% {
    transform: rotate(8deg) scale(1.06);
  }
}

@keyframes sticker-pop {
  0%,
  100% {
    transform: scale(1);
  }
  30% {
    transform: scale(1.22);
  }
  45% {
    transform: scale(0.94);
  }
  60% {
    transform: scale(1.1);
  }
}

@keyframes sticker-heartbeat {
  0%,
  100% {
    transform: scale(1);
  }
  15% {
    transform: scale(1.2);
  }
  30% {
    transform: scale(1);
  }
  45% {
    transform: scale(1.16);
  }
  60% {
    transform: scale(1);
  }
}

@keyframes sticker-flicker {
  0%,
  100% {
    transform: scale(1) translateY(0);
    filter: brightness(1);
  }
  25% {
    transform: scale(1.08) translateY(-2px);
    filter: brightness(1.15);
  }
  50% {
    transform: scale(0.96) translateY(1px);
    filter: brightness(0.95);
  }
  75% {
    transform: scale(1.1) translateY(-3px);
    filter: brightness(1.2);
  }
}

@keyframes sticker-blast {
  0%,
  100% {
    transform: scale(1) rotate(0deg);
  }
  20% {
    transform: scale(1.28) rotate(-6deg);
  }
  40% {
    transform: scale(0.92) rotate(5deg);
  }
  60% {
    transform: scale(1.18) rotate(-3deg);
  }
  80% {
    transform: scale(1.05) rotate(2deg);
  }
}

@keyframes sticker-ring {
  0%,
  100% {
    transform: rotate(0deg);
  }
  15% {
    transform: rotate(18deg);
  }
  30% {
    transform: rotate(-16deg);
  }
  45% {
    transform: rotate(12deg);
  }
  60% {
    transform: rotate(-8deg);
  }
  75% {
    transform: rotate(4deg);
  }
}
</style>

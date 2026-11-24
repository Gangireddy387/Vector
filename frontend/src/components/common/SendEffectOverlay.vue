<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { type SendEffectPayload, onSendEffect } from '@/lib/send-effect'

interface Particle {
  id: number
  emoji: string
  left: number
  delay: number
  duration: number
  size: number
  drift: number
  rotate: number
}

const active = ref<SendEffectPayload | null>(null)
const particles = ref<Particle[]>([])
let clearTimer: ReturnType<typeof setTimeout> | null = null
let particleKey = 0

const FALLBACK: Record<NonNullable<SendEffectPayload['kind']>, string[]> = {
  confetti: ['🎉', '🎊', '✨', '🥳', '⭐', '💫'],
  hearts: ['❤️', '💕', '💖', '💗', '💘', '✨'],
  announce: ['📢', '📣', '🔔', '✨', '❗'],
  ship: ['🚀', '✨', '⭐', '💫'],
  fire: ['🔥', '✨', '💥', '⚡'],
  sparkle: ['✨', '⭐', '💫', '🌟'],
  balloons: ['🎈', '✨', '🎉', '🎊'],
}

function spawn(payload: SendEffectPayload) {
  if (!payload.kind) return
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

  active.value = payload
  const pool = [...FALLBACK[payload.kind]]
  if (payload.emoji && !pool.includes(payload.emoji)) pool.unshift(payload.emoji)

  const count = payload.kind === 'ship' ? 14 : payload.kind === 'announce' ? 18 : 32
  particles.value = Array.from({ length: count }, (_, index) => {
    particleKey += 1
    return {
      id: particleKey,
      emoji: pool[index % pool.length]!,
      left: Math.random() * 100,
      delay: Math.random() * 1.25,
      duration: 3.4 + Math.random() * 2.2,
      size: 1.1 + Math.random() * 1.6,
      drift: -40 + Math.random() * 80,
      rotate: -180 + Math.random() * 360,
    }
  })

  if (clearTimer) clearTimeout(clearTimer)
  clearTimer = setTimeout(() => {
    active.value = null
    particles.value = []
  }, 6200)
}

let stop: (() => void) | undefined
onMounted(() => {
  stop = onSendEffect(spawn)
})
onUnmounted(() => {
  stop?.()
  if (clearTimer) clearTimeout(clearTimer)
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="active"
      class="send-effect pointer-events-none fixed inset-0 z-[200] overflow-hidden"
      :data-kind="active.kind"
      aria-hidden="true"
    >
      <div v-if="active.kind === 'announce'" class="send-effect-flash" />
      <div v-if="active.kind === 'confetti' || active.kind === 'sparkle'" class="send-effect-glow" />

      <span
        v-for="particle in particles"
        :key="particle.id"
        class="send-effect-particle absolute will-change-transform"
        :class="`send-effect-${active.kind}`"
        :style="{
          left: `${particle.left}%`,
          fontSize: `${particle.size}rem`,
          '--delay': `${particle.delay}s`,
          '--duration': `${particle.duration}s`,
          '--drift': `${particle.drift}px`,
          '--rotate': `${particle.rotate}deg`,
        }"
      >
        {{ particle.emoji }}
      </span>
    </div>
  </Teleport>
</template>

<style scoped>
.send-effect-flash {
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at 50% 20%, rgb(251 146 60 / 0.28), transparent 55%);
  animation: send-flash 2.4s ease-in-out both;
}

.send-effect-glow {
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at 50% 0%, rgb(168 85 247 / 0.18), transparent 50%);
  animation: send-flash 2.8s ease-in-out both;
}

.send-effect-particle {
  top: -10%;
  animation-name: send-fall;
  animation-duration: var(--duration);
  animation-delay: var(--delay);
  animation-timing-function: cubic-bezier(0.33, 0.1, 0.25, 1);
  animation-fill-mode: both;
  filter: drop-shadow(0 2px 4px rgb(0 0 0 / 0.15));
}

.send-effect-hearts {
  animation-name: send-float-up;
}

.send-effect-balloons {
  animation-name: send-float-up;
}

.send-effect-ship {
  animation-name: send-ship;
  top: 70%;
}

.send-effect-announce {
  animation-name: send-burst;
  top: 35%;
  left: 50% !important;
}

.send-effect-fire {
  animation-name: send-rise-fire;
  top: 75%;
}

@keyframes send-flash {
  0% {
    opacity: 0;
  }
  20% {
    opacity: 1;
  }
  70% {
    opacity: 0.45;
  }
  100% {
    opacity: 0;
  }
}

@keyframes send-fall {
  0% {
    opacity: 0;
    transform: translate3d(0, -8vh, 0) rotate(0deg) scale(0.4);
  }
  8% {
    opacity: 1;
  }
  75% {
    opacity: 1;
  }
  100% {
    opacity: 0;
    transform: translate3d(var(--drift), 110vh, 0) rotate(var(--rotate)) scale(1);
  }
}

@keyframes send-float-up {
  0% {
    opacity: 0;
    transform: translate3d(0, 45vh, 0) scale(0.5);
  }
  10% {
    opacity: 1;
  }
  70% {
    opacity: 1;
  }
  100% {
    opacity: 0;
    transform: translate3d(var(--drift), -35vh, 0) scale(1.15) rotate(var(--rotate));
  }
}

@keyframes send-ship {
  0% {
    opacity: 0;
    transform: translate3d(0, 25vh, 0) scale(0.6) rotate(-20deg);
  }
  12% {
    opacity: 1;
  }
  75% {
    opacity: 1;
  }
  100% {
    opacity: 0;
    transform: translate3d(calc(var(--drift) * 0.4), -95vh, 0) scale(1.2) rotate(12deg);
  }
}

@keyframes send-burst {
  0% {
    opacity: 0;
    transform: translate(-50%, 0) scale(0.2);
  }
  18% {
    opacity: 1;
    transform: translate(calc(-50% + var(--drift)), -6vh) scale(1.3);
  }
  70% {
    opacity: 1;
  }
  100% {
    opacity: 0;
    transform: translate(calc(-50% + var(--drift) * 1.6), -40vh) scale(0.85) rotate(var(--rotate));
  }
}

@keyframes send-rise-fire {
  0% {
    opacity: 0;
    transform: translate3d(0, 12vh, 0) scale(0.5);
    filter: brightness(1.2);
  }
  12% {
    opacity: 1;
  }
  70% {
    opacity: 1;
  }
  100% {
    opacity: 0;
    transform: translate3d(var(--drift), -75vh, 0) scale(1.3);
    filter: brightness(1.6);
  }
}

@media (prefers-reduced-motion: reduce) {
  .send-effect {
    display: none !important;
  }
}
</style>

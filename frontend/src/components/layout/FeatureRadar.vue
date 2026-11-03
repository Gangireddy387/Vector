<script setup lang="ts">
import { BarChart3, CalendarDays, LayoutGrid, MessageCircle, Sparkles, Video, Zap } from 'lucide-vue-next'
import type { Component } from 'vue'

/**
 * A radar for the sign-in pages: a beam sweeps around and each of Vector's features lights up (with its name) as the
 * beam passes it. It follows the light and dark theme, and stands still for people who prefer less motion.
 * `frame`: drawn around something in its middle (the sign-in form): no centre dot, a lighter screen, and the
 * features spread evenly around the form. `small`: smaller features, for a radar a few hundred pixels wide.
 */
const props = withDefaults(defineProps<{ variant?: 'center' | 'frame'; small?: boolean }>(), { variant: 'center', small: false })

/** One turn of the beam, in seconds; each feature lights up at the moment the beam reaches its angle. */
const TURN = 8

interface Node {
  label: string
  icon: Component
  /** Degrees clockwise from the top. */
  angle: number
  /** Distance from the centre, as a share of the radar's radius. */
  distance: number
  /** RGB of the feature's colour: deeper on the light screen, brighter on the dark one. */
  light: string
  dark: string
}

const FEATURES = [
  { label: 'Boards', icon: LayoutGrid, light: '79 70 229', dark: '129 140 248' },
  { label: 'Automations', icon: Zap, light: '234 88 12', dark: '251 146 60' },
  { label: 'AI assistant', icon: Sparkles, light: '192 38 211', dark: '232 121 249' },
  { label: 'Meetings', icon: Video, light: '219 39 119', dark: '244 114 182' },
  { label: 'Chat', icon: MessageCircle, light: '8 145 178', dark: '103 232 249' },
  { label: 'Calendar', icon: CalendarDays, light: '217 119 6', dark: '251 191 36' },
  { label: 'Reports', icon: BarChart3, light: '22 163 74', dark: '74 222 128' },
]

/** Where each feature sits: spread all around, or (frame) around the form in the middle. */
const POSITIONS = {
  center: [
    [0, 0.78],
    [62, 0.66],
    [118, 0.84],
    [168, 0.62],
    [214, 0.82],
    [262, 0.6],
    [312, 0.8],
  ],
  // Evenly around the form's disc (at most 80% of the radar's width), near the radar's edge.
  frame: [
    [0, 0.93],
    [51, 0.93],
    [103, 0.93],
    [154, 0.93],
    [206, 0.93],
    [257, 0.93],
    [309, 0.93],
  ],
} as const

const NODES: Node[] = FEATURES.map((feature, index) => {
  const [angle, distance] = POSITIONS[props.variant][index]!
  return { ...feature, angle, distance }
})

/** Faint targets that flash as the beam passes, like objects on a radar. */
const BLIPS = [
  { angle: 32, distance: 0.42 },
  { angle: 140, distance: 0.36 },
  { angle: 236, distance: 0.46 },
  { angle: 290, distance: 0.3 },
]

const place = (angle: number, distance: number) => {
  const radians = (angle * Math.PI) / 180
  return { left: `${50 + Math.sin(radians) * distance * 50}%`, top: `${50 - Math.cos(radians) * distance * 50}%` }
}
const reached = (angle: number) => `${((angle / 360) * TURN).toFixed(3)}s`
/** Features near the top show their name above them, away from the middle (where the form is in the frame). */
const labelAbove = (angle: number) => props.variant === 'frame' && Math.cos((angle * Math.PI) / 180) > 0.5
</script>

<template>
  <div class="radar relative aspect-square" :class="variant === 'frame' && 'radar-frame'" :style="{ '--turn': `${TURN}s` }" aria-hidden="true">
    <!-- The screen, rings and cross lines -->
    <div class="radar-screen absolute inset-0 rounded-full" />
    <div class="radar-ring absolute inset-0 rounded-full border border-dashed" />
    <div class="radar-ring absolute inset-[16%] rounded-full border" />
    <div class="radar-ring absolute inset-[33%] rounded-full border" />
    <div class="radar-ring-inner absolute inset-[45%] rounded-full border" />
    <div class="radar-axis absolute inset-y-0 left-1/2 w-px -translate-x-1/2" />
    <div class="radar-axis radar-axis-x absolute inset-x-0 top-1/2 h-px -translate-y-1/2" />

    <!-- The sweeping beam -->
    <div class="radar-beam absolute inset-0 rounded-full" />

    <!-- Targets -->
    <span
      v-for="blip in BLIPS"
      :key="`${blip.angle}-${blip.distance}`"
      class="radar-blip absolute size-1.5 rounded-full"
      :style="{ ...place(blip.angle, blip.distance), '--reached': reached(blip.angle) }"
    />

    <!-- Centre (the form covers it in the frame) -->
    <span
      v-if="variant === 'center'"
      class="radar-core absolute top-1/2 left-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2"
      :class="small ? 'size-7' : 'size-12'"
    >
      <span class="radar-ping absolute inset-0 rounded-full border" />
      <span class="radar-dot rounded-full" :class="small ? 'size-3' : 'size-5'" />
    </span>

    <!-- Features -->
    <div
      v-for="node in NODES"
      :key="node.label"
      class="radar-node absolute -translate-x-1/2 -translate-y-1/2"
      :style="{ ...place(node.angle, node.distance), '--node-light': node.light, '--node-dark': node.dark, '--reached': reached(node.angle) }"
    >
      <span class="radar-node-icon flex items-center justify-center rounded-full border backdrop-blur-sm" :class="small ? 'size-8' : 'size-12'">
        <component :is="node.icon" :class="small ? 'size-3.5' : 'size-5'" />
      </span>
      <span
        class="radar-node-label pointer-events-none absolute left-1/2 rounded-full px-2 py-0.5 font-semibold whitespace-nowrap"
        :class="[labelAbove(node.angle) ? 'bottom-full mb-1.5' : 'top-full mt-1.5', small ? 'text-[9px]' : 'text-[11px]']"
      >
        {{ node.label }}
      </span>
    </div>
  </div>
</template>

<style scoped>
/* --- Theme ----------------------------------------------------------------------------------------------------------
 * Light: a frosted, bright screen with deep colours. Dark: a navy screen where the beam and the features glow. */
.radar {
  --screen: radial-gradient(circle, rgb(255 255 255 / 0.94) 0%, rgb(238 242 255 / 0.9) 62%, rgb(224 231 255 / 0.72) 100%);
  --screen-shadow: 0 0 0 1px rgb(255 255 255 / 0.55), 0 30px 80px -24px rgb(30 10 80 / 0.5), inset 0 0 60px rgb(99 102 241 / 0.16);
  --grid: rgb(79 70 229 / 0.07);
  --ring: rgb(67 56 202 / 0.2);
  --ring-inner: rgb(8 145 178 / 0.4);
  --axis: rgb(67 56 202 / 0.18);
  --beam: 6 182 212;
  --beam-strength: 0.32;
  --core: 6 182 212;
  --core-glow: 0.45;
  --label-fill: 1;
  --label-text: #fff;
  --node-fill: 0.12;
  --node-fill-lit: 0.22;
}
.dark .radar {
  --screen:
    radial-gradient(circle at 50% 50%, rgb(34 211 238 / 0.12), transparent 30%),
    radial-gradient(circle, rgb(17 16 52 / 0.94) 0%, rgb(23 20 72 / 0.88) 62%, rgb(30 27 75 / 0.6) 100%);
  --screen-shadow: 0 0 0 1px rgb(255 255 255 / 0.08), 0 30px 80px -20px rgb(0 0 0 / 0.7), inset 0 0 60px rgb(99 102 241 / 0.25);
  --grid: rgb(255 255 255 / 0.05);
  --ring: rgb(255 255 255 / 0.16);
  --ring-inner: rgb(103 232 249 / 0.32);
  --axis: rgb(255 255 255 / 0.15);
  --beam: 103 232 249;
  --beam-strength: 0.5;
  --core: 103 232 249;
  --core-glow: 0.65;
  --label-fill: 0.35;
  --label-text: #fff;
  --node-fill: 0.16;
  --node-fill-lit: 0.38;
}
/* Around the form: a lighter screen, so the form stays the brightest thing on the page. */
.radar-frame {
  --screen: radial-gradient(circle, rgb(255 255 255 / 0.5) 0%, rgb(238 242 255 / 0.42) 60%, rgb(224 231 255 / 0.2) 100%);
  --screen-shadow: 0 0 0 1px rgb(255 255 255 / 0.4), 0 40px 120px -30px rgb(30 10 80 / 0.45), inset 0 0 80px rgb(255 255 255 / 0.25);
}
.dark .radar-frame {
  --screen:
    radial-gradient(circle at 50% 50%, rgb(34 211 238 / 0.1), transparent 40%),
    radial-gradient(circle, rgb(17 16 52 / 0.78) 0%, rgb(23 20 72 / 0.66) 60%, rgb(30 27 75 / 0.35) 100%);
}

.radar-node {
  --node: var(--node-light);
}
.dark .radar-node {
  --node: var(--node-dark);
}

/* --- Parts ----------------------------------------------------------------------------------------------------------- */
.radar-screen {
  background: var(--screen);
  box-shadow: var(--screen-shadow);
}
.radar-screen::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background-image: linear-gradient(var(--grid) 1px, transparent 1px), linear-gradient(90deg, var(--grid) 1px, transparent 1px);
  background-size: 28px 28px;
  mask-image: radial-gradient(circle, black 55%, transparent 72%);
}
.radar-ring {
  border-color: var(--ring);
}
.radar-ring-inner {
  border-color: var(--ring-inner);
}
.radar-axis {
  background: linear-gradient(to bottom, transparent, var(--axis), transparent);
}
.radar-axis-x {
  background: linear-gradient(to right, transparent, var(--axis), transparent);
}

.radar-beam {
  /* The bright edge leads at the top of the gradient; the glow trails behind it. */
  background: conic-gradient(
    from 0deg,
    transparent 0deg 280deg,
    rgb(var(--beam) / calc(var(--beam-strength) * 0.1)) 295deg,
    rgb(var(--beam) / var(--beam-strength)) 359deg,
    transparent 360deg
  );
  mask-image: radial-gradient(circle, black 0%, black 62%, transparent 72%);
  animation: radar-turn var(--turn) linear infinite;
}

.radar-core {
  border-color: rgb(var(--core) / 0.6);
  background: rgb(var(--core) / 0.1);
}
.radar-ping {
  border-color: rgb(var(--core) / 0.6);
  animation: radar-ping 2.4s ease-out infinite;
}
.radar-dot {
  background: rgb(var(--core));
  box-shadow: 0 0 24px 6px rgb(var(--core) / var(--core-glow));
}

.radar-blip {
  background: rgb(var(--beam));
  opacity: 0;
  transform: translate(-50%, -50%);
  animation: radar-blip var(--turn) ease-out var(--reached) infinite;
}

.radar-node-icon {
  color: rgb(var(--node));
  border-color: rgb(var(--node) / 0.5);
  background: rgb(var(--node) / var(--node-fill));
  box-shadow: 0 0 0 0 rgb(var(--node) / 0);
  /* Every node runs the same cycle as the beam, started when the beam reaches it (`--reached`). */
  animation: radar-light var(--turn) ease-out var(--reached) infinite;
}
.radar-node-label {
  color: var(--label-text);
  background: rgb(var(--node) / var(--label-fill));
  opacity: 0;
  transform: translate(-50%, -4px);
  animation: radar-label var(--turn) ease-out var(--reached) infinite;
}

@keyframes radar-turn {
  to {
    transform: rotate(360deg);
  }
}
@keyframes radar-light {
  0% {
    transform: scale(1.18);
    background: rgb(var(--node) / var(--node-fill-lit));
    box-shadow: 0 0 28px 6px rgb(var(--node) / 0.5);
  }
  30%,
  100% {
    transform: scale(1);
    background: rgb(var(--node) / var(--node-fill));
    box-shadow: 0 0 0 0 rgb(var(--node) / 0);
  }
}
@keyframes radar-label {
  0%,
  18% {
    opacity: 1;
    transform: translate(-50%, 0);
  }
  32%,
  100% {
    opacity: 0;
    transform: translate(-50%, -4px);
  }
}
@keyframes radar-blip {
  0% {
    opacity: 0.9;
    transform: translate(-50%, -50%) scale(1.6);
  }
  25%,
  100% {
    opacity: 0;
    transform: translate(-50%, -50%) scale(0.6);
  }
}
@keyframes radar-ping {
  0% {
    transform: scale(1);
    opacity: 0.8;
  }
  100% {
    transform: scale(2.4);
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .radar-beam,
  .radar-ping,
  .radar-node-icon,
  .radar-node-label,
  .radar-blip {
    animation: none;
  }
  .radar-beam {
    transform: rotate(150deg);
  }
  .radar-node-label {
    opacity: 1;
    transform: translate(-50%, 0);
  }
}
</style>

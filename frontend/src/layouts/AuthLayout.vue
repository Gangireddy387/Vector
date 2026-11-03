<script setup lang="ts">
import { useMediaQuery } from '@vueuse/core'
import { Bot, CalendarSync, Sparkles, Zap } from 'lucide-vue-next'
import AppLogo from '@/components/layout/AppLogo.vue'
import FeatureRadar from '@/components/layout/FeatureRadar.vue'
import ThemeSwitch from '@/components/layout/ThemeSwitch.vue'
import { useWorkspaceStore } from '@/stores/workspace.store'

const workspace = useWorkspaceStore()
const year = new Date().getFullYear()
const isPhone = useMediaQuery('(max-width: 39.99rem)')

/*
 * Pills floating just outside the radar, in the gaps between its feature icons. `x` and `y` are the point next to the
 * circle, as fractions of the radar's width from its centre; a pill on the left ends at that point, one on the right
 * starts there.
 */
const HIGHLIGHTS = [
  { icon: Zap, title: 'Automation rules', text: 'Triage and assign on their own.', tone: 'from-amber-300 to-orange-500', x: 0.3, y: -0.42 },
  { icon: CalendarSync, title: 'Recurring work', text: 'Routine tasks appear on schedule.', tone: 'from-cyan-300 to-sky-500', x: 0.43, y: 0.3 },
  { icon: Bot, title: 'AI assistant', text: 'Draft tasks and break work down.', tone: 'from-fuchsia-300 to-violet-500', x: -0.4, y: 0.36 },
]
</script>

<template>
  <!--
    Every screen: the form in a round glass disc in the middle of a radar of Vector's features. Desktop adds the brand
    gradient behind everything and the headline on the left.
  -->
  <div class="auth-shell relative flex min-h-dvh flex-col overflow-x-hidden bg-background lg:h-dvh lg:overflow-hidden lg:bg-brand">
    <!-- Full-screen backdrop (desktop) -->
    <div class="pointer-events-none absolute inset-0 hidden lg:block dark:opacity-55" aria-hidden="true">
      <div
        class="absolute inset-0"
        style="
          background:
            radial-gradient(48rem 36rem at 95% 0%, oklch(0.82 0.13 330 / 0.55), transparent 60%),
            radial-gradient(44rem 34rem at 0% 100%, oklch(0.78 0.13 220 / 0.55), transparent 60%);
        "
      />
      <div
        class="absolute inset-0 opacity-[0.14]"
        style="
          background-image: linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px);
          background-size: 44px 44px;
          mask-image: radial-gradient(ellipse at 35% 45%, black 25%, transparent 75%);
        "
      />
    </div>
    <!-- Soft glow behind the form (phones) -->
    <div
      class="pointer-events-none absolute -top-40 -right-40 size-[32rem] opacity-60 blur-3xl lg:hidden"
      style="background: radial-gradient(closest-side, color-mix(in oklch, var(--brand-from) 22%, transparent), transparent)"
      aria-hidden="true"
    />

    <header class="relative z-10 flex h-14 shrink-0 items-center justify-between px-6 pt-safe sm:px-12 lg:h-16 lg:text-white xl:px-16">
      <!-- One logo and one theme switch per screen size; the wrappers decide which shows. -->
      <span class="lg:hidden"><AppLogo /></span>
      <span class="hidden lg:block"><AppLogo inverted /></span>
      <div class="flex items-center gap-4">
        <span class="hidden text-xs font-medium text-muted-foreground sm:inline lg:text-white/80">
          {{ workspace.settings.slug ? workspace.settings.name : 'Work management for every team' }}
        </span>
        <span class="flex lg:hidden"><ThemeSwitch /></span>
        <span class="hidden lg:flex"><ThemeSwitch inverted /></span>
      </div>
    </header>

    <!-- `--radar`: the radar's width, as large as the screen allows while the whole radar stays in view. -->
    <!--
      Desktop: the headline on the left, the radar with the form and the highlight pills around it in the middle of the
      page (the right column is the same width as the left one, so the radar stays centred).
    -->
    <div class="auth-stage relative z-10 flex min-h-0 flex-1 lg:grid lg:grid-cols-[minmax(0,1fr)_var(--radar)_minmax(0,1fr)] lg:gap-4 lg:px-6 xl:px-10">
      <aside
        class="relative hidden min-h-0 flex-col justify-center gap-10 py-6 text-white short:gap-6 lg:col-start-1 lg:row-start-1 lg:flex"
        aria-hidden="true"
      >
        <div class="space-y-5 short:space-y-3">
          <span
            class="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 py-1 pr-3.5 pl-1.5 text-xs font-medium whitespace-nowrap shadow-lg shadow-black/10 backdrop-blur-md"
          >
            <span class="flex size-5 items-center justify-center rounded-full bg-linear-to-br from-fuchsia-300 to-violet-500">
              <Sparkles class="size-3 text-white" />
            </span>
            AI · Automation · Recurring work
            <span class="live-dot ml-0.5 size-1.5 rounded-full bg-emerald-300" />
          </span>
          <h2 class="text-[clamp(1.6rem,2.1vw,3rem)] leading-[1.08] font-semibold tracking-tight">
            Less busywork.<br />
            <span class="bg-linear-to-r from-cyan-200 to-fuchsia-200 bg-clip-text text-transparent">More shipped work.</span>
          </h2>
          <p class="max-w-sm text-sm text-white/80 xl:text-base">Plan, track and automate your team’s work so the boring parts happen on their own.</p>
        </div>
      </aside>

      <!-- Smaller screens: the radar around the round form, fitted to the screen (see the styles). -->

      <div class="radar-frame-small pointer-events-none absolute inset-0 items-center justify-center" aria-hidden="true">
        <FeatureRadar variant="frame" :small="isPhone" class="w-[var(--radar)] shrink-0" />
      </div>

      <!--
        Everything Vector does, on a radar around the form (desktop). It shares the form's grid cell, so it stays
        centred on the form at every size.
      -->
      <div class="pointer-events-none absolute inset-0 hidden items-center justify-center lg:col-[2/3] lg:row-[1/2] lg:flex" aria-hidden="true">
        <div class="radar-halo absolute size-[calc(var(--radar)*1.15)] shrink-0 rounded-full blur-3xl" />
        <FeatureRadar variant="frame" class="relative w-[var(--radar)] shrink-0" />
        <ul class="absolute size-[var(--radar)] text-white">
          <li
            v-for="(item, index) in HIGHLIGHTS"
            :key="item.title"
            class="absolute -translate-y-1/2"
            :class="item.x < 0 && '-translate-x-full'"
            :style="{ left: `calc(50% + var(--radar) * ${item.x})`, top: `calc(50% + var(--radar) * ${item.y})` }"
          >
            <span
              class="highlight-pill flex items-center gap-3 rounded-full border border-white/20 bg-white/10 py-1.5 pr-5 pl-1.5 whitespace-nowrap shadow-xl shadow-black/15 backdrop-blur-md"
              :style="{ animationDelay: `${0.4 + index * 0.2}s, ${index * -1.6}s` }"
            >
              <span
                class="flex size-10 shrink-0 items-center justify-center rounded-full bg-linear-to-br shadow-md ring-2 ring-white/25 short:size-8"
                :class="item.tone"
              >
                <component :is="item.icon" class="size-4.5 text-white short:size-4" />
              </span>
              <span>
                <span class="block text-sm leading-tight font-semibold">{{ item.title }}</span>
                <span class="block text-xs text-white/70 short:hidden">{{ item.text }}</span>
              </span>
            </span>
          </li>
        </ul>
      </div>

      <!-- The form, in the middle of the radar -->
      <main class="relative z-10 flex w-full min-h-0 flex-col px-6 pb-safe sm:px-12 lg:col-[2/3] lg:row-[1/2] lg:overflow-y-auto lg:px-0 lg:py-6">
        <div class="flex flex-1 flex-col items-center justify-center py-6 short:py-2 lg:py-0">
          <div class="auth-card w-full max-w-[22rem] lg:text-card-foreground">
            <span class="auth-card-sheen" aria-hidden="true" />
            <div class="auth-card-body">
              <RouterView />
              <nav class="mt-3 flex items-center justify-center gap-3 text-xs text-muted-foreground" aria-label="Legal">
                <RouterLink :to="{ name: 'privacy' }" class="hover:text-foreground hover:underline">Privacy</RouterLink>
                <span aria-hidden="true">·</span>
                <RouterLink :to="{ name: 'terms' }" class="hover:text-foreground hover:underline">Terms</RouterLink>
              </nav>
            </div>
          </div>
        </div>
      </main>
    </div>

    <footer
      class="relative z-10 flex h-12 shrink-0 flex-wrap items-center justify-between gap-x-4 px-6 text-xs text-muted-foreground sm:px-12 lg:text-white/70 xl:px-16"
    >
      <span>© {{ year }} Vector</span>
    </footer>
  </div>
</template>

<style scoped>
/* Dark theme (desktop): a deep night-sky backdrop instead of the bright brand gradient. */
@media (min-width: 64rem) {
  .dark .auth-shell {
    background-image: linear-gradient(135deg, #0b0a1f 0%, #15123a 55%, #261040 100%);
  }
}

/* The highlight pills fade in one after another, then drift up and down, each at its own point in the cycle. */
.highlight-pill {
  animation:
    pill-in 0.6s ease-out both,
    pill-float 5s ease-in-out infinite;
}
.live-dot {
  box-shadow: 0 0 0 0 rgb(110 231 183 / 0.7);
  animation: live-pulse 2s ease-out infinite;
}
@keyframes pill-in {
  from {
    opacity: 0;
    filter: blur(6px);
  }
}
@keyframes pill-float {
  50% {
    transform: translateY(-5px);
  }
}
@keyframes live-pulse {
  to {
    box-shadow: 0 0 0 6px rgb(110 231 183 / 0);
  }
}

.radar-halo {
  background: radial-gradient(closest-side, rgb(255 255 255 / 0.45), transparent);
  opacity: 0.6;
}
.dark .radar-halo {
  background: radial-gradient(closest-side, rgb(99 102 241 / 0.45), transparent);
  opacity: 0.7;
}

/* --- Sizes -----------------------------------------------------------------------------------------------------------
 * Every screen shows the radar with the round form in its middle. `--radar` is the radar's width, `--disc` the round
 * form's (it stays inside the ring of features), `--compact` how much the form inside is scaled down to fit.
 * Desktop (1024px and wider): headline on the left, radar in the middle, as large as the window allows.
 * Smaller screens: the radar fitted to the screen, but never so small that the form gets hard to read; the page
 *   scrolls when the window is too short for it. */
@property --edge-angle {
  syntax: '<angle>';
  initial-value: 0deg;
  inherits: false;
}

@media (min-width: 64rem) {
  .auth-stage {
    /* Room is kept on both sides for the headline and the highlights. */
    --radar: min(48rem, calc(100dvh - 6.5rem), calc(100vw - 32rem));
    --disc: calc(var(--radar) * 0.78);
  }
  .radar-frame-small {
    display: none;
  }
}
/* Short desktop screens: a slightly larger disc and a more compact form, so even registering fits. */
@media (min-width: 64rem) and (max-height: 760px) {
  .auth-stage {
    --disc: calc(var(--radar) * 0.8);
    --compact: 0.86;
  }
}
@media (max-width: 63.99rem) {
  .auth-stage {
    --radar: max(34rem, min(44rem, calc(100vw - 2rem), calc(100dvh - 8.5rem)));
    --disc: calc(var(--radar) * 0.8);
    --compact: 0.9;
    min-height: calc(var(--radar) + 1rem);
  }
  .radar-frame-small {
    display: flex;
  }
}
/* Phones: the radar as wide as the screen, with smaller feature icons (see `isPhone`). */
@media (max-width: 39.99rem) {
  .auth-stage {
    --radar: max(20rem, calc(100vw - 0.5rem));
    --compact: 0.8;
  }
}

/* --- The glass disc --------------------------------------------------------------------------------------------------
 * A round, frosted, see-through glass in the middle of the radar, with the form inside: a light sweeps across it now
 * and then, and a glow travels around its edge in step with the radar's beam (one turn in 8 seconds). A form taller
 * than the disc scrolls inside it. */
.auth-card {
  --glass: radial-gradient(circle at 30% 20%, rgb(255 255 255 / 0.7), rgb(255 255 255 / 0.4) 55%, rgb(255 255 255 / 0.5));
  --glass-border: rgb(255 255 255 / 0.65);
  --glass-shine: rgb(255 255 255 / 0.75);
  --glass-shadow: rgb(30 10 80 / 0.42);
  --sheen: rgb(255 255 255 / 0.55);
  position: relative;
  isolation: isolate;
  display: grid;
  place-items: center;
  width: var(--disc);
  height: var(--disc);
  max-width: none;
  padding: 0;
  border-radius: 50%;
  background: var(--glass);
  border: 1px solid var(--glass-border);
  box-shadow:
    0 30px 80px -24px var(--glass-shadow),
    inset 0 1px 0 var(--glass-shine),
    inset 0 0 0 1px rgb(255 255 255 / 0.08);
  backdrop-filter: blur(22px) saturate(170%);
  -webkit-backdrop-filter: blur(22px) saturate(170%);
  animation: card-in 0.7s cubic-bezier(0.2, 0.8, 0.2, 1) both;
}
/* The form inside the disc: as wide as the circle allows at its middle, scrolling when taller than it. */
.auth-card-body {
  zoom: var(--compact, 1);
  width: calc(var(--disc) * 0.65 / var(--compact, 1));
  max-height: calc(var(--disc) * 0.9 / var(--compact, 1));
  overflow-y: auto;
  scrollbar-width: thin;
  padding: 0.5rem 0.25rem;
}

.dark .auth-card {
  --glass: radial-gradient(circle at 30% 20%, rgb(67 56 202 / 0.5), rgb(15 14 40 / 0.45) 55%, rgb(30 27 75 / 0.55));
  --glass-border: rgb(255 255 255 / 0.14);
  --glass-shine: rgb(255 255 255 / 0.14);
  --glass-shadow: rgb(0 0 0 / 0.65);
  --sheen: rgb(255 255 255 / 0.12);
}

/* A light travelling around the edge. */
.auth-card::after {
  content: '';
  position: absolute;
  inset: -1px;
  padding: 1.5px;
  border-radius: inherit;
  pointer-events: none;
  background: conic-gradient(
    from var(--edge-angle),
    transparent 0deg 250deg,
    rgb(103 232 249 / 0.95) 300deg,
    rgb(232 121 249 / 0.95) 340deg,
    transparent 360deg
  );
  mask:
    linear-gradient(#000 0 0) content-box,
    linear-gradient(#000 0 0);
  mask-composite: exclude;
  -webkit-mask-composite: xor;
  animation: edge-turn 8s linear infinite;
}

/* A gloss sweeping across the glass, behind the form's content. */
.auth-card-sheen {
  position: absolute;
  inset: 0;
  z-index: -1;
  overflow: hidden;
  border-radius: inherit;
  pointer-events: none;
}
.auth-card-sheen::before {
  content: '';
  position: absolute;
  inset: -20% -60%;
  background: linear-gradient(105deg, transparent 40%, var(--sheen) 50%, transparent 60%);
  transform: translateX(-70%);
  animation: sheen 7s ease-in-out 1.2s infinite;
}

@keyframes card-in {
  from {
    opacity: 0;
    transform: translateY(16px) scale(0.98);
  }
}
@keyframes edge-turn {
  to {
    --edge-angle: 360deg;
  }
}
@keyframes sheen {
  0% {
    transform: translateX(-70%);
  }
  35%,
  100% {
    transform: translateX(70%);
  }
}

@media (prefers-reduced-motion: reduce) {
  .auth-card,
  .auth-card::after,
  .auth-card-sheen::before,
  .highlight-pill,
  .live-dot {
    animation: none;
  }
}
</style>

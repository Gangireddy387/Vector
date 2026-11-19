<script setup lang="ts">
import { useMediaQuery, useResizeObserver } from '@vueuse/core'
import { Bot, CalendarSync, Check, MessageCircle, Sparkles, ThumbsUp, Zap } from 'lucide-vue-next'
import { computed, onMounted, ref, watch, type Component } from 'vue'
import { RouterLink } from 'vue-router'
import AppLogo from '@/components/layout/AppLogo.vue'
import FeaturePreview from '@/components/layout/FeaturePreview.vue'
import FeatureRadar from '@/components/layout/FeatureRadar.vue'
import ShowcaseChip from '@/components/layout/ShowcaseChip.vue'
import type { Teammate } from '@/components/layout/team'
import ThemeSwitch from '@/components/layout/ThemeSwitch.vue'
import { useShowcaseTeam } from '@/composables/useShowcaseTeam'

/**
 * Same rich brand stage as the sign-in page: gradient, grid, radar, floating feature cards.
 * `disc` — circular glass (landing). `sheet` — wide glass panel for longer pages.
 */
withDefaults(
  defineProps<{
    variant?: 'disc' | 'sheet'
    /** Feature radar ring. Off = keep floating cards/chips only (Workday / Privacy). */
    showRadar?: boolean
    eyebrow?: string
    headline?: string
    headlineAccent?: string
    description?: string
    headerHint?: string
  }>(),
  {
    variant: 'disc',
    showRadar: true,
    eyebrow: 'AI · Automation · Recurring work',
    headline: 'Less busywork.',
    headlineAccent: 'More shipped work.',
    description: 'Plan, track and automate your team’s work so the boring parts happen on their own.',
    headerHint: 'Work management for every team',
  },
)
const year = new Date().getFullYear()
const isPhone = useMediaQuery('(max-width: 39.99rem)')
const { portraits, community: COMMUNITY, byIndex } = useShowcaseTeam()

const HIGHLIGHTS = [
  { icon: Zap, title: 'Automation rules', text: 'Triage and assign on their own.', tone: 'from-amber-300 to-orange-500', x: 0.3, y: -0.42 },
  { icon: CalendarSync, title: 'Recurring work', text: 'Routine tasks appear on schedule.', tone: 'from-cyan-300 to-sky-500', x: 0.43, y: 0.3 },
  { icon: Bot, title: 'AI assistant', text: 'Draft tasks and break work down.', tone: 'from-fuchsia-300 to-violet-500', x: -0.4, y: 0.36 },
]

type PreviewKind = 'board' | 'reports' | 'calendar' | 'chat' | 'meeting'
type Nearby = { who: Teammate; x: number; y: number; icon: Component; badge: string; card?: PreviewKind }

const NEARBY_SLOTS: Omit<Nearby, 'who'>[] = [
  { x: -0.72, y: -0.34, icon: MessageCircle, badge: 'bg-sky-500', card: 'board' },
  { x: -0.82, y: 0.3, icon: ThumbsUp, badge: 'bg-amber-500', card: 'calendar' },
  { x: -0.56, y: 0.47, icon: Check, badge: 'bg-emerald-500' },
  { x: 0.74, y: -0.28, icon: Check, badge: 'bg-emerald-500', card: 'reports' },
  { x: 0.68, y: 0.1, icon: MessageCircle, badge: 'bg-sky-500', card: 'chat' },
  { x: 0.84, y: 0.4, icon: ThumbsUp, badge: 'bg-amber-500', card: 'meeting' },
]
const NEARBY = computed<Nearby[]>(() => NEARBY_SLOTS.map((slot, index) => ({ ...slot, who: byIndex(index) })))
const AVATAR_RADIUS = 30

const PREVIEWS: { kind: PreviewKind; height: number; spot: [number, number] }[] = [
  { kind: 'board', height: 132, spot: [-1, -0.36] },
  { kind: 'reports', height: 116, spot: [1, -0.36] },
  { kind: 'chat', height: 118, spot: [1.04, 0.05] },
  { kind: 'calendar', height: 126, spot: [-1.02, 0.34] },
  { kind: 'meeting', height: 134, spot: [1.06, 0.4] },
]
const PREVIEW_WIDTH = 176
const ZOOMS = [1, 0.85, 0.72, 0.6]
const GAP = 8
const STEP = 12

interface Placement {
  kind: PreviewKind
  x: number
  y: number
  zoom: number
  rider?: Teammate
}
interface Box {
  left: number
  top: number
  right: number
  bottom: number
}
const overlaps = (a: Box, b: Box) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
const around = (x: number, y: number, halfWidth: number, halfHeight: number): Box => ({
  left: x - halfWidth,
  top: y - halfHeight,
  right: x + halfWidth,
  bottom: y + halfHeight,
})

const stageEl = ref<HTMLElement>()
const radarEl = ref<HTMLElement>()
const placements = ref<Placement[]>([])
const offStage = ref(new Set<string>())

function arrange() {
  const stage = stageEl.value
  const radar = radarEl.value
  if (!stage || !radar?.offsetWidth) {
    placements.value = []
    return
  }
  const bounds = stage.getBoundingClientRect()
  const circle = radar.getBoundingClientRect()
  const size = circle.width
  const centre = { x: circle.left + size / 2, y: circle.top + circle.height / 2 }
  const point = (x: number, y: number) => ({ x: centre.x + x * size, y: centre.y + y * size })
  const clearOfRadar = (box: Box) => {
    const nearestX = Math.max(box.left, Math.min(centre.x, box.right))
    const nearestY = Math.max(box.top, Math.min(centre.y, box.bottom))
    return Math.hypot(nearestX - centre.x, nearestY - centre.y) >= size / 2 - 4
  }
  const nearby = NEARBY.value
  const avatarBox = (near: Nearby) => {
    const at = point(near.x, near.y)
    return around(at.x, at.y, AVATAR_RADIUS, AVATAR_RADIUS)
  }

  const blocked: Box[] = [...stage.querySelectorAll<HTMLElement>('[data-obstacle]')].map((element) => element.getBoundingClientRect())
  const unlinked = nearby.filter((near) => !near.card).map(avatarBox)
  const placed: Box[] = []
  const result: Placement[] = []
  for (const preview of PREVIEWS) {
    const linked = nearby.find((near) => near.card === preview.kind)
    const want = point(...preview.spot)
    const left = preview.spot[0] < 0
    const obstacles = [...blocked, ...placed, ...unlinked]
    let best: { x: number; y: number; zoom: number; box: Box } | undefined
    search: for (const eitherSide of [false, true]) {
      for (const zoom of ZOOMS) {
        const halfWidth = (PREVIEW_WIDTH * zoom) / 2 + GAP
        const halfHeight = (preview.height * zoom) / 2 + GAP
        let nearest = Infinity
        for (let y = bounds.top + halfHeight - GAP; y <= bounds.bottom - halfHeight + GAP; y += STEP) {
          for (let x = bounds.left + halfWidth; x <= bounds.right - halfWidth; x += STEP) {
            if (!eitherSide && left !== x < centre.x) continue
            const distance = Math.hypot(x - want.x, y - want.y)
            if (distance >= nearest) continue
            const box = around(x, y, halfWidth, halfHeight)
            if (!clearOfRadar(box) || obstacles.some((other) => overlaps(box, other))) continue
            nearest = distance
            best = { x, y, zoom, box }
          }
        }
        if (best) break search
      }
    }
    if (!best) continue
    placed.push(best.box)
    result.push({
      kind: preview.kind,
      x: (best.x - centre.x) / size,
      y: (best.y - centre.y) / size,
      zoom: best.zoom,
      rider: linked && overlaps(best.box, avatarBox(linked)) ? linked.who : undefined,
    })
  }

  const away = new Set<string>()
  for (const near of nearby) {
    const rider = result.find((placement) => placement.rider === near.who)
    const box = avatarBox(near)
    const crowded = !clearOfRadar(box) || [...blocked, ...placed].some((other) => overlaps(box, other))
    if (rider || !crowded) {
      if (rider) away.add(near.who.name)
      continue
    }
    const card = near.card && result.find((placement) => placement.kind === near.card && !placement.rider)
    if (card) card.rider = near.who
    away.add(near.who.name)
  }
  placements.value = result
  offStage.value = away
}

useResizeObserver([stageEl, radarEl], () => arrange())
watch(portraits, () => arrange())
onMounted(() => {
  arrange()
  void document.fonts?.ready.then(arrange)
})

const STRIP = computed(() =>
  PREVIEWS.map((preview) => ({ kind: preview.kind, person: NEARBY.value.find((near) => near.card === preview.kind)?.who })),
)
const place = (x: number, y: number) => ({ left: `calc(50% + var(--radar) * ${x})`, top: `calc(50% + var(--radar) * ${y})` })
</script>

<template>
  <div class="orbit-shell relative flex min-h-dvh flex-col overflow-x-hidden bg-background lg:h-dvh lg:overflow-hidden lg:bg-brand">
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
    <div
      class="pointer-events-none absolute -top-40 -right-40 size-[32rem] opacity-60 blur-3xl lg:hidden"
      style="background: radial-gradient(closest-side, color-mix(in oklch, var(--brand-from) 22%, transparent), transparent)"
      aria-hidden="true"
    />

    <header class="relative z-10 flex h-14 shrink-0 items-center justify-between px-4 pt-safe sm:px-12 lg:h-16 lg:px-12 lg:text-white xl:px-16">
      <RouterLink :to="{ name: 'landing' }" class="lg:hidden" aria-label="Vector home"><AppLogo /></RouterLink>
      <RouterLink :to="{ name: 'landing' }" class="hidden lg:block" aria-label="Vector home"><AppLogo inverted /></RouterLink>
      <div class="flex items-center gap-2 sm:gap-3">
        <span class="hidden text-xs font-medium text-muted-foreground sm:inline lg:text-white/80">{{ headerHint }}</span>
        <slot name="header-actions" />
        <span class="flex lg:hidden"><ThemeSwitch /></span>
        <span class="hidden lg:flex"><ThemeSwitch inverted /></span>
      </div>
    </header>

    <div
      ref="stageEl"
      class="orbit-stage relative z-10 flex min-h-0 flex-1 lg:grid lg:grid-cols-[minmax(0,1fr)_var(--radar)_minmax(0,1fr)] lg:gap-4 lg:px-6 xl:px-10"
    >
      <aside
        class="relative hidden min-h-0 flex-col justify-center gap-10 py-6 text-white short:gap-6 lg:col-start-1 lg:row-start-1 lg:flex"
        aria-hidden="true"
      >
        <div class="space-y-5 short:space-y-3" data-obstacle>
          <span
            class="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 py-1 pr-3.5 pl-1.5 text-xs font-medium whitespace-nowrap shadow-lg shadow-black/10 backdrop-blur-md"
          >
            <span class="flex size-5 items-center justify-center rounded-full bg-linear-to-br from-fuchsia-300 to-violet-500">
              <Sparkles class="size-3 text-white" />
            </span>
            {{ eyebrow }}
            <span class="live-dot ml-0.5 size-1.5 rounded-full bg-emerald-300" />
          </span>
          <h2 class="text-[clamp(1.6rem,2.1vw,3rem)] leading-[1.08] font-semibold tracking-tight">
            {{ headline }}<br />
            <span class="bg-linear-to-r from-cyan-200 to-fuchsia-200 bg-clip-text text-transparent">{{ headlineAccent }}</span>
          </h2>
          <p class="max-w-sm text-sm text-white/80 xl:text-base">{{ description }}</p>
        </div>

        <div class="hidden items-center gap-3 xl:flex" data-obstacle>
          <span class="flex shrink-0 -space-x-2.5">
            <img
              v-for="who in COMMUNITY"
              :key="who.name + who.src"
              :src="who.src"
              alt=""
              class="size-10 rounded-full bg-linear-to-br object-cover shadow-md ring-2 ring-white/80 short:size-8"
              :class="who.tone"
            />
          </span>
          <span class="text-xs leading-snug text-white/80">
            <span class="block font-semibold text-white">Teams &amp; feedback</span>
            Developers who ship with Vector
          </span>
        </div>
      </aside>

      <div
        v-if="showRadar"
        class="radar-frame-small pointer-events-none absolute inset-0 items-center justify-center"
        aria-hidden="true"
      >
        <FeatureRadar variant="frame" :small="isPhone" class="w-[var(--radar)] shrink-0" />
      </div>

      <div
        ref="radarEl"
        class="pointer-events-none absolute inset-0 hidden items-center justify-center lg:col-[2/3] lg:row-[1/2] lg:flex"
        aria-hidden="true"
      >
        <!-- Invisible size anchor so floaters still orbit the glass when the radar ring is hidden. -->
        <div class="relative w-[var(--radar)] shrink-0" :class="!showRadar && 'aspect-square'">
          <div v-if="showRadar" class="radar-halo absolute size-[calc(100%*1.15)] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 shrink-0 rounded-full blur-3xl" />
          <FeatureRadar v-if="showRadar" variant="frame" class="relative w-full" />
        </div>
        <ul class="absolute size-[var(--radar)] text-white">
          <li
            v-for="(item, index) in HIGHLIGHTS"
            :key="item.title"
            class="absolute w-max -translate-y-1/2"
            :class="item.x < 0 && '-translate-x-full'"
            :style="place(item.x, item.y)"
            data-obstacle
          >
            <span
              class="float-pill flex items-center gap-3 rounded-full border border-white/20 bg-white/10 py-1.5 pr-5 pl-1.5 whitespace-nowrap shadow-xl shadow-black/15 backdrop-blur-md"
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
        <div class="absolute size-[var(--radar)] text-white">
          <div class="absolute w-max -translate-x-full -translate-y-1/2" :style="place(-0.3, -0.42)" data-obstacle>
            <ShowcaseChip kind="online" class="float-pill" :style="{ animationDelay: '1s, -0.8s' }" />
          </div>
          <div class="absolute w-max -translate-y-1/2" :style="place(0.52, -0.12)" data-obstacle>
            <ShowcaseChip kind="quote" :quote-index="0" class="float-pill" :style="{ animationDelay: '1.2s, -3.2s' }" />
          </div>
          <div class="absolute w-max -translate-x-full -translate-y-1/2" :style="place(-0.48, 0.18)" data-obstacle>
            <ShowcaseChip kind="quote" :quote-index="1" class="float-pill" :style="{ animationDelay: '1.5s, -1.6s' }" />
          </div>
          <div class="absolute w-max -translate-y-1/2" :style="place(0.36, 0.47)" data-obstacle>
            <ShowcaseChip kind="standup" class="float-pill" :style="{ animationDelay: '1.4s, -2.4s' }" />
          </div>

          <span
            v-for="(near, index) in NEARBY.filter((near) => !offStage.has(near.who.name))"
            :key="near.who.name"
            class="absolute -translate-1/2"
            :style="place(near.x, near.y)"
          >
            <span
              class="avatar-blip float-pill relative block size-12 rounded-full shadow-xl shadow-black/20 short:size-10"
              :style="{ animationDelay: `${1.4 + index * 0.15}s, ${index * -0.9}s` }"
            >
              <img :src="near.who.src" alt="" class="size-full rounded-full bg-linear-to-br object-cover ring-2 ring-white/80" :class="near.who.tone" />
              <span class="absolute -right-1 -bottom-1 flex size-5 items-center justify-center rounded-full text-white ring-2 ring-white" :class="near.badge">
                <component :is="near.icon" class="size-3" />
              </span>
            </span>
          </span>

          <span v-for="(preview, index) in placements" :key="preview.kind" class="absolute -translate-1/2" :style="place(preview.x, preview.y)">
            <FeaturePreview
              :kind="preview.kind"
              :person="preview.rider"
              class="float-pill"
              :style="{ scale: preview.zoom, animationDelay: `${1.6 + index * 0.15}s, ${index * -1.1}s` }"
            />
          </span>
        </div>
      </div>

      <main class="relative z-10 flex w-full min-h-0 flex-col px-4 pb-4 sm:px-12 lg:col-[2/3] lg:row-[1/2] lg:overflow-y-auto lg:px-0 lg:py-6">
        <div class="flex flex-1 flex-col items-center justify-center py-3 short:py-2 sm:py-6 lg:py-0">
          <div
            class="w-full lg:text-card-foreground"
            :class="variant === 'sheet' ? 'orbit-card orbit-card--sheet sm:max-w-[22rem]' : 'orbit-card sm:max-w-[22rem]'"
          >
            <span class="orbit-card-sheen" aria-hidden="true" />
            <div class="orbit-card-body" :class="variant === 'sheet' && 'orbit-card-body--sheet'">
              <slot />
            </div>
          </div>
        </div>
      </main>
    </div>

    <section
      class="orbit-showcase relative z-10 mx-3 mb-3 mt-1 space-y-4 overflow-hidden rounded-2xl bg-brand px-4 py-5 text-white shadow-xl shadow-black/15 sm:mx-12 sm:mt-2 sm:space-y-5 sm:rounded-[1.5rem] sm:px-8 sm:py-6 md:hidden"
      aria-hidden="true"
    >
      <div class="space-y-2.5 sm:space-y-3">
        <span class="inline-flex max-w-full items-center gap-2 rounded-full border border-white/25 bg-white/10 py-1 pr-3 pl-1.5 text-[11px] font-medium backdrop-blur-md sm:text-xs sm:pr-3.5">
          <span class="flex size-5 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-fuchsia-300 to-violet-500">
            <Sparkles class="size-3 text-white" />
          </span>
          <span class="truncate">{{ eyebrow }}</span>
        </span>
        <h2 class="text-[1.35rem] leading-tight font-semibold tracking-tight sm:text-3xl">
          {{ headline }}<br />
          <span class="bg-linear-to-r from-cyan-200 to-fuchsia-200 bg-clip-text text-transparent">{{ headlineAccent }}</span>
        </h2>
        <p class="max-w-md text-[13px] leading-relaxed text-white/80 sm:text-sm">{{ description }}</p>
      </div>

      <div class="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <span
          v-for="item in HIGHLIGHTS"
          :key="item.title"
          class="flex min-w-0 items-center gap-2 rounded-full border border-white/20 bg-white/10 py-1.5 pr-3 pl-1.5 text-xs font-semibold backdrop-blur-md"
        >
          <span class="flex size-7 shrink-0 items-center justify-center rounded-full bg-linear-to-br" :class="item.tone">
            <component :is="item.icon" class="size-3.5" />
          </span>
          <span class="truncate">{{ item.title }}</span>
        </span>
      </div>

      <div class="hidden flex-wrap gap-2.5 sm:flex">
        <ShowcaseChip kind="online" />
        <ShowcaseChip kind="quote" :quote-index="0" />
        <ShowcaseChip kind="quote" :quote-index="1" />
        <ShowcaseChip kind="standup" />
      </div>

      <div class="showcase-strip -mx-4 overflow-hidden pt-2 pb-1 sm:-mx-8 sm:pt-4">
        <div class="showcase-track flex w-max">
          <div v-for="(card, index) in [...STRIP, ...STRIP]" :key="index" class="pl-4 sm:pl-5">
            <FeaturePreview :kind="card.kind" :person="card.person" />
          </div>
        </div>
      </div>

      <div class="flex items-center gap-3">
        <span class="flex shrink-0 -space-x-2.5">
          <img
            v-for="who in COMMUNITY"
            :key="who.name + who.src"
            :src="who.src"
            alt=""
            class="size-8 rounded-full bg-linear-to-br object-cover shadow-md ring-2 ring-white/80 sm:size-9"
            :class="who.tone"
          />
        </span>
        <span class="min-w-0 text-xs leading-snug text-white/80">
          <span class="block font-semibold text-white">Teams &amp; feedback</span>
          Developers who ship with Vector
        </span>
      </div>
    </section>

    <footer
      class="relative z-10 flex h-11 shrink-0 flex-wrap items-center justify-between gap-x-4 px-4 pb-safe text-xs text-muted-foreground sm:h-12 sm:px-12 lg:text-white/70 xl:px-16"
    >
      <span>© {{ year }} Vector</span>
      <slot name="footer" />
    </footer>
  </div>
</template>

<style scoped>
@media (min-width: 64rem) {
  .dark .orbit-shell {
    background-image: linear-gradient(135deg, #0b0a1f 0%, #15123a 55%, #261040 100%);
  }
}

.dark .orbit-showcase {
  background-image: linear-gradient(135deg, #15123a 0%, #1e1a52 55%, #34155a 100%);
}

.showcase-strip {
  mask-image: linear-gradient(to right, transparent, black 1.5rem, black calc(100% - 1.5rem), transparent);
}
.showcase-track {
  animation: strip-scroll 36s linear infinite;
}
@keyframes strip-scroll {
  to {
    transform: translateX(-50%);
  }
}

.float-pill {
  animation:
    pill-in 0.6s ease-out both,
    pill-float 5s ease-in-out infinite;
}
.live-dot {
  box-shadow: 0 0 0 0 rgb(110 231 183 / 0.7);
  animation: live-pulse 2s ease-out infinite;
}
.avatar-blip::after {
  content: '';
  position: absolute;
  inset: -2px;
  border-radius: inherit;
  border: 2px solid rgb(255 255 255 / 0.6);
  animation: blip-ring 2.8s ease-out infinite;
  animation-delay: inherit;
}
@keyframes blip-ring {
  from {
    transform: scale(1);
    opacity: 0.8;
  }
  70%,
  to {
    transform: scale(1.9);
    opacity: 0;
  }
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

@property --edge-angle {
  syntax: '<angle>';
  initial-value: 0deg;
  inherits: false;
}

@media (min-width: 64rem) {
  .orbit-stage {
    --radar: min(48rem, calc(100dvh - 6.5rem), calc(100vw - 32rem));
    --disc: calc(var(--radar) * 0.78);
  }
  .radar-frame-small {
    display: none;
  }
}
@media (min-width: 64rem) and (max-height: 760px) {
  .orbit-stage {
    --disc: calc(var(--radar) * 0.8);
    --compact: 0.86;
  }
}
@media (min-width: 40rem) and (max-width: 63.99rem) {
  .orbit-stage {
    --radar: max(34rem, min(44rem, calc(100vw - 2rem), calc(100dvh - 8.5rem)));
    --disc: calc(var(--radar) * 0.8);
    --compact: 0.9;
    min-height: calc(var(--radar) + 1rem);
  }
  .radar-frame-small {
    display: flex;
  }
}

.orbit-card {
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
/* Same seat in the radar as the circle — slightly squarer glass for longer pages. */
.orbit-card--sheet {
  border-radius: 1.75rem;
}
.orbit-card-body {
  zoom: var(--compact, 1);
  width: calc(var(--disc) * 0.65 / var(--compact, 1));
  max-height: calc(var(--disc) * 0.9 / var(--compact, 1));
  overflow-y: auto;
  padding: 0.5rem 0.25rem;
}
.orbit-card-body--sheet {
  width: calc(var(--disc) * 0.78 / var(--compact, 1));
  max-height: calc(var(--disc) * 0.88 / var(--compact, 1));
  padding: 0.75rem 0.5rem;
}

.dark .orbit-card {
  --glass: radial-gradient(circle at 30% 20%, rgb(67 56 202 / 0.5), rgb(15 14 40 / 0.45) 55%, rgb(30 27 75 / 0.55));
  --glass-border: rgb(255 255 255 / 0.14);
  --glass-shine: rgb(255 255 255 / 0.14);
  --glass-shadow: rgb(0 0 0 / 0.65);
  --sheen: rgb(255 255 255 / 0.12);
}

.orbit-card::after {
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

.orbit-card-sheen {
  position: absolute;
  inset: 0;
  z-index: -1;
  overflow: hidden;
  border-radius: inherit;
  pointer-events: none;
}
.orbit-card-sheen::before {
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
  .orbit-card,
  .orbit-card::after,
  .orbit-card-sheen::before,
  .float-pill,
  .live-dot,
  .avatar-blip::after,
  .showcase-track {
    animation: none;
  }
  .showcase-strip {
    overflow-x: auto;
  }
}

@media (max-width: 39.99rem) {
  .orbit-stage {
    --radar: 22rem;
    --disc: auto;
    --compact: 1;
    min-height: 0;
  }
  .radar-frame-small {
    display: flex;
    top: -2rem;
    opacity: 0.35;
    pointer-events: none;
    mask-image: radial-gradient(ellipse 70% 55% at 50% 40%, black 20%, transparent 70%);
  }
  .orbit-card {
    display: block;
    width: 100%;
    max-width: 24rem;
    height: auto;
    min-height: 0;
    border-radius: 1.25rem;
    padding: 0;
    box-shadow:
      0 18px 48px -20px rgb(30 10 80 / 0.28),
      inset 0 1px 0 var(--glass-shine);
  }
  .orbit-card--sheet {
    border-radius: 1.25rem;
  }
  .orbit-card-body {
    zoom: 1;
    width: 100%;
    max-width: none;
    max-height: none;
    overflow: visible;
    padding: 1.35rem 1.2rem 1.2rem;
  }
  .orbit-card-body--sheet {
    width: 100%;
    max-height: min(70dvh, 36rem);
    overflow-y: auto;
    padding: 1.35rem 1.2rem 1.2rem;
  }
  .orbit-card::after {
    display: none;
  }
}
</style>

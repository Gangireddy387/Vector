<script setup lang="ts">
import { Check, LayoutGrid, ListTodo, Sparkles } from 'lucide-vue-next'
import { onBeforeUnmount, onMounted, ref } from 'vue'

/**
 * Compact Home ↔ Board motion demo for the landing disc — mirrors the real sample
 * project so the first viewport shows product, not abstract marketing chrome.
 */
const mode = ref<'home' | 'board'>('home')
const moved = ref(false)
let cycle: ReturnType<typeof setInterval> | null = null
let moveTimer: ReturnType<typeof setTimeout> | null = null

const HOME_TASKS = [
  { key: 'DEMO-6', title: 'Hero image loads slowly on phones', due: 'Overdue', tone: 'text-destructive' },
  { key: 'DEMO-4', title: 'Set up the contact form backend', due: 'Today', tone: 'text-amber-700 dark:text-amber-300' },
  { key: 'DEMO-5', title: 'Write copy for the pricing page', due: 'Today', tone: 'text-amber-700 dark:text-amber-300' },
] as const

function runBoardMove() {
  moved.value = false
  if (moveTimer) clearTimeout(moveTimer)
  moveTimer = setTimeout(() => {
    moved.value = true
  }, 700)
}

function tick() {
  if (mode.value === 'home') {
    mode.value = 'board'
    runBoardMove()
  } else {
    mode.value = 'home'
    moved.value = false
  }
}

onMounted(() => {
  cycle = setInterval(tick, 4200)
  // First board beat after a beat on Home.
  moveTimer = setTimeout(() => {
    mode.value = 'board'
    runBoardMove()
  }, 2800)
})

onBeforeUnmount(() => {
  if (cycle) clearInterval(cycle)
  if (moveTimer) clearTimeout(moveTimer)
})
</script>

<template>
  <div
    class="landing-preview overflow-hidden rounded-xl border border-border/80 bg-card/95 text-left shadow-elevated backdrop-blur-sm"
    aria-hidden="true"
  >
    <div class="flex items-center gap-2 border-b border-border/70 px-2.5 py-1.5">
      <span class="size-2 rounded-full bg-emerald-500" />
      <span class="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">Live preview</span>
      <span class="ml-auto inline-flex gap-1 rounded-md bg-muted/80 p-0.5">
        <span
          class="rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors"
          :class="mode === 'home' ? 'bg-card text-foreground shadow-soft' : 'text-muted-foreground'"
        >
          Home
        </span>
        <span
          class="rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors"
          :class="mode === 'board' ? 'bg-card text-foreground shadow-soft' : 'text-muted-foreground'"
        >
          Board
        </span>
      </span>
    </div>

    <div class="relative h-[9.75rem] overflow-hidden">
      <Transition name="landing-preview-swap">
        <!-- Home -->
        <div v-if="mode === 'home'" key="home" class="absolute inset-0 space-y-2 p-2.5">
          <div class="flex items-center gap-1.5">
            <Sparkles class="size-3 text-primary" />
            <p class="text-[11px] font-semibold">Good morning · Your workday</p>
          </div>
          <div class="grid grid-cols-4 gap-1">
            <div
              v-for="(step, i) in ['Standup', 'Tasks', 'Meet', 'Chat']"
              :key="step"
              class="rounded-md border border-border/60 bg-muted/40 px-1 py-1.5 text-center"
              :class="i === 1 && 'border-primary/40 bg-primary/10'"
            >
              <p class="text-[9px] font-semibold">{{ step }}</p>
            </div>
          </div>
          <ul class="space-y-1">
            <li
              v-for="(task, i) in HOME_TASKS"
              :key="task.key"
              class="flex items-center gap-1.5 rounded-md border border-border/60 bg-background/80 px-1.5 py-1"
              :style="{ animationDelay: `${i * 60}ms` }"
            >
              <ListTodo class="size-3 shrink-0 text-muted-foreground" />
              <span class="text-[9px] text-muted-foreground tabular-nums">{{ task.key }}</span>
              <span class="min-w-0 flex-1 truncate text-[10px] font-medium">{{ task.title }}</span>
              <span class="shrink-0 text-[9px] font-medium" :class="task.tone">{{ task.due }}</span>
            </li>
          </ul>
        </div>

        <!-- Board -->
        <div v-else key="board" class="absolute inset-0 p-2">
          <div class="mb-1.5 flex items-center gap-1.5 px-0.5">
            <LayoutGrid class="size-3 text-primary" />
            <p class="truncate text-[10px] font-semibold">Sample: Website launch</p>
            <span class="rounded bg-muted px-1 text-[8px] font-semibold text-muted-foreground">DEMO</span>
          </div>
          <div class="grid h-[7.5rem] grid-cols-3 gap-1.5">
            <section class="flex min-w-0 flex-col gap-1 rounded-md bg-muted/50 p-1">
              <p class="px-0.5 text-[9px] font-semibold text-muted-foreground">To do</p>
              <article
                class="rounded border border-border/70 bg-card px-1.5 py-1 shadow-soft transition-all duration-500"
                :class="moved ? 'pointer-events-none scale-95 opacity-0' : 'opacity-100'"
              >
                <p class="text-[8px] text-muted-foreground tabular-nums">DEMO-6</p>
                <p class="line-clamp-2 text-[9px] leading-snug font-medium">Hero image loads slowly…</p>
              </article>
              <article class="rounded border border-border/70 bg-card px-1.5 py-1">
                <p class="text-[8px] text-muted-foreground tabular-nums">DEMO-7</p>
                <p class="line-clamp-1 text-[9px] font-medium">Analytics & consent</p>
              </article>
            </section>
            <section class="relative flex min-w-0 flex-col gap-1 rounded-md bg-muted/50 p-1">
              <p class="px-0.5 text-[9px] font-semibold text-muted-foreground">In progress</p>
              <article class="rounded border border-border/70 bg-card px-1.5 py-1">
                <p class="text-[8px] text-muted-foreground tabular-nums">DEMO-4</p>
                <p class="line-clamp-1 text-[9px] font-medium">Contact form backend</p>
              </article>
              <article
                class="rounded border border-primary/40 bg-card px-1.5 py-1 shadow-elevated transition-all duration-500"
                :class="moved ? 'translate-y-0 opacity-100' : 'pointer-events-none -translate-y-2 opacity-0'"
              >
                <p class="flex items-center gap-0.5 text-[8px] text-muted-foreground tabular-nums">
                  DEMO-6
                  <Check v-if="moved" class="size-2.5 text-primary" />
                </p>
                <p class="line-clamp-2 text-[9px] leading-snug font-medium">Hero image loads slowly…</p>
              </article>
            </section>
            <section class="flex min-w-0 flex-col gap-1 rounded-md bg-muted/50 p-1">
              <p class="px-0.5 text-[9px] font-semibold text-muted-foreground">Done</p>
              <article class="rounded border border-border/70 bg-card/70 px-1.5 py-1 opacity-80">
                <p class="text-[8px] text-muted-foreground tabular-nums">DEMO-2</p>
                <p class="line-clamp-1 text-[9px] font-medium">Design homepage</p>
              </article>
            </section>
          </div>
        </div>
      </Transition>
    </div>
  </div>
</template>

<style scoped>
.landing-preview-swap-enter-active,
.landing-preview-swap-leave-active {
  transition:
    opacity 320ms var(--ease-out-soft, ease),
    transform 320ms var(--ease-out-soft, ease);
}
.landing-preview-swap-enter-from {
  opacity: 0;
  transform: translateY(0.4rem);
}
.landing-preview-swap-leave-to {
  opacity: 0;
  transform: translateY(-0.3rem);
}
@media (prefers-reduced-motion: reduce) {
  .landing-preview-swap-enter-active,
  .landing-preview-swap-leave-active {
    transition: none;
  }
  .landing-preview-swap-enter-from,
  .landing-preview-swap-leave-to {
    transform: none;
  }
}
</style>

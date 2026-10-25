<script setup lang="ts">
import { Bot, CalendarSync, Sparkles, Zap } from 'lucide-vue-next'
import AppLogo from '@/components/layout/AppLogo.vue'
import { useWorkspaceStore } from '@/stores/workspace.store'

const workspace = useWorkspaceStore()
const year = new Date().getFullYear()

const HIGHLIGHTS = [
  { icon: Zap, title: 'Automation rules', text: 'Triage, assign and notify on their own.' },
  { icon: CalendarSync, title: 'Recurring work', text: 'Routine tasks appear on schedule.' },
  { icon: Bot, title: 'AI assistant', text: 'Draft issues and break work down.' },
]

/** Static content for the product preview on the right; purely illustrative. */
const PREVIEW_COLUMNS = [
  {
    name: 'To do',
    dot: 'bg-zinc-400',
    cards: [
      { title: 'Invite teammates step', key: 'VEC-5', label: 'onboarding', labelClass: 'bg-violet-100 text-violet-700', avatar: 'PS', color: '#ec4899' },
      { title: 'Burndown chart', key: 'VEC-12', label: 'frontend', labelClass: 'bg-sky-100 text-sky-700', avatar: 'DR', color: '#f59e0b' },
    ],
  },
  {
    name: 'In progress',
    dot: 'bg-blue-500',
    cards: [
      { title: 'Guided project setup', key: 'VEC-2', label: 'design', labelClass: 'bg-pink-100 text-pink-700', avatar: 'MC', color: '#10b981' },
    ],
  },
  {
    name: 'Done',
    dot: 'bg-emerald-500',
    cards: [
      { title: 'Welcome screen', key: 'VEC-3', label: 'design', labelClass: 'bg-pink-100 text-pink-700', avatar: 'AM', color: '#6366f1', done: true },
      { title: 'Mention emails', key: 'VEC-10', label: 'backend', labelClass: 'bg-orange-100 text-orange-700', avatar: 'DR', color: '#f59e0b', done: true },
    ],
  },
]
</script>

<template>
  <div class="grid min-h-dvh bg-background lg:h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:overflow-hidden">
    <!-- Form side -->
    <main class="relative flex flex-col overflow-x-hidden px-6 pt-safe pb-safe sm:px-12 lg:overflow-y-auto">
      <div
        class="pointer-events-none absolute -top-40 -left-40 size-[32rem] opacity-60 blur-3xl"
        style="background: radial-gradient(closest-side, color-mix(in oklch, var(--brand-from) 22%, transparent), transparent)"
      />
      <header class="relative flex h-14 shrink-0 items-center justify-between">
        <AppLogo />
        <span class="text-xs font-medium text-muted-foreground">{{ workspace.settings.slug ? workspace.settings.name : 'Work management for every team' }}</span>
      </header>

      <div class="relative flex flex-1 items-center justify-center py-6 short:py-2">
        <div class="w-full max-w-[22rem]">
          <RouterView />
        </div>
      </div>

      <footer class="relative flex h-12 shrink-0 flex-wrap items-center justify-between gap-x-4 text-xs text-muted-foreground">
        <span>© {{ year }} Vector</span>
        <nav class="flex items-center gap-4" aria-label="Legal">
          <RouterLink :to="{ name: 'privacy' }" class="hover:text-foreground">Privacy</RouterLink>
          <RouterLink :to="{ name: 'terms' }" class="hover:text-foreground">Terms</RouterLink>
        </nav>
      </footer>
    </main>

    <!-- Product showcase -->
    <aside class="relative m-3 hidden overflow-hidden bg-brand lg:flex lg:flex-col" aria-hidden="true">
      <div
        class="absolute inset-0"
        style="
          background:
            radial-gradient(38rem 30rem at 90% 0%, oklch(0.82 0.13 330 / 0.55), transparent 60%),
            radial-gradient(34rem 28rem at 0% 100%, oklch(0.78 0.13 220 / 0.55), transparent 60%);
        "
      />
      <div
        class="absolute inset-0 opacity-[0.14]"
        style="
          background-image: linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px);
          background-size: 44px 44px;
          mask-image: radial-gradient(ellipse at 50% 40%, black 25%, transparent 75%);
        "
      />

      <div class="relative flex flex-1 flex-col justify-center gap-10 px-12 py-10 text-white short:gap-7 short:py-6 xl:px-16">
        <div class="max-w-xl space-y-4 short:space-y-3">
          <span class="inline-flex items-center gap-2 border border-white/30 bg-white/10 px-3 py-1 text-xs font-medium backdrop-blur">
            <Sparkles class="size-3.5" /> AI drafts · Automation · Recurring work
          </span>
          <h2 class="text-5xl leading-[1.05] font-semibold tracking-tight short:text-4xl">
            Less busywork.<br />
            <span class="text-white/70">More shipped work.</span>
          </h2>
          <p class="max-w-md text-base text-white/80">Plan, track and automate your team’s work so the boring parts happen on their own.</p>
        </div>

        <!-- Mini product preview -->
        <div class="relative mr-8 ml-2 max-w-2xl">
          <div class="border border-white/30 bg-white/15 p-3 shadow-2xl backdrop-blur-xl">
            <div class="mb-3 flex items-center gap-1.5">
              <span v-for="dot in 3" :key="dot" class="size-2.5 rounded-full bg-white/45" />
              <span class="ml-3 text-[11px] font-medium text-white/80">Vector Platform · Sprint 1</span>
            </div>
            <div class="grid grid-cols-3 gap-2.5">
              <div v-for="column in PREVIEW_COLUMNS" :key="column.name" class="space-y-2 bg-white/10 p-2">
                <p class="flex items-center gap-1.5 px-0.5 text-[10px] font-semibold tracking-wide text-white/85 uppercase">
                  <span class="size-1.5 rounded-full" :class="column.dot" /> {{ column.name }}
                  <span class="ml-auto font-normal text-white/60">{{ column.cards.length }}</span>
                </p>
                <div v-for="card in column.cards" :key="card.key" class="space-y-2 bg-white p-2.5 text-zinc-800 shadow-sm">
                  <p class="text-xs leading-snug font-medium" :class="'done' in card && 'text-zinc-400 line-through'">{{ card.title }}</p>
                  <div class="flex items-center gap-1.5">
                    <span class="text-[10px] text-zinc-500">{{ card.key }}</span>
                    <span class="px-1.5 py-px text-[9px] font-medium" :class="card.labelClass">{{ card.label }}</span>
                    <span
                      class="ml-auto flex size-4 items-center justify-center rounded-full text-[7px] font-semibold text-white"
                      :style="{ backgroundColor: card.color }"
                    >
                      {{ card.avatar }}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="absolute -top-7 -right-8 w-52 space-y-2 bg-white p-3 text-zinc-800 shadow-2xl">
            <p class="flex items-center justify-between text-xs font-semibold">Sprint 1 <span class="font-normal text-zinc-500">9 days left</span></p>
            <div class="h-1.5 bg-zinc-200"><div class="h-full w-[72%] bg-emerald-500" /></div>
            <p class="text-[11px] text-zinc-500">72% done · 18/25 pts</p>
          </div>

          <div class="absolute -bottom-8 -left-6 flex w-72 items-start gap-3 bg-white p-3 text-zinc-800 shadow-2xl">
            <span class="flex size-8 shrink-0 items-center justify-center bg-brand text-white"><Zap class="size-4" /></span>
            <span class="min-w-0">
              <span class="block text-xs font-semibold">Automation ran</span>
              <span class="block text-[11px] text-zinc-500">New bug VEC-24 assigned to Priya · just now</span>
            </span>
          </div>
        </div>

        <ul class="mt-6 grid max-w-2xl grid-cols-3 gap-6 short:hidden">
          <li v-for="item in HIGHLIGHTS" :key="item.title" class="space-y-1.5">
            <component :is="item.icon" class="size-5 text-white/90" />
            <p class="text-sm font-semibold">{{ item.title }}</p>
            <p class="text-xs leading-relaxed text-white/70">{{ item.text }}</p>
          </li>
        </ul>
      </div>
    </aside>
  </div>
</template>

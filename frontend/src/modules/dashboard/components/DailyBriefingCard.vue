<script setup lang="ts">
import { useStorage } from '@vueuse/core'
import { ChevronDown, ClipboardList, Loader2, Sparkles, Video } from 'lucide-vue-next'
import { ref } from 'vue'
import { RouterLink } from 'vue-router'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/modules/auth/auth.store'
import { type DailyBriefing, aiApi } from '@/modules/issues/api/ai.api'
import { getErrorMessage } from '@/lib/http'

const auth = useAuthStore()
const briefing = ref<DailyBriefing | null>(null)
const isLoading = ref(false)
const error = ref<string | null>(null)
/** Collapsed by default so Home’s first viewport stays Loop + Today. */
const expanded = useStorage('vector.home.briefingExpanded', false)

async function load() {
  if (!auth.hasFeature('aiAssistant')) return
  isLoading.value = true
  error.value = null
  expanded.value = true
  try {
    briefing.value = await aiApi.dailyBriefing()
  } catch (problem) {
    error.value = getErrorMessage(problem)
  } finally {
    isLoading.value = false
  }
}

function toggle() {
  expanded.value = !expanded.value
  if (expanded.value && !briefing.value && !isLoading.value) void load()
}
</script>

<template>
  <section id="daily-briefing" v-if="auth.hasFeature('aiAssistant')" class="overflow-hidden rounded-xl border border-border bg-card shadow-soft">
    <header class="flex h-12 items-center gap-2 border-b border-border px-4">
      <button type="button" class="flex min-w-0 flex-1 items-center gap-2 text-left" @click="toggle">
        <Sparkles class="size-4 shrink-0 text-primary" />
        <h2 class="text-sm font-semibold">Daily briefing</h2>
        <ChevronDown class="size-4 text-muted-foreground transition-transform" :class="expanded && 'rotate-180'" />
      </button>
      <Button v-if="expanded" variant="ghost" size="sm" class="text-muted-foreground" :disabled="isLoading" @click="load">
        <Loader2 v-if="isLoading" class="size-3.5 animate-spin" />
        <template v-else>Refresh</template>
      </Button>
    </header>

    <div v-if="expanded">
      <div v-if="isLoading && !briefing" class="flex items-center gap-2 px-4 py-6 text-sm text-muted-foreground">
        <Loader2 class="size-4 animate-spin" /> Preparing what needs you today…
      </div>
      <div v-else-if="error && !briefing" class="space-y-3 px-4 py-5">
        <p class="text-sm text-destructive">{{ error }}</p>
        <Button variant="outline" size="sm" @click="load">Try again</Button>
      </div>
      <div v-else-if="briefing" class="space-y-4 px-4 py-3">
        <div>
          <p class="text-[13.5px] font-medium">{{ briefing.needsMe.headline }}</p>
          <p v-if="briefing.needsMe.source !== 'openai'" class="mt-1 text-[11px] text-muted-foreground">
            {{ briefing.needsMe.source === 'degraded' ? 'OpenAI unavailable — smart briefing.' : 'Smart briefing — add an OpenAI key for richer AI.' }}
          </p>
          <ul v-if="(briefing.needsMe.focusActions ?? briefing.needsMe.focus.map((text) => ({ text, issueKey: null as string | null }))).length" class="mt-2 space-y-1">
            <li
              v-for="(item, index) in briefing.needsMe.focusActions ?? briefing.needsMe.focus.map((text) => ({ text, issueKey: null as string | null }))"
              :key="index"
              class="text-[12.5px] text-muted-foreground"
            >
              ·
              <RouterLink
                v-if="item.issueKey"
                :to="{ name: 'issue', params: { issueKey: item.issueKey } }"
                class="font-medium text-foreground hover:text-primary hover:underline"
              >
                {{ item.text }}
              </RouterLink>
              <template v-else>{{ item.text }}</template>
            </li>
          </ul>
          <div v-if="briefing.needsMe.tasks.overdue.length || briefing.needsMe.tasks.dueToday.length" class="mt-2 flex flex-wrap gap-1.5">
            <RouterLink
              v-for="task in [...briefing.needsMe.tasks.overdue, ...briefing.needsMe.tasks.dueToday].slice(0, 5)"
              :key="task.id"
              :to="{ name: 'issue', params: { issueKey: task.key } }"
              class="rounded-md border border-border bg-muted/40 px-2 py-0.5 text-[11.5px] font-medium hover:bg-accent"
            >
              {{ task.key }}
            </RouterLink>
          </div>
        </div>

        <div v-if="briefing.standupDrafts.length" class="space-y-2 border-t border-border/70 pt-3">
          <p class="flex items-center gap-1.5 text-[12px] font-semibold text-muted-foreground"><ClipboardList class="size-3.5" /> Draft standups</p>
          <RouterLink
            v-for="row in briefing.standupDrafts"
            :key="row.projectId"
            :to="{ name: 'project-standup', params: { projectId: row.projectId }, query: { date: row.date, draft: '1' } }"
            class="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-[13px] transition-colors hover:bg-accent/50"
          >
            <span class="size-2.5 shrink-0 rounded-[3px]" :style="{ backgroundColor: row.projectColor }" />
            <span class="min-w-0 flex-1 truncate font-medium">{{ row.projectName }}</span>
            <span class="text-[11.5px] text-muted-foreground">Use draft</span>
          </RouterLink>
        </div>

        <div v-if="briefing.meetingPrep.length" class="space-y-2 border-t border-border/70 pt-3">
          <p class="flex items-center gap-1.5 text-[12px] font-semibold text-muted-foreground"><Video class="size-3.5" /> Prep meetings</p>
          <RouterLink
            v-for="meeting in briefing.meetingPrep"
            :key="meeting.meetingId"
            :to="{ name: 'meeting-room', params: { meetingId: meeting.meetingId } }"
            class="block rounded-lg border border-border px-3 py-2 transition-colors hover:bg-accent/50"
          >
            <p class="truncate text-[13px] font-medium">{{ meeting.title }}</p>
            <p class="mt-0.5 line-clamp-2 whitespace-pre-line text-[11.5px] text-muted-foreground">{{ meeting.agenda }}</p>
          </RouterLink>
        </div>
      </div>
      <div v-else class="px-4 py-5 text-sm text-muted-foreground">Nothing to brief yet.</div>
    </div>
    <p v-else class="px-4 py-3 text-[12.5px] text-muted-foreground">Open for AI focus, standup drafts, and meeting prep.</p>
  </section>
</template>

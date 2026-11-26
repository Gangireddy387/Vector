<script setup lang="ts">
import { Compass, Route, Search, SearchX, Sparkles } from 'lucide-vue-next'
import { computed, nextTick, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { Input } from '@/components/ui/input'
import { useAuthStore } from '@/modules/auth/auth.store'
import {
  nextTopic,
  previousTopic,
  searchTopics,
  topicForRoute,
  visibleTopics,
  type GuideCategory,
  type GuideTopic,
} from '../guide-content'
import HelpTopicArticle from './HelpTopicArticle.vue'

const props = defineProps<{
  initialTopicId?: string | null
  compact?: boolean
}>()

const emit = defineEmits<{
  close: []
  'update:topicId': [id: string]
}>()

const auth = useAuthStore()
const route = useRoute()

const query = ref('')
const category = ref<GuideCategory | 'all' | 'suggested' | 'path'>('path')
const selectedId = ref<string | null>(null)
const menuEl = ref<HTMLElement | null>(null)

const topics = computed(() => visibleTopics(auth.hasFeature))
const suggested = computed(() => topicForRoute(route.name, topics.value))

const filtered = computed(() => {
  let list = searchTopics(topics.value, query.value)
  if (category.value === 'suggested') {
    if (suggested.value && !query.value.trim()) {
      return [suggested.value, ...list.filter((topic) => topic.id !== suggested.value!.id)]
    }
    return list
  }
  if (category.value === 'path' || category.value === 'all') return list
  return list.filter((topic) => topic.category === category.value)
})

const selected = computed<GuideTopic | null>(() => {
  const id = selectedId.value
  if (!id) return filtered.value[0] ?? topics.value[0] ?? null
  return topics.value.find((topic) => topic.id === id) ?? filtered.value[0] ?? null
})

const upcoming = computed(() => (selected.value ? nextTopic(topics.value, selected.value.id) : null))
const prior = computed(() => (selected.value ? previousTopic(topics.value, selected.value.id) : null))

function select(topic: GuideTopic) {
  selectedId.value = topic.id
  emit('update:topicId', topic.id)
}

function selectById(id: string) {
  const topic = topics.value.find((row) => row.id === id)
  if (topic) select(topic)
}

function scrollMenuToSelected() {
  void nextTick(() => {
    const root = menuEl.value
    if (!root || !selectedId.value) return
    root.querySelector<HTMLElement>(`[data-topic-id="${selectedId.value}"]`)?.scrollIntoView({
      block: 'nearest',
      behavior: 'smooth',
    })
  })
}

function bootstrap() {
  const fromProp = props.initialTopicId && topics.value.find((topic) => topic.id === props.initialTopicId)
  if (fromProp) {
    selectedId.value = fromProp.id
    category.value = 'path'
    scrollMenuToSelected()
    return
  }
  if (suggested.value) {
    selectedId.value = suggested.value.id
    category.value = 'suggested'
    scrollMenuToSelected()
    return
  }
  selectedId.value = topics.value[0]?.id ?? null
  category.value = 'path'
  scrollMenuToSelected()
}

watch(
  () => props.initialTopicId,
  (id) => {
    if (id && id === selectedId.value) return
    bootstrap()
  },
  { immediate: true },
)

watch(
  () => route.name,
  () => {
    if (props.initialTopicId) return
    if (suggested.value && (category.value === 'suggested' || !selectedId.value)) {
      selectedId.value = suggested.value.id
      scrollMenuToSelected()
    }
  },
)

watch(selectedId, scrollMenuToSelected)

const categoryChips = computed(() => [
  { id: 'path' as const, label: 'In order', icon: Route },
  { id: 'suggested' as const, label: 'This page', icon: Sparkles },
  { id: 'all' as const, label: 'All' },
  { id: 'workday' as const, label: 'Workday' },
  { id: 'collaborate' as const, label: 'Collab' },
  { id: 'plan' as const, label: 'Plan' },
  { id: 'admin' as const, label: 'Wiki+' },
])
</script>

<template>
  <div
    class="flex min-h-0 flex-1 flex-col gap-2 lg:flex-row lg:gap-2"
    :class="compact ? 'h-full max-h-[min(78vh,40rem)]' : 'h-full'"
  >
    <aside
      class="flex min-h-0 w-full shrink-0 flex-col overflow-hidden rounded-xl border border-border/70 bg-card lg:w-60 xl:w-64"
      :class="compact ? 'max-h-[12rem] sm:max-h-[14rem] lg:max-h-none lg:h-full' : 'max-h-[13rem] sm:max-h-[15rem] lg:max-h-none lg:h-full'"
    >
      <div class="shrink-0 space-y-2 border-b border-border/60 px-2.5 pt-2.5 pb-2">
        <div>
          <p class="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            <Compass class="size-3 text-primary" /> Topics
          </p>
          <p class="mt-0.5 text-[11px] text-muted-foreground">{{ topics.length }} guides</p>
        </div>

        <label class="relative block">
          <Search class="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input v-model="query" class="h-9 pl-8 text-[13px]" placeholder="Search steps…" aria-label="Search user guide" />
        </label>

        <div class="flex flex-wrap gap-1" role="toolbar" aria-label="Guide filters">
          <button
            v-for="chip in categoryChips"
            :key="chip.id"
            type="button"
            class="inline-flex h-6 items-center gap-1 rounded-md border border-border/80 bg-background px-2 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            :aria-pressed="category === chip.id"
            :class="category === chip.id && 'border-primary/40 bg-primary/10 text-foreground'"
            @click="category = chip.id"
          >
            <component :is="chip.icon" v-if="chip.icon" class="size-3 shrink-0" />
            {{ chip.label }}
          </button>
        </div>
      </div>

      <div
        ref="menuEl"
        class="guide-side-menu min-h-0 flex-1 space-y-px overflow-y-auto overscroll-contain px-1.5 py-1.5 scrollbar-thin"
        role="listbox"
        aria-label="Guide topics"
      >
        <button
          v-for="topic in filtered"
          :key="topic.id"
          type="button"
          role="option"
          :data-topic-id="topic.id"
          :aria-selected="selected?.id === topic.id"
          class="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-accent/70"
          :class="selected?.id === topic.id && 'bg-primary/10 font-medium ring-1 ring-primary/25'"
          @click="select(topic)"
        >
          <span
            class="flex size-7 shrink-0 items-center justify-center rounded-md"
            :class="selected?.id === topic.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'"
          >
            <component :is="topic.icon" class="size-3.5" />
          </span>
          <span class="min-w-0 flex-1">
            <span class="block truncate text-[13px] leading-tight">{{ topic.title }}</span>
            <span class="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted-foreground">
              {{ topic.summary }}
            </span>
          </span>
        </button>

        <div v-if="!filtered.length" class="flex flex-col items-center gap-2 px-3 py-8 text-center text-sm text-muted-foreground">
          <SearchX class="size-5" />
          No guide matches “{{ query }}”.
        </div>
      </div>
    </aside>

    <div
      class="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain rounded-xl border border-border/70 bg-card px-3 py-3 scrollbar-thin sm:px-4 sm:py-3.5"
      :class="compact && 'lg:max-h-full'"
    >
      <div
        v-if="suggested && selected?.id === suggested.id"
        class="mb-2.5 inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/8 px-2 py-0.5 text-[11px] font-medium text-primary"
      >
        <Sparkles class="size-3" /> Suggested for this page
      </div>
      <HelpTopicArticle
        v-if="selected"
        :topic="selected"
        :next="upcoming"
        :previous="prior"
        @select="selectById"
      />
    </div>
  </div>
</template>

<style scoped>
.guide-side-menu {
  mask-image: linear-gradient(to bottom, transparent, #000 8px, #000 calc(100% - 12px), transparent);
}
.guide-side-menu:hover,
.guide-side-menu:focus-within {
  mask-image: none;
}
</style>

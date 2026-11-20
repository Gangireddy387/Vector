<script setup lang="ts">
import { BookOpen, Sparkles } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useAuthStore } from '@/modules/auth/auth.store'
import type { WikiAiKind, WikiTemplate } from '../wiki.api'

const props = withDefaults(
  defineProps<{ open: boolean; templates: WikiTemplate[]; creating?: boolean; preferTemplateId?: string | null }>(),
  { preferTemplateId: null },
)

const emit = defineEmits<{
  'update:open': [value: boolean]
  create: [
    payload:
      | { mode: 'ai'; kind: WikiAiKind; brief: string; title?: string }
      | { mode: 'template'; templateId: string; title?: string },
  ]
}>()

const auth = useAuthStore()
const canAi = computed(() => auth.hasFeature('aiAssistant'))
const mode = ref<'ai' | 'template'>('ai')
const kind = ref<WikiAiKind>('handbook')
const brief = ref('')
const customTitle = ref('')
const selectedTemplateId = ref('handbook')

const KINDS: Array<{ id: WikiAiKind; label: string; hint: string; example: string }> = [
  { id: 'handbook', label: 'Team handbook', hint: 'How we work', example: 'Handbook for a 12-person product team that ships weekly' },
  { id: 'runbook', label: 'Runbook', hint: 'Incident / ops steps', example: 'Runbook for API 5xx spikes on payments' },
  { id: 'how-to', label: 'How-to', hint: 'One outcome, step by step', example: 'How to invite a contractor and grant project access' },
  { id: 'faq', label: 'FAQ', hint: 'Common questions', example: 'FAQ for new hires in the first two weeks' },
  { id: 'project-brief', label: 'Project brief', hint: 'Goals & scope', example: 'Brief for launching customer request forms' },
  { id: 'meeting-notes', label: 'Meeting notes', hint: 'Agenda & actions', example: 'Weekly product sync notes template for Mondays' },
  { id: 'custom', label: 'Anything else', hint: 'You describe it', example: 'On-call expectations and escalation ladder' },
]

const selectedKind = computed(() => KINDS.find((item) => item.id === kind.value) ?? KINDS[0]!)
const selectedTemplate = computed(() => props.templates.find((item) => item.id === selectedTemplateId.value) ?? null)

watch(
  () => props.open,
  (open) => {
    if (!open) return
    mode.value = canAi.value ? 'ai' : 'template'
    const prefer = props.preferTemplateId
    kind.value = (prefer && KINDS.some((item) => item.id === prefer) ? prefer : 'handbook') as WikiAiKind
    selectedTemplateId.value = prefer && props.templates.some((item) => item.id === prefer) ? prefer : 'handbook'
    brief.value = ''
    customTitle.value = ''
  },
)

function submit() {
  if (mode.value === 'ai') {
    emit('create', {
      mode: 'ai',
      kind: kind.value,
      brief: brief.value.trim(),
      title: customTitle.value.trim() || undefined,
    })
    return
  }
  if (!selectedTemplate.value) return
  emit('create', {
    mode: 'template',
    templateId: selectedTemplate.value.id,
    title: customTitle.value.trim() || undefined,
  })
}
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="gap-0 overflow-hidden p-0 sm:max-w-xl">
      <DialogHeader class="border-b border-border px-5 py-4 text-left">
        <DialogTitle class="flex items-center gap-2">
          <Sparkles class="size-4 text-primary" />
          {{ canAi ? 'Write a wiki page with AI' : 'New wiki page' }}
        </DialogTitle>
        <DialogDescription>
          {{
            canAi
              ? 'Describe what you need in a sentence. Vector drafts the page from your people and projects — you just review.'
              : 'Pick a starter. Enable AI Assistant on your plan for one-sentence page generation.'
          }}
        </DialogDescription>
      </DialogHeader>

      <div class="space-y-4 p-5">
        <div v-if="canAi" class="flex gap-1 rounded-lg bg-muted/60 p-1">
          <button
            type="button"
            class="flex-1 rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors"
            :class="mode === 'ai' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'"
            @click="mode = 'ai'"
          >
            AI write
          </button>
          <button
            type="button"
            class="flex-1 rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors"
            :class="mode === 'template' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'"
            @click="mode = 'template'"
          >
            Blank template
          </button>
        </div>

        <template v-if="mode === 'ai' && canAi">
          <div>
            <p class="mb-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Page type</p>
            <div class="flex flex-wrap gap-1.5">
              <button
                v-for="item in KINDS"
                :key="item.id"
                type="button"
                class="rounded-full border px-2.5 py-1 text-[12px] transition-colors"
                :class="kind === item.id ? 'border-primary/40 bg-primary/10 text-foreground' : 'border-border text-muted-foreground hover:border-primary/30'"
                @click="kind = item.id"
              >
                {{ item.label }}
              </button>
            </div>
          </div>
          <div>
            <label class="text-[11px] font-medium tracking-wide text-muted-foreground uppercase" for="wiki-ai-brief">What should it cover?</label>
            <Textarea
              id="wiki-ai-brief"
              v-model="brief"
              class="mt-1.5 min-h-[96px]"
              :placeholder="selectedKind.example"
              maxlength="2000"
            />
            <p class="mt-1 text-[11px] text-muted-foreground">Optional but better — AI uses your org members and projects as context.</p>
          </div>
          <div>
            <label class="text-[11px] font-medium tracking-wide text-muted-foreground uppercase" for="wiki-ai-title">Title (optional)</label>
            <Input id="wiki-ai-title" v-model="customTitle" class="mt-1.5" placeholder="Leave blank — AI will name it" />
          </div>
        </template>

        <template v-else>
          <div class="grid max-h-48 gap-1 overflow-y-auto scrollbar-thin">
            <button
              v-for="template in templates"
              :key="template.id"
              type="button"
              class="flex flex-col gap-0.5 border px-3 py-2 text-left transition-colors"
              :class="selectedTemplateId === template.id ? 'border-primary/40 bg-primary/5' : 'border-transparent hover:bg-accent/60'"
              @click="selectedTemplateId = template.id"
            >
              <span class="text-[13px] font-medium">{{ template.title }}</span>
              <span class="text-[11px] text-muted-foreground">{{ template.description }}</span>
            </button>
          </div>
          <Input v-model="customTitle" :placeholder="selectedTemplate?.pageTitle || 'Untitled page'" />
        </template>

        <div class="flex justify-end gap-2 border-t border-border pt-3">
          <Button type="button" variant="ghost" @click="emit('update:open', false)">Cancel</Button>
          <Button type="button" :loading="creating" @click="submit">
            <Sparkles v-if="mode === 'ai' && canAi" class="size-3.5" />
            <BookOpen v-else class="size-3.5" />
            {{ mode === 'ai' && canAi ? 'Generate page' : 'Create page' }}
          </Button>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>

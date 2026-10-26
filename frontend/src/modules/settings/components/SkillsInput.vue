<script setup lang="ts">
import { X } from 'lucide-vue-next'
import { ref } from 'vue'

/** Type a skill and press Enter (or a comma) to add it; Backspace in the empty box removes the last one. */
const props = withDefaults(defineProps<{ id?: string; max?: number; maxLength?: number }>(), { max: 15, maxLength: 30 })
const skills = defineModel<string[]>({ required: true })
const draft = ref('')
const error = ref('')

function add() {
  const skill = draft.value.trim().replace(/,+$/, '').trim()
  error.value = ''
  if (!skill) return
  if (skill.length > props.maxLength) return (error.value = `Keep each skill under ${props.maxLength} characters`)
  if (skills.value.some((existing) => existing.toLowerCase() === skill.toLowerCase())) return (draft.value = '')
  if (skills.value.length >= props.max) return (error.value = `Add up to ${props.max} skills`)
  skills.value = [...skills.value, skill]
  draft.value = ''
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' || event.key === ',') {
    event.preventDefault()
    add()
  } else if (event.key === 'Backspace' && !draft.value && skills.value.length) {
    skills.value = skills.value.slice(0, -1)
  }
}

const remove = (skill: string) => (skills.value = skills.value.filter((item) => item !== skill))
</script>

<template>
  <div class="space-y-1">
    <div
      class="flex min-h-9 flex-wrap items-center gap-1.5 border border-input bg-card px-2 py-1.5 transition-shadow focus-within:border-primary/50 focus-within:ring-4 focus-within:ring-ring/20 dark:bg-input/30"
    >
      <span v-for="skill in skills" :key="skill" class="inline-flex items-center gap-1 border border-primary/20 bg-primary/5 py-0.5 pr-1 pl-2 text-xs font-medium text-primary">
        {{ skill }}
        <button type="button" class="text-primary/60 hover:text-primary" :aria-label="`Remove ${skill}`" @click="remove(skill)"><X class="size-3" /></button>
      </span>
      <input
        :id="id"
        v-model="draft"
        class="h-6 min-w-32 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        :placeholder="skills.length ? 'Add another…' : 'e.g. Vue, Hiring, Budgeting (press Enter)'"
        :maxlength="maxLength + 1"
        @keydown="onKeydown"
        @blur="add"
      />
    </div>
    <p v-if="error" class="text-xs text-destructive" role="alert">{{ error }}</p>
  </div>
</template>

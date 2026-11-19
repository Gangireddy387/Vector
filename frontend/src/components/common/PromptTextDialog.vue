<script setup lang="ts">
import { computed } from 'vue'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { promptTextState, settlePromptText } from '@/composables/usePromptText'

const canSubmit = computed(() => {
  const trimmed = promptTextState.value.trim()
  if (promptTextState.required && !trimmed) return false
  return trimmed.length <= promptTextState.maxLength
})

function submit() {
  if (!canSubmit.value) return
  settlePromptText(promptTextState.value.trim())
}
</script>

<template>
  <Dialog :open="promptTextState.open" @update:open="(open: boolean) => !open && settlePromptText(null)">
    <DialogContent class="sm:max-w-md" hide-close on-top>
      <DialogHeader>
        <DialogTitle>{{ promptTextState.title }}</DialogTitle>
        <DialogDescription v-if="promptTextState.description">{{ promptTextState.description }}</DialogDescription>
      </DialogHeader>
      <div class="space-y-2">
        <Label for="prompt-text-input">{{ promptTextState.label }}</Label>
        <Textarea
          id="prompt-text-input"
          v-model="promptTextState.value"
          :placeholder="promptTextState.placeholder"
          :maxlength="promptTextState.maxLength"
          rows="4"
          class="resize-y"
          @keydown.ctrl.enter.prevent="submit"
          @keydown.meta.enter.prevent="submit"
        />
        <p class="text-xs text-muted-foreground">Ctrl/⌘ + Enter to submit</p>
      </div>
      <DialogFooter>
        <Button variant="outline" @click="settlePromptText(null)">{{ promptTextState.cancelLabel }}</Button>
        <Button :disabled="!canSubmit" @click="submit">{{ promptTextState.confirmLabel }}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

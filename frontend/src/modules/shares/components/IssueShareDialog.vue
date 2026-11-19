<script setup lang="ts">
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import ShareLinkCard from './ShareLinkCard.vue'

defineProps<{ issueId: string }>()
const open = defineModel<boolean>({ default: false })
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Share task</DialogTitle>
        <DialogDescription>Create a public link so people outside your organization can view this task.</DialogDescription>
      </DialogHeader>
      <ShareLinkCard kind="issue" :target-id="issueId" />
    </DialogContent>
  </Dialog>
</template>

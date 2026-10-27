<script setup lang="ts">
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { confirmState, settleConfirm } from '@/composables/useConfirm'
</script>

<template>
  <Dialog :open="confirmState.open" @update:open="(open: boolean) => !open && settleConfirm(false)">
    <DialogContent class="sm:max-w-md" hide-close on-top>
      <DialogHeader>
        <DialogTitle>{{ confirmState.title }}</DialogTitle>
        <DialogDescription v-if="confirmState.description">{{ confirmState.description }}</DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button variant="outline" @click="settleConfirm(false)">{{ confirmState.cancelLabel }}</Button>
        <Button :variant="confirmState.destructive ? 'destructive' : 'default'" @click="settleConfirm(true)">
          {{ confirmState.confirmLabel }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

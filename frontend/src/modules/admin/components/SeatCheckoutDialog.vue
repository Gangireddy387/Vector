<script setup lang="ts">
import { CreditCard } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { getErrorMessage } from '@/lib/http'
import { workspaceApi } from '../admin.api'

const props = defineProps<{
  /** Current active members — seat floor. */
  memberCount: number
  /** Existing billed seats when already on a subscription. */
  billedSeats?: number | null
  hasSubscription?: boolean
  minSeats?: number
  maxSeats?: number
  trialDays?: number
}>()

const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ done: [] }>()

const seats = ref(5)
const isSaving = ref(false)

const floor = computed(() => Math.max(props.minSeats ?? 1, props.memberCount || 1))
const ceiling = computed(() => props.maxSeats ?? 100)

const title = computed(() => (props.hasSubscription ? 'Change seat count' : 'Choose seats for Pro'))
const description = computed(() =>
  props.hasSubscription
    ? 'Your people limit follows the seats you pay for. Stripe prorates the change on your next invoice.'
    : 'Pro is billed per seat. Pick how many people this organization can have (at least everyone already here).',
)

watch(open, (isOpen) => {
  if (!isOpen) return
  const suggested = props.billedSeats || Math.max(floor.value, 5)
  seats.value = Math.min(ceiling.value, Math.max(floor.value, suggested))
})

async function confirm() {
  const quantity = Math.min(ceiling.value, Math.max(floor.value, Number.parseInt(String(seats.value), 10) || floor.value))
  seats.value = quantity
  isSaving.value = true
  try {
    if (props.hasSubscription) {
      const result = await workspaceApi.updateSeats(quantity)
      toast.success(
        result.mode === 'unchanged' ? 'Seat count unchanged' : `Updated to ${result.seats} seats`,
        { description: result.mode === 'updated' ? 'Proration will appear on your Stripe invoice.' : undefined },
      )
      emit('done')
      open.value = false
      return
    }
    const result = await workspaceApi.startCheckout(quantity)
    if (result.url) {
      window.location.assign(result.url)
      return
    }
    toast.success(`Pro ready with ${result.seats} seats`)
    emit('done')
    open.value = false
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{{ title }}</DialogTitle>
        <DialogDescription>{{ description }}</DialogDescription>
      </DialogHeader>

      <div class="space-y-2 py-1">
        <label class="text-xs font-medium text-muted-foreground" for="seat-count">Seats</label>
        <Input
          id="seat-count"
          v-model.number="seats"
          type="number"
          :min="floor"
          :max="ceiling"
          class="tabular-nums"
        />
        <p class="text-xs text-muted-foreground">
          Between {{ floor }} and {{ ceiling }}.
          <template v-if="!hasSubscription && trialDays"> Includes a {{ trialDays }}-day trial when Checkout starts.</template>
        </p>
      </div>

      <DialogFooter>
        <Button variant="outline" :disabled="isSaving" @click="open = false">Cancel</Button>
        <Button :disabled="isSaving" :loading="isSaving" @click="confirm">
          <CreditCard />
          {{ hasSubscription ? 'Update seats' : trialDays ? `Start ${trialDays}-day trial` : 'Continue to checkout' }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

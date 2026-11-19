<script setup lang="ts">
import { Check, CreditCard, Gem, LoaderCircle } from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import { getErrorMessage } from '@/lib/http'
import { useAuthStore } from '@/modules/auth/auth.store'
import { type UpgradeRequest, type UpgradeTarget, workspaceApi } from '../admin.api'
import SeatCheckoutDialog from './SeatCheckoutDialog.vue'

const props = withDefaults(
  defineProps<{
    target?: UpgradeTarget
    note?: string
    size?: 'default' | 'sm' | 'lg'
    variant?: 'default' | 'outline' | 'brand'
    label?: string
    /** When already pending from parent (plan overview). */
    pending?: UpgradeRequest | null
    /** Active member count — seat floor for Checkout. */
    memberCount?: number
  }>(),
  { target: 'pro', size: 'sm', variant: 'default', memberCount: 1 },
)

const emit = defineEmits<{ requested: [UpgradeRequest]; update: [] }>()

const auth = useAuthStore()
const isSending = ref(false)
const localPending = ref<UpgradeRequest | null>(null)
const checkoutEnabled = ref(false)
const trialDays = ref(0)
const hasSubscription = ref(false)
const billedSeats = ref<number | null>(null)
const minSeats = ref(1)
const maxSeats = ref(100)
const seatDialogOpen = ref(false)

const pending = computed(() => localPending.value ?? props.pending ?? null)
const isPending = computed(() => Boolean(pending.value && pending.value.target === props.target))
/** Card path for Pro upgrade or buying more seats when Stripe is on. */
const canPay = computed(
  () =>
    checkoutEnabled.value &&
    (props.target === 'pro' || (props.target === 'seats' && (hasSubscription.value || checkoutEnabled.value))),
)

const buttonLabel = computed(() => {
  if (props.label) return props.label
  if (canPay.value && props.target === 'seats') return hasSubscription.value ? 'Buy more seats' : 'Upgrade with seats'
  if (canPay.value && props.target === 'pro') {
    return trialDays.value > 0 ? `Start ${trialDays.value}-day Pro trial` : 'Upgrade with card'
  }
  if (props.target === 'seats') return 'Request more people'
  if (props.target === 'projects') return 'Request more projects'
  return 'Request Pro'
})

onMounted(async () => {
  if ((props.target !== 'pro' && props.target !== 'seats') || !auth.isOrganizationAdmin) return
  try {
    const status = await workspaceApi.billingStatus()
    checkoutEnabled.value = status.checkoutEnabled
    trialDays.value = status.trialDays ?? 0
    hasSubscription.value = status.hasSubscription
    billedSeats.value = status.billedSeats
    minSeats.value = status.minSeats ?? 1
    maxSeats.value = status.maxSeats ?? 100
  } catch {
    checkoutEnabled.value = false
    trialDays.value = 0
  }
})

async function request() {
  if (!auth.isOrganizationAdmin) {
    toast.message('Ask an organization admin', { description: 'Only admins can change the plan.' })
    return
  }
  if (canPay.value) {
    seatDialogOpen.value = true
    return
  }
  if (isPending.value) {
    toast.message('Request already sent', { description: 'The portal admin can see it in Super Admin and Support.' })
    return
  }
  isSending.value = true
  try {
    const result = await workspaceApi.requestUpgrade({ target: props.target, note: props.note })
    localPending.value = result.upgradeRequest
    toast.success(result.alreadyPending ? 'Request already pending' : 'Request sent', {
      description: result.alreadyPending
        ? 'The portal admin already has this request.'
        : 'Posted to Vector support and emailed the portal admin.',
    })
    emit('requested', result.upgradeRequest)
    emit('update')
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    isSending.value = false
  }
}
</script>

<template>
  <Button
    :variant="isPending && !canPay ? 'outline' : variant"
    :size="size"
    :disabled="isSending || (isPending && !canPay && !auth.isOrganizationAdmin)"
    @click="request"
  >
    <LoaderCircle v-if="isSending" class="animate-spin" />
    <Check v-else-if="isPending && !canPay" />
    <CreditCard v-else-if="canPay" />
    <Gem v-else />
    {{ isPending && !canPay ? 'Request pending' : buttonLabel }}
  </Button>

  <SeatCheckoutDialog
    v-model:open="seatDialogOpen"
    :member-count="memberCount"
    :billed-seats="billedSeats"
    :has-subscription="hasSubscription"
    :min-seats="minSeats"
    :max-seats="maxSeats"
    :trial-days="target === 'pro' && !hasSubscription ? trialDays : 0"
    @done="emit('update')"
  />
</template>

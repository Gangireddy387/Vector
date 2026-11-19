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
const proCheckoutEnabled = ref(false)
const enterpriseCheckoutEnabled = ref(false)
const trialDays = ref(0)
const enterpriseTrialDays = ref(0)
const hasSubscription = ref(false)
const billedSeats = ref<number | null>(null)
const minSeats = ref(1)
const maxSeats = ref(100)
const seatDialogOpen = ref(false)

const pending = computed(() => localPending.value ?? props.pending ?? null)
const isPending = computed(() => Boolean(pending.value && pending.value.target === props.target))

const canPay = computed(() => {
  if (props.target === 'seats') return checkoutEnabled.value && (hasSubscription.value || proCheckoutEnabled.value || enterpriseCheckoutEnabled.value)
  if (props.target === 'pro') return proCheckoutEnabled.value
  if (props.target === 'enterprise') return enterpriseCheckoutEnabled.value
  return false
})

const checkoutPlan = computed(() => (props.target === 'enterprise' ? 'enterprise' : 'pro') as 'pro' | 'enterprise')
const seatsOnly = computed(() => props.target === 'seats')
const dialogTrialDays = computed(() => {
  if (hasSubscription.value) return 0
  if (props.target === 'enterprise') return enterpriseTrialDays.value
  if (props.target === 'pro') return trialDays.value
  return 0
})

const buttonLabel = computed(() => {
  if (props.label) return props.label
  if (canPay.value && props.target === 'seats') return hasSubscription.value ? 'Buy more seats' : 'Upgrade with seats'
  if (canPay.value && props.target === 'pro') {
    return trialDays.value > 0 ? `Start ${trialDays.value}-day Pro trial` : 'Upgrade to Pro'
  }
  if (canPay.value && props.target === 'enterprise') {
    return enterpriseTrialDays.value > 0
      ? `Start ${enterpriseTrialDays.value}-day Enterprise trial`
      : hasSubscription.value
        ? 'Upgrade to Enterprise'
        : 'Upgrade to Enterprise'
  }
  if (props.target === 'seats') return 'Request more people'
  if (props.target === 'projects') return 'Request more projects'
  if (props.target === 'enterprise') return 'Request Enterprise'
  return 'Request Pro'
})

onMounted(async () => {
  // Stripe checkout is admin-only; members can still request an upgrade.
  if ((props.target !== 'pro' && props.target !== 'enterprise' && props.target !== 'seats') || !auth.isOrganizationAdmin) return
  try {
    const status = await workspaceApi.billingStatus()
    checkoutEnabled.value = status.checkoutEnabled
    proCheckoutEnabled.value = status.proCheckoutEnabled ?? status.checkoutEnabled
    enterpriseCheckoutEnabled.value = status.enterpriseCheckoutEnabled ?? false
    trialDays.value = status.trialDays ?? 0
    enterpriseTrialDays.value = status.enterpriseTrialDays ?? status.trialDays ?? 0
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
  if (auth.isOrganizationAdmin && canPay.value) {
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
        : auth.isOrganizationAdmin
          ? 'Posted to Vector support and emailed the portal admin.'
          : 'Your organization admin and the portal team will see this request.',
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
    :disabled="isSending || (isPending && !canPay)"
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
    :trial-days="dialogTrialDays"
    :plan="checkoutPlan"
    :seats-only="seatsOnly"
    @done="emit('update')"
  />
</template>

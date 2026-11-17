<script setup lang="ts">
import { Check, CreditCard, Gem, LoaderCircle } from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import { getErrorMessage } from '@/lib/http'
import { useAuthStore } from '@/modules/auth/auth.store'
import { type UpgradeRequest, type UpgradeTarget, workspaceApi } from '../admin.api'

const props = withDefaults(
  defineProps<{
    target?: UpgradeTarget
    note?: string
    size?: 'default' | 'sm' | 'lg'
    variant?: 'default' | 'outline' | 'brand'
    label?: string
    /** When already pending from parent (plan overview). */
    pending?: UpgradeRequest | null
  }>(),
  { target: 'pro', size: 'sm', variant: 'default' },
)

const emit = defineEmits<{ requested: [UpgradeRequest]; update: [] }>()

const auth = useAuthStore()
const isSending = ref(false)
const localPending = ref<UpgradeRequest | null>(null)
const checkoutEnabled = ref(false)
const pending = computed(() => localPending.value ?? props.pending ?? null)
const isPending = computed(() => Boolean(pending.value && pending.value.target === props.target))
const canPay = computed(() => checkoutEnabled.value && props.target === 'pro')

const buttonLabel = computed(() => {
  if (props.label) return props.label
  if (canPay.value) return 'Upgrade with card'
  if (props.target === 'seats') return 'Request more people'
  if (props.target === 'projects') return 'Request more projects'
  return 'Request Pro'
})

onMounted(async () => {
  if (props.target !== 'pro' || !auth.isOrganizationAdmin) return
  try {
    checkoutEnabled.value = (await workspaceApi.billingStatus()).checkoutEnabled
  } catch {
    checkoutEnabled.value = false
  }
})

async function request() {
  if (!auth.isOrganizationAdmin) {
    toast.message('Ask an organization admin', { description: 'Only admins can change the plan.' })
    return
  }
  if (canPay.value) {
    isSending.value = true
    try {
      const { url } = await workspaceApi.startCheckout()
      window.location.assign(url)
    } catch (error) {
      toast.error(getErrorMessage(error))
      isSending.value = false
    }
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
</template>

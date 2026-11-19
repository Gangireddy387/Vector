import { computed, onMounted, reactive, type Reactive } from 'vue'
import { LEGAL } from '@/constants/legal'
import { getStoredToken, http } from '@/lib/http'
import { connectPublicRealtime, connectRealtime, getSocket } from '@/lib/realtime'
import { bindSocketEvents } from '@/lib/socket-events'

export interface LegalContact {
  companyName: string
  productName: string
  contactEmail: string
  contactPhone: string
  postalAddress: string
  jurisdiction: string
  effectiveDate: string
}

const defaults = (): LegalContact => ({
  companyName: LEGAL.companyName,
  productName: LEGAL.productName,
  contactEmail: LEGAL.contactEmail,
  contactPhone: '',
  postalAddress: LEGAL.postalAddress,
  jurisdiction: LEGAL.jurisdiction,
  effectiveDate: LEGAL.effectiveDate,
})

let state: Reactive<LegalContact> | null = null
let loading: Promise<void> | null = null
let listening = false

function ensureState() {
  if (!state) state = reactive(defaults())
  return state
}

function apply(legal: Partial<LegalContact>) {
  const next = ensureState()
  Object.assign(next, defaults(), legal, { productName: LEGAL.productName })
}

function ensureSocket() {
  if (getSocket()?.connected) return
  if (getStoredToken()) connectRealtime()
  else connectPublicRealtime()
}

function listen() {
  if (listening) return
  listening = true
  bindSocketEvents({
    'legal:updated': (payload: { legal?: Partial<LegalContact> }) => {
      if (payload?.legal) apply(payload.legal)
    },
  })
}

/** Live Privacy / Terms contact details (super-admin editable). Falls back to VITE_LEGAL_* defaults. */
export function useLegalContact() {
  const legal = ensureState()
  ensureSocket()
  listen()

  onMounted(() => {
    ensureSocket()
    if (loading) return
    loading = http
      .get<{ legal: LegalContact }>('/legal')
      .then(({ data }) => apply(data.legal))
      .catch(() => {
        /* keep defaults */
      })
      .finally(() => {
        loading = null
      })
  })

  const mailto = computed(() => `mailto:${legal.contactEmail}`)
  const hasAddress = computed(() => Boolean(legal.postalAddress.trim()))
  const hasPhone = computed(() => Boolean(legal.contactPhone.trim()))

  return { legal, mailto, hasAddress, hasPhone }
}

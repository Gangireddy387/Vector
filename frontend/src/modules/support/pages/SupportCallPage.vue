<script setup lang="ts">
import { format, parseISO } from 'date-fns'
import { ArrowLeft, Copy, Headset, Mic, MicOff, Sparkles, Video, VideoOff } from 'lucide-vue-next'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import UserAvatar from '@/components/common/UserAvatar.vue'
import BrandMark from '@/components/layout/BrandMark.vue'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useConfirm } from '@/composables/useConfirm'
import { useDevice } from '@/composables/useDevice'
import { assetUrl, getErrorMessage } from '@/lib/http'
import { useAuthStore } from '@/modules/auth/auth.store'
import BackgroundPicker from '@/modules/meetings/components/BackgroundPicker.vue'
import CallView from '@/modules/meetings/components/CallView.vue'
import DeviceSettings from '@/modules/meetings/components/DeviceSettings.vue'
import GuestPanel from '@/modules/meetings/components/GuestPanel.vue'
import VideoTile from '@/modules/meetings/components/VideoTile.vue'
import { blurSupported, useMeetingCall } from '@/modules/meetings/useMeetingCall'
import { type SupportCallInfo, supportCallApi } from '../support.api'

/**
 * A video call between the Vector team (super admin) and an organization's admins. Both sides open it here: the
 * super admin from the super-admin page, organization admins from their support chat or the incoming-call card.
 */
const props = defineProps<{ meetingId: string }>()

const auth = useAuthStore()
const call = useMeetingCall()
const route = useRoute()
const router = useRouter()
const confirm = useConfirm()
const { isDesktop } = useDevice()

const info = ref<SupportCallInfo | null>(null)
const problem = ref<string | null>(null)
const isLoading = ref(true)
const isJoining = ref(false)
const panelOpen = ref(isDesktop.value)
const backgroundsOpen = ref(false)
const ended = ref<string | null>(null)
const callErrorBanner = ref<string | null>(null)

const inCall = computed(() => call.inCall.value && call.meetingId.value === props.meetingId)

async function copyCallLink() {
  try {
    await navigator.clipboard.writeText(window.location.href)
    toast.success('Call link copied')
  } catch {
    toast.error('Could not copy the call link')
  }
}
const withWhom = computed(() => (info.value?.side === 'portal' ? `${info.value.organization.name}’s admins` : 'the Vector team'))
const startedLabel = computed(() => (info.value ? format(parseISO(info.value.call.startsAt), 'EEEE d MMMM, HH:mm') : ''))

function back() {
  if (info.value?.side === 'organization') void router.push({ name: 'workspace-admin', query: { tab: 'support' } })
  else void router.push({ name: 'super-admin' })
}

async function run(action: () => Promise<unknown>) {
  try {
    await action()
  } catch (error) {
    toast.error(getErrorMessage(error))
  }
}

async function join() {
  if (!info.value?.joinable || !auth.user) return
  isJoining.value = true
  ended.value = null
  try {
    await call.join(props.meetingId, { user: auth.user, title: info.value.call.title, support: true, iceServers: info.value.ice.iceServers })
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    isJoining.value = false
  }
}

function leave() {
  call.leave()
  ended.value = 'You left the call. You can join again while it is still on.'
  void call.startPreview()
}

async function endForEveryone() {
  const ok = await confirm({ title: 'End the call for everyone?', description: `Everyone in the call with ${withWhom.value} is disconnected.`, confirmLabel: 'End call', destructive: true })
  if (!ok) return
  await run(async () => {
    info.value = await supportCallApi.end(props.meetingId)
    call.leave()
    ended.value = 'You ended the call.'
  })
}

onMounted(async () => {
  try {
    info.value = await supportCallApi.get(props.meetingId)
    if (info.value.joinable) {
      await call.startPreview()
      // Answered from the incoming-call card or started from the chat: go straight in.
      if (route.query.join === '1' && !inCall.value) await join()
    }
  } catch (error) {
    problem.value = getErrorMessage(error, 'This call link does not work.')
  } finally {
    isLoading.value = false
  }
})

watch(
  () => call.callError.value,
  (message) => {
    if (!message) return
    callErrorBanner.value = message
    toast.error(message)
    call.callError.value = null
  },
)
watch(
  () => call.closedReason.value,
  (reason) => {
    if (!reason) return
    ended.value = reason === 'removed' ? 'You were removed from the call.' : 'The call has ended.'
    call.closedReason.value = null
    void supportCallApi.get(props.meetingId).then((next) => (info.value = next)).catch(() => undefined)
  },
)

onBeforeUnmount(() => {
  // Organization admins keep talking in the app's mini call window; the super admin's page has none, so the call ends here.
  if (inCall.value && info.value?.side === 'portal') call.leave()
  if (!call.inCall.value) call.stopPreview()
})
</script>

<template>
  <div class="flex min-h-dvh flex-col bg-background">
    <CallView v-if="inCall && info" v-model:panel-open="panelOpen" class="h-dvh" :title="info.call.title" :started-at="info.call.startedAt" can-end @leave="leave" @end="endForEveryone">
      <template #panel><GuestPanel /></template>
    </CallView>

    <template v-else>
      <header class="flex items-center gap-3 border-b border-border/70 px-5 py-3">
        <Button variant="ghost" size="icon-sm" aria-label="Back" @click="back"><ArrowLeft /></Button>
        <span class="flex items-center gap-2.5">
          <span class="relative flex size-8 shrink-0 items-center justify-center overflow-hidden bg-brand text-white shadow-glow">
            <BrandMark class="relative size-[22px]" />
          </span>
          <span class="text-[17px] font-semibold tracking-tight">Vector support</span>
        </span>
        <span v-if="info" class="ml-auto flex items-center gap-2 text-sm text-muted-foreground">
          <img v-if="info.organization.logoUrl" :src="assetUrl(info.organization.logoUrl)" alt="" class="size-6 object-contain" />
          {{ info.organization.name }}
        </span>
      </header>

      <main class="mx-auto grid w-full max-w-5xl flex-1 content-center gap-6 p-5 lg:grid-cols-[1.4fr_1fr]">
        <template v-if="isLoading">
          <Skeleton class="aspect-video w-full" />
          <Skeleton class="h-64 w-full" />
        </template>

        <div v-else-if="problem" class="col-span-full flex flex-col items-center gap-3 py-16 text-center">
          <span class="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground"><VideoOff class="size-6" /></span>
          <p class="font-semibold">{{ problem }}</p>
          <Button variant="outline" @click="back"><ArrowLeft /> Back</Button>
        </div>

        <template v-else-if="info">
          <div class="space-y-3">
            <div class="relative overflow-hidden bg-[#0d1017] p-2 shadow-soft">
              <VideoTile
                :stream="call.selfStream.value"
                :user="auth.user"
                label="You"
                :audio="call.media.audio"
                :video="call.media.video"
                :revision="call.localRevision.value"
                self
              />
              <div v-if="info.joinable" class="absolute inset-x-0 bottom-5 flex justify-center gap-2">
                <button
                  type="button"
                  class="flex size-11 items-center justify-center rounded-full text-white backdrop-blur transition-colors"
                  :class="call.media.audio ? 'bg-white/15 hover:bg-white/25' : 'bg-red-500 hover:bg-red-500/90'"
                  :aria-label="call.media.audio ? 'Mute microphone' : 'Unmute microphone'"
                  @click="run(call.toggleAudio)"
                >
                  <Mic v-if="call.media.audio" class="size-5" />
                  <MicOff v-else class="size-5" />
                </button>
                <button
                  type="button"
                  class="flex size-11 items-center justify-center rounded-full text-white backdrop-blur transition-colors"
                  :class="call.media.video ? 'bg-white/15 hover:bg-white/25' : 'bg-red-500 hover:bg-red-500/90'"
                  :aria-label="call.media.video ? 'Turn camera off' : 'Turn camera on'"
                  @click="run(call.toggleVideo)"
                >
                  <Video v-if="call.media.video" class="size-5" />
                  <VideoOff v-else class="size-5" />
                </button>
                <button
                  v-if="blurSupported"
                  type="button"
                  class="flex size-11 items-center justify-center rounded-full text-white backdrop-blur transition-colors disabled:opacity-40"
                  :class="call.blurOn.value ? 'bg-sky-500 hover:bg-sky-500/90' : 'bg-white/15 hover:bg-white/25'"
                  :disabled="call.blurBusy.value"
                  aria-label="Background effects"
                  @click="backgroundsOpen = true"
                >
                  <Sparkles class="size-5" />
                </button>
                <DeviceSettings button-class="flex size-11 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur transition-colors hover:bg-white/25" />
              </div>
            </div>
            <BackgroundPicker v-model:open="backgroundsOpen" />
            <p v-if="call.deviceNote.value" class="border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-amber-700 dark:text-warning">{{ call.deviceNote.value }}</p>
          </div>

          <section class="space-y-4 border border-border/70 bg-card p-5 shadow-soft">
            <div class="space-y-1">
              <p class="flex items-center gap-1.5 text-xs font-semibold tracking-wider text-brand uppercase"><Headset class="size-3.5" /> Support call</p>
              <h1 class="text-xl font-semibold">Video call with {{ withWhom }}</h1>
              <p class="text-sm text-muted-foreground">Started {{ startedLabel }}</p>
              <p v-if="info.call.host" class="flex items-center gap-1.5 text-sm text-muted-foreground">
                <UserAvatar :user="info.call.host" size="xs" /> Started by {{ info.call.host.name }}
              </p>
            </div>

            <p
              v-if="callErrorBanner"
              class="flex flex-wrap items-center justify-between gap-2 border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              role="alert"
            >
              <span>{{ callErrorBanner }}</span>
              <Button
                variant="outline"
                size="sm"
                @click="
                  callErrorBanner = null;
                  join()
                "
              >
                Reconnect
              </Button>
            </p>
            <p v-if="!info.joinable" class="border border-border/70 bg-muted/40 px-3 py-2 text-sm">{{ ended ?? info.reason }}</p>
            <template v-else>
              <p v-if="ended" class="border border-border/70 bg-muted/40 px-3 py-2 text-sm">{{ ended }}</p>
              <Button
                variant="brand"
                class="w-full"
                size="lg"
                :loading="isJoining || call.status.value === 'joining'"
                @click="
                  callErrorBanner = null;
                  join()
                "
              >
                <Video /> {{ callErrorBanner ? 'Try joining again' : 'Join call' }}
              </Button>
              <p class="text-xs text-muted-foreground">Only {{ withWhom }} and you can join. Check your camera and microphone in the preview first.</p>
            </template>
            <div class="flex flex-col gap-2">
              <Button variant="outline" class="w-full" @click="copyCallLink"><Copy /> Copy call link</Button>
              <Button variant="ghost" class="w-full" @click="back"><ArrowLeft /> Back to the support chat</Button>
            </div>
          </section>
        </template>
      </main>
    </template>
  </div>
</template>

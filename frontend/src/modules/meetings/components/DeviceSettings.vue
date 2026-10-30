<script setup lang="ts">
import { Mic, Settings2, Speaker, Video } from 'lucide-vue-next'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import { SelectField, type SelectFieldOption } from '@/components/forms'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { DeviceKind } from '../call/devices'
import { canChooseSpeaker, useMeetingCall } from '../useMeetingCall'

/** Microphone, camera and speaker choice, with a level meter to check the microphone works. */
const props = withDefaults(defineProps<{ buttonClass?: string; side?: 'top' | 'bottom' }>(), { buttonClass: '', side: 'top' })
const call = useMeetingCall()
const open = ref(false)
const DEFAULT = '__default__'

const optionsFor = (kind: DeviceKind): SelectFieldOption[] => [
  { value: DEFAULT, label: 'System default' },
  ...call.devices.value[kind].map((device) => ({ value: device.id, label: device.label })),
]
const valueOf = (kind: DeviceKind) => call.chosenDevices[kind] ?? DEFAULT

async function choose(kind: DeviceKind, value: string | null) {
  try {
    await call.chooseDevice(kind, !value || value === DEFAULT ? null : value)
  } catch (error) {
    toast.error(error instanceof Error ? error.message : 'Could not switch the device')
  }
}

const rows = computed(() => [
  { kind: 'audioinput' as const, label: 'Microphone', icon: Mic },
  { kind: 'videoinput' as const, label: 'Camera', icon: Video },
  ...(canChooseSpeaker ? [{ kind: 'audiooutput' as const, label: 'Speaker', icon: Speaker }] : []),
])

// Microphone level while the panel is open.
const level = ref(0)
let context: AudioContext | null = null
let frame = 0
function stopMeter() {
  cancelAnimationFrame(frame)
  void context?.close().catch(() => undefined)
  context = null
  level.value = 0
}
function startMeter() {
  stopMeter()
  const track = call.localStream.value?.getAudioTracks()[0]
  if (!track || track.readyState !== 'live') return
  context = new AudioContext()
  const analyser = context.createAnalyser()
  analyser.fftSize = 512
  context.createMediaStreamSource(new MediaStream([track])).connect(analyser)
  const buffer = new Uint8Array(analyser.fftSize)
  const tick = () => {
    analyser.getByteTimeDomainData(buffer)
    let sum = 0
    for (const value of buffer) sum += ((value - 128) / 128) ** 2
    level.value = Math.min(1, Math.sqrt(sum / buffer.length) * 6)
    frame = requestAnimationFrame(tick)
  }
  tick()
}
watch(
  () => [open.value, call.localRevision.value] as const,
  ([isOpen]) => {
    if (isOpen) {
      void call.refreshDevices()
      startMeter()
    } else stopMeter()
  },
)
onBeforeUnmount(stopMeter)
</script>

<template>
  <Popover v-model:open="open">
    <PopoverTrigger as-child>
      <button type="button" :class="props.buttonClass" aria-label="Microphone, camera and speaker" title="Devices">
        <Settings2 class="size-5" />
      </button>
    </PopoverTrigger>
    <PopoverContent :side="side" class="w-80 space-y-3 p-3">
      <p class="text-sm font-semibold">Devices</p>
      <div v-for="row in rows" :key="row.kind" class="space-y-1">
        <p class="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><component :is="row.icon" class="size-3.5" /> {{ row.label }}</p>
        <SelectField :model-value="valueOf(row.kind)" :options="optionsFor(row.kind)" size="sm" :aria-label="row.label" @update:model-value="(value) => choose(row.kind, value ?? null)" />
        <div v-if="row.kind === 'audioinput'" class="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
          <div class="h-full rounded-full bg-emerald-500 transition-[width] duration-75" :style="{ width: `${Math.round(level * 100)}%` }" />
        </div>
      </div>
      <p v-if="call.devices.value.audioinput.length && !call.devices.value.audioinput[0]?.label.trim()" class="text-xs text-muted-foreground">
        Allow the camera and microphone to see their names.
      </p>
    </PopoverContent>
  </Popover>
</template>

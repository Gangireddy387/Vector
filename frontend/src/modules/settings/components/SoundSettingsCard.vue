<script setup lang="ts">
import { Check, Lock, Music, Pause, Play, RefreshCw, Trash2, Upload, Volume1, Volume2, VolumeX } from 'lucide-vue-next'
import { computed, onBeforeUnmount, ref, useTemplateRef, watch } from 'vue'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { getErrorMessage } from '@/lib/http'
import { CUSTOM_RINGTONE, DEFAULT_SOUNDS, MESSAGE_SOUNDS, NOTIFICATION_SOUNDS, RINGTONES, previewSound, soundsEnabled, startRingtone, type SoundKind } from '@/lib/sounds'
import { useAuthStore } from '@/modules/auth/auth.store'
import type { SoundPreferences } from '@/types/models'

const auth = useAuthStore()
/** Picking sounds is a plan feature; without it everyone hears the defaults (volume and on/off stay theirs). */
const allowed = computed(() => auth.hasFeature('customSounds'))
const saved = computed<SoundPreferences>(() => ({ ...DEFAULT_SOUNDS, ...auth.user?.preferences?.sounds }))
const chosen = computed<SoundPreferences>(() => (allowed.value ? saved.value : { ...DEFAULT_SOUNDS, volume: saved.value.volume }))

const volume = ref([saved.value.volume])
watch(
  () => saved.value.volume,
  (value) => (volume.value = [value]),
)
const VolumeIcon = computed(() => (volume.value[0]! === 0 ? VolumeX : volume.value[0]! < 50 ? Volume1 : Volume2))

async function save(changes: Partial<SoundPreferences>) {
  try {
    await auth.updateProfile({ preferences: { sounds: changes } })
  } catch (error) {
    toast.error(getErrorMessage(error))
  }
}

// --- Previews: one ringtone phrase at a time ------------------------------------------
const previewing = ref<string | null>(null)
let stopPreview: (() => void) | null = null
let previewTimer: ReturnType<typeof setTimeout> | null = null
function endPreview() {
  stopPreview?.()
  stopPreview = null
  if (previewTimer) clearTimeout(previewTimer)
  previewing.value = null
}
function previewRingtone(id: string) {
  const wasPlaying = previewing.value === id
  endPreview()
  if (wasPlaying) return
  previewing.value = id
  stopPreview = startRingtone({ id, url: saved.value.customRingtoneUrl, volume: volume.value[0], once: true })
  previewTimer = setTimeout(endPreview, id === CUSTOM_RINGTONE ? 8000 : 2600)
}
onBeforeUnmount(endPreview)

// --- The person's own ringtone ----------------------------------------------------------
const MAX_TONE_BYTES = 3 * 1024 * 1024
const TONE_TYPES = '.mp3,.wav,.ogg,.m4a,.flac,.webm,audio/*'
const toneInput = useTemplateRef<HTMLInputElement>('toneInput')
const isUploading = ref(false)
const isRemoving = ref(false)
const hasCustom = computed(() => Boolean(saved.value.customRingtoneUrl))

async function uploadTone(file: File | undefined) {
  if (toneInput.value) toneInput.value.value = ''
  if (!file) return
  if (!file.type.startsWith('audio/') && !/\.(mp3|wav|ogg|m4a|flac|webm)$/i.test(file.name)) return toast.error('Choose an audio file: MP3, WAV, OGG, M4A, FLAC or WebM')
  if (file.size > MAX_TONE_BYTES) return toast.error('Keep the file under 3 MB; a short clip of up to 30 seconds is ideal')
  isUploading.value = true
  try {
    await auth.uploadRingtone(file)
    toast.success('Your ringtone is set', { description: `“${saved.value.customRingtoneName}” now rings when someone calls you.` })
    endPreview()
    previewRingtone(CUSTOM_RINGTONE)
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    isUploading.value = false
  }
}

async function removeTone() {
  endPreview()
  isRemoving.value = true
  try {
    await auth.removeRingtone()
    toast.success('Your ringtone was removed')
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    isRemoving.value = false
  }
}

function chooseRingtone(id: string) {
  if (!allowed.value) return
  previewRingtone(id)
  if (id !== saved.value.ringtone) void save({ ringtone: id })
}
function chooseSound(kind: SoundKind, id: string) {
  if (!allowed.value) return
  previewSound(kind, id, volume.value[0])
  if (id !== saved.value[kind]) void save({ [kind]: id })
}
function commitVolume(value: number[] | undefined) {
  const next = value?.[0] ?? 100
  previewSound('notification', chosen.value.notification === 'none' ? 'chime' : chosen.value.notification, next)
  if (next !== saved.value.volume) void save({ volume: next })
}

const SOUND_GROUPS: Array<{ kind: SoundKind; title: string; hint: string; options: typeof MESSAGE_SOUNDS }> = [
  { kind: 'message', title: 'Message sound', hint: 'Direct, team and project chat messages', options: MESSAGE_SOUNDS },
  { kind: 'notification', title: 'Notification sound', hint: 'Assignments, mentions, reminders and other Inbox items', options: NOTIFICATION_SOUNDS },
]
</script>

<template>
  <Card id="sounds" class="scroll-mt-20">
    <CardHeader>
      <CardTitle>Sounds &amp; ringtone</CardTitle>
      <CardDescription>How calls, messages and notifications sound for you. Your choices follow you on every device.</CardDescription>
    </CardHeader>
    <CardContent class="space-y-6">
      <!-- On/off and loudness: always available -->
      <div class="grid gap-4 sm:grid-cols-2">
        <label class="flex items-start justify-between gap-4 rounded-lg border border-border p-3">
          <span>
            <span class="block text-sm font-medium">Message &amp; notification sounds</span>
            <span class="block text-xs text-muted-foreground">Quiet while you are on “Do not disturb”. Saved on this device. Calls always ring.</span>
          </span>
          <Switch v-model="soundsEnabled" />
        </label>
        <div class="space-y-2.5 rounded-lg border border-border p-3">
          <div class="flex items-center justify-between gap-2">
            <span class="text-sm font-medium">Volume</span>
            <span class="text-xs text-muted-foreground tabular-nums">{{ volume[0] }}%</span>
          </div>
          <div class="flex items-center gap-3">
            <component :is="VolumeIcon" class="size-4 shrink-0 text-muted-foreground" />
            <Slider v-model="volume" :min="0" :max="100" :step="5" thumb-label="Volume" @value-commit="commitVolume" />
          </div>
        </div>
      </div>

      <div v-if="!allowed" class="flex items-start gap-3 rounded-lg border border-border bg-muted/50 p-3">
        <span class="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"><Lock class="size-4" /></span>
        <span class="min-w-0 text-[13px]">
          <span class="block font-medium">Custom ringtones and sounds aren’t in your plan</span>
          <span class="block text-xs text-muted-foreground">
            You hear Vector’s default sounds. Ask your organization admin to upgrade the {{ auth.organization?.entitlements?.planName ?? 'current' }} plan to choose your own.
          </span>
        </span>
      </div>

      <!-- Call ringtone -->
      <section class="space-y-2.5">
        <div>
          <h3 class="text-sm font-medium">Call ringtone</h3>
          <p class="text-xs text-muted-foreground">Plays when someone calls you or starts a meeting you are invited to.</p>
        </div>
        <div class="grid gap-2 sm:grid-cols-2 xl:grid-cols-3" role="radiogroup" aria-label="Call ringtone">
          <div
            v-for="tone in RINGTONES"
            :key="tone.id"
            role="radio"
            :aria-checked="chosen.ringtone === tone.id"
            :aria-disabled="!allowed"
            :tabindex="allowed ? 0 : -1"
            class="group flex items-center gap-3 rounded-lg border bg-card p-2.5 transition-[border-color,box-shadow] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30"
            :class="[
              chosen.ringtone === tone.id ? 'border-primary shadow-[0_0_0_1px_var(--primary)]' : 'border-border',
              allowed ? 'cursor-pointer hover:border-input' : 'opacity-60',
            ]"
            @click="chooseRingtone(tone.id)"
            @keydown.enter.prevent="chooseRingtone(tone.id)"
            @keydown.space.prevent="chooseRingtone(tone.id)"
          >
            <button
              type="button"
              class="flex size-9 shrink-0 items-center justify-center rounded-full transition-colors"
              :class="previewing === tone.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground group-hover:bg-accent'"
              :aria-label="previewing === tone.id ? `Stop ${tone.label}` : `Play ${tone.label}`"
              @click.stop="previewRingtone(tone.id)"
            >
              <Pause v-if="previewing === tone.id" class="size-4" />
              <Play v-else class="size-4 translate-x-px" />
            </button>
            <span class="min-w-0 flex-1">
              <span class="block truncate text-[13px] font-medium">{{ tone.label }}</span>
              <span class="block truncate text-[11.5px] text-muted-foreground">{{ tone.description }}</span>
            </span>
            <span v-if="chosen.ringtone === tone.id" class="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Check class="size-3" />
            </span>
            <span v-else-if="previewing === tone.id" class="flex h-4 shrink-0 items-end gap-0.5" aria-hidden="true">
              <span v-for="bar in 3" :key="bar" class="eq w-0.5 rounded-full bg-primary" :style="{ animationDelay: `${bar * 0.15}s` }" />
            </span>
          </div>

          <!-- The person's own tone: pick it like the others, or upload one -->
          <div
            v-if="hasCustom"
            role="radio"
            :aria-checked="chosen.ringtone === CUSTOM_RINGTONE"
            :aria-disabled="!allowed"
            :tabindex="allowed ? 0 : -1"
            class="group flex items-center gap-3 rounded-lg border bg-card p-2.5 transition-[border-color,box-shadow] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30 sm:col-span-2 xl:col-span-3"
            :class="[
              chosen.ringtone === CUSTOM_RINGTONE ? 'border-primary shadow-[0_0_0_1px_var(--primary)]' : 'border-border',
              allowed ? 'cursor-pointer hover:border-input' : 'opacity-60',
            ]"
            @click="chooseRingtone(CUSTOM_RINGTONE)"
            @keydown.enter.prevent="chooseRingtone(CUSTOM_RINGTONE)"
            @keydown.space.prevent="chooseRingtone(CUSTOM_RINGTONE)"
          >
            <button
              type="button"
              class="flex size-9 shrink-0 items-center justify-center rounded-full transition-colors"
              :class="previewing === CUSTOM_RINGTONE ? 'bg-primary text-primary-foreground' : 'bg-primary/12 text-primary group-hover:bg-primary/20'"
              :aria-label="previewing === CUSTOM_RINGTONE ? 'Stop your ringtone' : 'Play your ringtone'"
              @click.stop="previewRingtone(CUSTOM_RINGTONE)"
            >
              <Pause v-if="previewing === CUSTOM_RINGTONE" class="size-4" />
              <Play v-else class="size-4 translate-x-px" />
            </button>
            <span class="min-w-0 flex-1">
              <span class="block truncate text-[13px] font-medium" :title="saved.customRingtoneName ?? ''">{{ saved.customRingtoneName }}</span>
              <span class="flex items-center gap-1 text-[11.5px] whitespace-nowrap text-muted-foreground"><Music class="size-3 shrink-0" /> Your own tone</span>
            </span>
            <template v-if="allowed">
              <Button variant="ghost" size="icon-sm" title="Replace" aria-label="Replace your ringtone" :disabled="isUploading" @click.stop="toneInput?.click()">
                <RefreshCw :class="isUploading && 'animate-spin'" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                class="text-muted-foreground hover:text-destructive"
                title="Remove"
                aria-label="Remove your ringtone"
                :disabled="isRemoving"
                @click.stop="removeTone"
              >
                <Trash2 />
              </Button>
            </template>
            <span v-if="chosen.ringtone === CUSTOM_RINGTONE" class="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Check class="size-3" />
            </span>
          </div>
          <button
            v-else
            type="button"
            class="flex items-center gap-3 rounded-lg border border-dashed border-input bg-transparent p-2.5 text-left transition-colors outline-none hover:border-primary/60 hover:bg-primary/5 focus-visible:ring-[3px] focus-visible:ring-ring/30 disabled:pointer-events-none disabled:opacity-60"
            :disabled="!allowed || isUploading"
            @click="toneInput?.click()"
          >
            <span class="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/12 text-primary">
              <RefreshCw v-if="isUploading" class="size-4 animate-spin" />
              <Upload v-else class="size-4" />
            </span>
            <span class="min-w-0 flex-1">
              <span class="block truncate text-[13px] font-medium">{{ isUploading ? 'Uploading…' : 'Add your own tone' }}</span>
              <span class="block truncate text-[11.5px] text-muted-foreground">MP3, WAV, M4A or OGG · up to 3 MB</span>
            </span>
          </button>
        </div>
        <p v-if="allowed" class="text-[11.5px] text-muted-foreground">Your own tone plays up to its first 30 seconds, then starts again until you answer.</p>
        <input ref="toneInput" type="file" class="hidden" :accept="TONE_TYPES" @change="uploadTone(($event.target as HTMLInputElement).files?.[0])" />
      </section>

      <!-- Message and notification sounds -->
      <section v-for="group in SOUND_GROUPS" :key="group.kind" class="space-y-2.5">
        <div>
          <h3 class="text-sm font-medium">{{ group.title }}</h3>
          <p class="text-xs text-muted-foreground">{{ group.hint }}</p>
        </div>
        <div class="flex flex-wrap gap-1.5" role="radiogroup" :aria-label="group.title">
          <button
            v-for="option in group.options"
            :key="option.id"
            type="button"
            role="radio"
            :aria-checked="chosen[group.kind] === option.id"
            :disabled="!allowed"
            :title="option.description"
            class="inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition-colors disabled:opacity-60"
            :class="
              chosen[group.kind] === option.id
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-card text-muted-foreground hover:border-input hover:text-foreground'
            "
            @click="chooseSound(group.kind, option.id)"
          >
            <Check v-if="chosen[group.kind] === option.id" class="size-3.5" />
            {{ option.label }}
          </button>
          <Button variant="ghost" size="sm" class="text-muted-foreground" :disabled="chosen[group.kind] === 'none'" @click="previewSound(group.kind, chosen[group.kind], volume[0])">
            <Play /> Test
          </Button>
        </div>
      </section>
    </CardContent>
  </Card>
</template>

<style scoped>
.eq {
  animation: eq 0.7s ease-in-out infinite alternate;
}
@keyframes eq {
  from {
    height: 25%;
  }
  to {
    height: 100%;
  }
}
</style>

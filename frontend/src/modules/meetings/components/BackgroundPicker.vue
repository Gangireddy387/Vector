<script setup lang="ts">
import { Ban, Check, ImagePlus, LoaderCircle, Sparkles } from 'lucide-vue-next'
import { computed, ref, useTemplateRef } from 'vue'
import { toast } from 'vue-sonner'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { type BackgroundChoice, PRESETS, customImage, presetThumbnail, saveCustomImage } from '../call/backgrounds'
import { useMeetingCall } from '../useMeetingCall'

/**
 * Background effects for this person's camera: none, blur, a built-in scene, or a picture of their own. The person
 * is found and cut out by a model running in this browser; nothing is uploaded.
 */
const open = defineModel<boolean>('open', { default: false })
const call = useMeetingCall()
const picker = useTemplateRef<HTMLInputElement>('picker')
const custom = ref(customImage())
const busy = ref<string | null>(null)

const current = computed(() => call.background.value)
const isChosen = (choice: BackgroundChoice) =>
  current.value.kind === choice.kind && (choice.kind !== 'preset' || (current.value.kind === 'preset' && current.value.id === choice.id))

async function choose(choice: BackgroundChoice, key: string) {
  busy.value = key
  try {
    await call.setBackground(choice)
  } catch (error) {
    toast.error(error instanceof Error ? error.message : 'Could not change the background')
  } finally {
    busy.value = null
  }
}

async function upload(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  try {
    custom.value = await saveCustomImage(file)
    await choose({ kind: 'custom' }, 'custom')
  } catch (error) {
    toast.error(error instanceof Error ? error.message : 'Could not use that picture')
  }
}

const tile = 'relative flex aspect-video items-center justify-center overflow-hidden rounded-lg border-2 text-xs font-medium transition-all'
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>Background effects</DialogTitle>
        <DialogDescription>Hide what is behind you. It works on this device; your camera video never leaves it for this.</DialogDescription>
      </DialogHeader>

      <div class="grid grid-cols-3 gap-2 sm:grid-cols-4">
        <button type="button" :class="[tile, isChosen({ kind: 'none' }) ? 'border-primary ring-4 ring-primary/15' : 'border-border hover:border-primary/40']" @click="choose({ kind: 'none' }, 'none')">
          <span class="flex flex-col items-center gap-1"><Ban class="size-5" /> None</span>
        </button>
        <button
          type="button"
          :class="[tile, 'bg-gradient-to-br from-slate-200 to-slate-400 dark:from-slate-700 dark:to-slate-900', isChosen({ kind: 'blur' }) ? 'border-primary ring-4 ring-primary/15' : 'border-border hover:border-primary/40']"
          @click="choose({ kind: 'blur' }, 'blur')"
        >
          <span class="flex flex-col items-center gap-1 backdrop-blur"><Sparkles class="size-5" /> Blur</span>
        </button>
        <button
          v-for="preset in PRESETS"
          :key="preset.id"
          type="button"
          :class="[tile, isChosen({ kind: 'preset', id: preset.id }) ? 'border-primary ring-4 ring-primary/15' : 'border-transparent hover:border-primary/40']"
          :title="preset.label"
          @click="choose({ kind: 'preset', id: preset.id }, preset.id)"
        >
          <img :src="presetThumbnail(preset.id)" :alt="preset.label" class="absolute inset-0 size-full object-cover" />
          <span class="absolute inset-x-0 bottom-0 bg-black/45 px-1 py-0.5 text-[10px] text-white">{{ preset.label }}</span>
        </button>
        <button
          v-if="custom"
          type="button"
          :class="[tile, isChosen({ kind: 'custom' }) ? 'border-primary ring-4 ring-primary/15' : 'border-transparent hover:border-primary/40']"
          title="Your picture"
          @click="choose({ kind: 'custom' }, 'custom')"
        >
          <img :src="custom" alt="Your picture" class="absolute inset-0 size-full object-cover" />
          <span class="absolute inset-x-0 bottom-0 bg-black/45 px-1 py-0.5 text-[10px] text-white">Your picture</span>
        </button>
        <button type="button" :class="[tile, 'border-dashed border-border hover:border-primary/40']" @click="picker?.click()">
          <span class="flex flex-col items-center gap-1 text-muted-foreground"><ImagePlus class="size-5" /> {{ custom ? 'Replace' : 'Upload' }}</span>
        </button>
      </div>
      <input ref="picker" type="file" accept="image/png,image/jpeg,image/webp" class="hidden" @change="upload" />

      <p class="flex items-center gap-1.5 text-xs text-muted-foreground">
        <template v-if="busy || call.blurBusy.value"><LoaderCircle class="size-3.5 animate-spin" /> Applying…</template>
        <template v-else-if="!call.media.video">Turn your camera on to see the effect.</template>
        <template v-else><Check class="size-3.5 text-emerald-600" /> Others see what is in your tile.</template>
      </p>
    </DialogContent>
  </Dialog>
</template>

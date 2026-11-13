<script setup lang="ts">
import { Check, ImageIcon, Palette, RotateCcw } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { BRAND_THEMES, DEFAULT_BRAND, colorFromImage, resolveBrand, swatchColor, type BrandTone } from '@/lib/brand-theme'
import { assetUrl, getErrorMessage } from '@/lib/http'
import { useWorkspaceStore } from '@/stores/workspace.store'

const workspace = useWorkspaceStore()
const current = computed(() => workspace.settings.brandColor ?? DEFAULT_BRAND.id)
const isHex = computed(() => current.value.startsWith('#'))
const saving = ref<string | null>(null)

/** The colour read from the organization's logo, offered as a one-click theme. */
const logo = computed(() => assetUrl(workspace.settings.logoUrl))
const logoColor = ref<string | null>(null)
watch(
  logo,
  async (url) => {
    logoColor.value = null
    if (!url) return
    try {
      logoColor.value = await colorFromImage(url)
    } catch {
      logoColor.value = null
    }
  },
  { immediate: true },
)

const custom = ref(isHex.value ? current.value : '#2563eb')
watch(current, (value) => {
  if (value.startsWith('#')) custom.value = value
})
const isValidHex = computed(() => /^#[0-9a-f]{6}$/i.test(custom.value))

async function choose(value: string | null, label: string) {
  const next = value === DEFAULT_BRAND.id ? null : value
  if ((workspace.settings.brandColor ?? null) === next) return
  saving.value = value ?? DEFAULT_BRAND.id
  try {
    await workspace.update({ brandColor: next })
    toast.success(`Theme colour set to ${label}`)
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    saving.value = null
  }
}

const gradient = (tone: BrandTone) =>
  `linear-gradient(135deg, ${swatchColor(tone)}, oklch(${Math.min(tone.l + 0.06, 0.9)} ${tone.c} ${tone.h + tone.shift}))`
const logoTone = computed(() => (logoColor.value ? resolveBrand(logoColor.value) : null))
const customTone = computed(() => resolveBrand(isValidHex.value ? custom.value.toLowerCase() : null))
</script>

<template>
  <div class="space-y-4">
    <div class="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5" role="radiogroup" aria-label="Theme colour">
      <button
        v-for="theme in BRAND_THEMES"
        :key="theme.id"
        type="button"
        role="radio"
        :aria-checked="current === theme.id"
        class="group relative flex items-center gap-2.5 rounded-lg border bg-card p-2.5 text-left transition-[border-color,box-shadow] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30"
        :class="current === theme.id ? 'border-primary shadow-[0_0_0_1px_var(--primary)]' : 'border-border hover:border-input'"
        :disabled="saving !== null"
        @click="choose(theme.id, theme.label)"
      >
        <span class="relative flex size-8 shrink-0 items-center justify-center rounded-md shadow-glow" :style="{ background: gradient(theme.tone) }">
          <Check v-if="current === theme.id" class="size-4" :class="theme.tone.fg === 'dark' ? 'text-black/80' : 'text-white'" />
        </span>
        <span class="min-w-0">
          <span class="block truncate text-[13px] font-medium">{{ theme.label }}</span>
          <span class="block truncate text-[11.5px] text-muted-foreground">{{ theme.description }}</span>
        </span>
      </button>
    </div>

    <div class="grid gap-2 sm:grid-cols-2">
      <!-- From the logo -->
      <div
        class="flex items-center gap-3 rounded-lg border bg-card p-2.5"
        :class="isHex && logoColor && current === logoColor.toLowerCase() ? 'border-primary shadow-[0_0_0_1px_var(--primary)]' : 'border-border'"
      >
        <span class="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-white">
          <img v-if="logo" :src="logo" alt="" class="size-full object-contain p-1" />
          <ImageIcon v-else class="size-4 text-muted-foreground" />
        </span>
        <span class="min-w-0 flex-1">
          <span class="block text-[13px] font-medium">Match your logo</span>
          <span class="block truncate text-[11.5px] text-muted-foreground">
            {{ !logo ? 'Upload a logo above to use its colour' : logoColor ? `Uses ${logoColor} from your logo` : 'No clear colour found in the logo' }}
          </span>
        </span>
        <span v-if="logoTone" class="size-6 shrink-0 rounded-full ring-2 ring-background" :style="{ background: gradient(logoTone) }" />
        <Button
          size="sm"
          variant="outline"
          :disabled="!logoColor || saving !== null || current === logoColor?.toLowerCase()"
          :loading="saving === logoColor"
          @click="choose(logoColor, 'your logo colour')"
        >
          Use
        </Button>
      </div>

      <!-- Any colour -->
      <div class="flex items-center gap-3 rounded-lg border bg-card p-2.5" :class="isHex && current !== logoColor?.toLowerCase() ? 'border-primary shadow-[0_0_0_1px_var(--primary)]' : 'border-border'">
        <label class="relative flex size-10 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-md shadow-glow" :style="{ background: gradient(customTone) }">
          <Palette class="size-4" :class="customTone.fg === 'dark' ? 'text-black/70' : 'text-white'" />
          <input v-model="custom" type="color" class="absolute inset-0 cursor-pointer opacity-0" aria-label="Pick a custom colour" />
        </label>
        <span class="min-w-0 flex-1">
          <span class="block text-[13px] font-medium">Your brand colour</span>
          <Input v-model.trim="custom" class="mt-1 h-7 w-28 font-mono text-xs" maxlength="7" aria-label="Hex colour" placeholder="#2563eb" />
        </span>
        <Button
          size="sm"
          variant="outline"
          :disabled="!isValidHex || saving !== null || current === custom.toLowerCase()"
          :loading="saving === custom.toLowerCase()"
          @click="choose(custom.toLowerCase(), custom.toLowerCase())"
        >
          Apply
        </Button>
      </div>
    </div>

    <div class="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
      <span>Text and buttons stay readable: very light or very dark colours are adjusted automatically for light and dark mode.</span>
      <Button v-if="current !== DEFAULT_BRAND.id" variant="ghost" size="xs" :disabled="saving !== null" @click="choose(null, 'Vector')">
        <RotateCcw /> Reset to Vector
      </Button>
    </div>
  </div>
</template>

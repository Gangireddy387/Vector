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
const activeTheme = computed(() => BRAND_THEMES.find((theme) => theme.id === current.value) ?? null)
const usingLogo = computed(() => Boolean(isHex.value && logoColor.value && current.value === logoColor.value.toLowerCase()))
const usingCustom = computed(() => Boolean(isHex.value && !usingLogo.value))
</script>

<template>
  <div class="space-y-5">
    <!-- Named themes: swatch above full label — no side truncation at 1024 -->
    <div
      class="grid grid-cols-5 gap-x-2 gap-y-3 sm:gap-x-3"
      role="radiogroup"
      aria-label="Theme colour"
    >
      <button
        v-for="theme in BRAND_THEMES"
        :key="theme.id"
        type="button"
        role="radio"
        :aria-checked="current === theme.id"
        :aria-label="`${theme.label}: ${theme.description}`"
        :title="`${theme.label} — ${theme.description}`"
        class="group flex min-w-0 flex-col items-center gap-1.5 rounded-xl p-1.5 text-center outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/40"
        :disabled="saving !== null"
        @click="choose(theme.id, theme.label)"
      >
        <span
          class="relative flex size-9 items-center justify-center rounded-full shadow-sm ring-2 ring-offset-2 ring-offset-background transition-[box-shadow,transform] sm:size-10"
          :class="
            current === theme.id
              ? 'scale-[1.04] ring-primary'
              : 'ring-transparent group-hover:ring-border group-hover:scale-[1.02]'
          "
          :style="{ background: gradient(theme.tone) }"
        >
          <Check
            v-if="current === theme.id"
            class="size-4 drop-shadow-sm"
            :class="theme.tone.fg === 'dark' ? 'text-black/80' : 'text-white'"
          />
        </span>
        <span class="w-full min-w-0">
          <span
            class="block truncate text-[11px] font-medium leading-tight sm:text-xs"
            :class="current === theme.id ? 'text-foreground' : 'text-muted-foreground group-hover:text-foreground'"
          >
            {{ theme.label }}
          </span>
        </span>
      </button>
    </div>

    <p v-if="activeTheme" class="text-xs text-muted-foreground">
      <span class="font-medium text-foreground">{{ activeTheme.label }}</span>
      · {{ activeTheme.description }}
    </p>
    <p v-else-if="usingLogo && logoColor" class="text-xs text-muted-foreground">
      <span class="font-medium text-foreground">Logo colour</span>
      · {{ logoColor.toLowerCase() }}
    </p>
    <p v-else-if="usingCustom" class="text-xs text-muted-foreground">
      <span class="font-medium text-foreground">Custom</span>
      · {{ current.toLowerCase() }}
    </p>

    <!-- Custom sources: equal cards, shared chrome -->
    <div class="grid gap-3 sm:grid-cols-2">
      <div
        class="flex min-h-[5.5rem] flex-col gap-3 rounded-xl border bg-card p-3"
        :class="usingLogo ? 'border-primary shadow-[0_0_0_1px_var(--primary)]' : 'border-border'"
      >
        <div class="flex items-start gap-3">
          <span class="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-white">
            <img v-if="logo" :src="logo" alt="" class="size-full object-contain p-1" />
            <ImageIcon v-else class="size-4 text-muted-foreground" />
          </span>
          <div class="min-w-0 flex-1">
            <p class="text-[13px] font-medium">Match your logo</p>
            <p class="mt-0.5 text-[11.5px] leading-snug text-muted-foreground">
              {{
                !logo
                  ? 'Upload a logo above to use its colour'
                  : logoColor
                    ? `Detected ${logoColor.toLowerCase()}`
                    : 'No clear colour found in the logo'
              }}
            </p>
          </div>
          <span
            v-if="logoTone"
            class="mt-0.5 size-5 shrink-0 rounded-full ring-1 ring-border"
            :style="{ background: gradient(logoTone) }"
            :title="logoColor ?? undefined"
          />
        </div>
        <Button
          size="sm"
          variant="outline"
          class="mt-auto w-full"
          :disabled="!logoColor || saving !== null || current === logoColor?.toLowerCase()"
          :loading="saving === logoColor"
          @click="choose(logoColor, 'your logo colour')"
        >
          Use logo colour
        </Button>
      </div>

      <div
        class="flex min-h-[5.5rem] flex-col gap-3 rounded-xl border bg-card p-3"
        :class="usingCustom ? 'border-primary shadow-[0_0_0_1px_var(--primary)]' : 'border-border'"
      >
        <div class="flex items-start gap-3">
          <label
            class="relative flex size-10 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-lg shadow-sm"
            :style="{ background: gradient(customTone) }"
          >
            <Palette class="size-4" :class="customTone.fg === 'dark' ? 'text-black/70' : 'text-white'" />
            <input v-model="custom" type="color" class="absolute inset-0 cursor-pointer opacity-0" aria-label="Pick a custom colour" />
          </label>
          <div class="min-w-0 flex-1">
            <p class="text-[13px] font-medium">Your brand colour</p>
            <Input
              v-model.trim="custom"
              class="mt-1.5 h-8 w-full max-w-[9.5rem] font-mono text-xs"
              maxlength="7"
              aria-label="Hex colour"
              placeholder="#2563eb"
            />
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          class="mt-auto w-full"
          :disabled="!isValidHex || saving !== null || current === custom.toLowerCase()"
          :loading="saving === custom.toLowerCase()"
          @click="choose(custom.toLowerCase(), custom.toLowerCase())"
        >
          Apply colour
        </Button>
      </div>
    </div>

    <div class="flex flex-col gap-2 border-t border-border/70 pt-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
      <p class="leading-relaxed">
        Very light or dark colours are adjusted so text and buttons stay readable in light and dark mode.
      </p>
      <Button
        v-if="current !== DEFAULT_BRAND.id"
        variant="ghost"
        size="xs"
        class="shrink-0 self-start sm:self-auto"
        :disabled="saving !== null"
        @click="choose(null, 'Vector')"
      >
        <RotateCcw /> Reset to Vector
      </Button>
    </div>
  </div>
</template>

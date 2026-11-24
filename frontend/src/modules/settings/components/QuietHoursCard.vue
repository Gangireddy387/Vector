<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import Toolbar from '@/components/common/Toolbar.vue'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { getErrorMessage } from '@/lib/http'
import { useAuthStore } from '@/modules/auth/auth.store'
import type { QuietHoursPreferences } from '@/types/models'

const DEFAULTS: QuietHoursPreferences = { enabled: false, start: '22:00', end: '07:00' }

const auth = useAuthStore()
const saved = computed(() => ({ ...DEFAULTS, ...auth.user?.preferences?.quietHours }))
const draft = ref<QuietHoursPreferences>({ ...saved.value })
const saving = ref(false)

watch(
  saved,
  (value) => {
    draft.value = { ...value }
  },
  { deep: true },
)

const dirty = computed(
  () =>
    draft.value.enabled !== saved.value.enabled ||
    draft.value.start !== saved.value.start ||
    draft.value.end !== saved.value.end,
)

const overnight = computed(() => draft.value.start > draft.value.end)

async function save() {
  saving.value = true
  try {
    await auth.updateProfile({
      preferences: {
        quietHours: {
          enabled: draft.value.enabled,
          start: draft.value.start,
          end: draft.value.end,
        },
      },
    })
    toast.success(draft.value.enabled ? 'Quiet hours saved' : 'Quiet hours turned off')
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <Card class="gap-3">
    <CardHeader class="border-b border-border/60 pb-3">
      <CardTitle>Quiet hours</CardTitle>
      <CardDescription>
        Pause email and device push during a local window. Your inbox still updates, and incoming calls still ring. Uses your time zone
        ({{ auth.user?.timezone || 'UTC' }}).
      </CardDescription>
    </CardHeader>
    <CardContent class="space-y-4">
      <label class="flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-border/70 px-3.5 py-3">
        <span class="min-w-0">
          <span class="block text-sm font-medium">Enable quiet hours</span>
          <span class="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
            Daily digest and weekly report emails still send at their scheduled morning times.
          </span>
        </span>
        <Switch class="mt-0.5" :model-value="draft.enabled" @update:model-value="(value: boolean) => (draft.enabled = value)" />
      </label>

      <div class="grid gap-3 sm:grid-cols-2" :class="!draft.enabled && 'pointer-events-none opacity-60'">
        <label class="space-y-1.5 text-sm">
          <span class="font-medium">Starts</span>
          <Input v-model="draft.start" type="time" class="h-9" aria-label="Quiet hours start" />
        </label>
        <label class="space-y-1.5 text-sm">
          <span class="font-medium">Ends</span>
          <Input v-model="draft.end" type="time" class="h-9" aria-label="Quiet hours end" />
        </label>
      </div>
      <p v-if="draft.enabled && overnight" class="text-xs text-muted-foreground">Overnight window — quiet from {{ draft.start }} until {{ draft.end }} the next day.</p>

      <Toolbar variant="footer" dense>
        <Button v-if="dirty" size="sm" variant="ghost" :disabled="saving" @click="draft = { ...saved }">Reset</Button>
        <Button size="sm" :loading="saving" :disabled="!dirty" @click="save">Save quiet hours</Button>
      </Toolbar>
    </CardContent>
  </Card>
</template>

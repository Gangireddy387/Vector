<script setup lang="ts">
import { Globe, LocateFixed } from 'lucide-vue-next'
import { computed, onBeforeUnmount, ref } from 'vue'
import { toast } from 'vue-sonner'
import { SelectField, type SelectFieldOption } from '@/components/forms'
import { Switch } from '@/components/ui/switch'
import { getErrorMessage } from '@/lib/http'
import { cityOf, detectTimeZone, formatOffset, listTimeZones, localTime } from '@/lib/timezone'
import { useAuthStore } from '@/modules/auth/auth.store'

const auth = useAuthStore()
const detected = detectTimeZone()
const isSaving = ref(false)

/** Ticks once a minute so the local times stay current while the page is open. */
const now = ref(new Date())
const timer = window.setInterval(() => (now.value = new Date()), 60_000)
onBeforeUnmount(() => window.clearInterval(timer))

const isAutomatic = computed(() => auth.user?.preferences.autoTimezone !== false)
const current = computed(() => auth.user?.timezone ?? detected)

const describe = (zone: string) => `${zone} · ${formatOffset(zone, now.value)} · ${localTime(zone, now.value)}`

const options = computed<SelectFieldOption[]>(() =>
  listTimeZones().map((zone) => ({
    value: zone,
    label: zone === 'UTC' ? 'Coordinated Universal Time' : cityOf(zone),
    description: describe(zone),
    group: zone === 'UTC' ? 'Universal' : zone.split('/')[0]!.replace(/_/g, ' '),
    icon: zone === detected ? LocateFixed : undefined,
  })),
)

async function save(changes: { timezone?: string; autoTimezone: boolean }, message: string) {
  isSaving.value = true
  try {
    await auth.updateProfile({ ...(changes.timezone ? { timezone: changes.timezone } : {}), preferences: { autoTimezone: changes.autoTimezone } })
    toast.success(message)
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    isSaving.value = false
  }
}

const setAutomatic = (value: boolean) =>
  value
    ? save({ timezone: detected, autoTimezone: true }, `Time zone set automatically (${cityOf(detected)})`)
    : save({ autoTimezone: false }, 'Choose your time zone below')

const chooseZone = (zone: string | null | undefined) =>
  zone && zone !== current.value && save({ timezone: zone, autoTimezone: false }, `Time zone set to ${cityOf(zone)}`)
</script>

<template>
  <div class="space-y-3 border border-border/70 bg-muted/30 p-3">
    <div class="flex items-start justify-between gap-4">
      <div class="flex min-w-0 gap-2.5">
        <Globe class="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div class="min-w-0">
          <p class="text-sm font-medium">Time zone</p>
          <p class="text-xs text-muted-foreground">Used for due dates, reminders and your 8:00 daily digest.</p>
        </div>
      </div>
      <label class="flex shrink-0 items-center gap-2 text-xs font-medium">
        Set automatically
        <Switch :model-value="isAutomatic" :disabled="isSaving" aria-label="Set time zone automatically" @update:model-value="setAutomatic" />
      </label>
    </div>

    <div v-if="isAutomatic" class="flex items-center gap-3 border border-border/70 bg-card px-3 py-2">
      <LocateFixed class="size-4 shrink-0 text-primary" />
      <div class="min-w-0 text-sm">
        <p class="truncate font-medium">{{ cityOf(current) }} <span class="font-normal text-muted-foreground">· {{ formatOffset(current, now) }}</span></p>
        <p class="text-xs text-muted-foreground">Detected from this device · it's {{ localTime(current, now) }} there now</p>
      </div>
    </div>

    <div v-else class="space-y-1.5">
      <SelectField
        :model-value="current"
        :options="options"
        searchable
        search-placeholder="Search city, region or offset…"
        empty-text="No time zone matches"
        aria-label="Time zone"
        :disabled="isSaving"
        @update:model-value="chooseZone"
      />
      <p class="text-xs text-muted-foreground">
        It's {{ localTime(current, now) }} in {{ cityOf(current) }}.
        <template v-if="current !== detected"> This device is set to {{ cityOf(detected) }} ({{ formatOffset(detected, now) }}).</template>
      </p>
    </div>
  </div>
</template>

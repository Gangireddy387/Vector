<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import FormField from '@/components/common/FormField.vue'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { getErrorMessage, getFieldErrors } from '@/lib/http'
import { useWorkspaceStore } from '@/stores/workspace.store'
import type { OrganizationChannelNotifications } from '@/types/models'

const workspace = useWorkspaceStore()

const EVENT_OPTIONS = [
  { key: 'assigned' as const, label: 'Issue assigned', hint: 'When someone is assigned a task' },
  { key: 'commented' as const, label: 'Comments', hint: 'New comments on tasks (includes mentions)' },
  { key: 'due_soon' as const, label: 'Due soon / overdue', hint: 'Reminder when a task is due' },
  { key: 'sprint_started' as const, label: 'Sprint started', hint: 'When a sprint begins' },
]

const available = computed(() => Boolean(workspace.settings.channelNotifications?.available))
const current = computed<OrganizationChannelNotifications>(() => ({
  available: available.value,
  enabled: Boolean(workspace.settings.channelNotifications?.enabled),
  events: {
    assigned: workspace.settings.channelNotifications?.events?.assigned !== false,
    commented: workspace.settings.channelNotifications?.events?.commented !== false,
    due_soon: workspace.settings.channelNotifications?.events?.due_soon !== false,
    sprint_started: workspace.settings.channelNotifications?.events?.sprint_started !== false,
  },
  slackConfigured: Boolean(workspace.settings.channelNotifications?.slackConfigured),
  teamsConfigured: Boolean(workspace.settings.channelNotifications?.teamsConfigured),
}))

const form = ref({
  enabled: current.value.enabled,
  events: { ...current.value.events },
  slackWebhookUrl: '',
  teamsWebhookUrl: '',
  clearSlack: false,
  clearTeams: false,
})
const fieldErrors = ref<Record<string, string>>({})
const isSaving = ref(false)

watch(
  current,
  (next) => {
    form.value = {
      enabled: next.enabled,
      events: { ...next.events },
      slackWebhookUrl: '',
      teamsWebhookUrl: '',
      clearSlack: false,
      clearTeams: false,
    }
  },
  { deep: true },
)

const isDirty = computed(() => {
  const saved = current.value
  return (
    form.value.enabled !== saved.enabled ||
    EVENT_OPTIONS.some((option) => form.value.events[option.key] !== saved.events[option.key]) ||
    Boolean(form.value.slackWebhookUrl.trim()) ||
    Boolean(form.value.teamsWebhookUrl.trim()) ||
    form.value.clearSlack ||
    form.value.clearTeams
  )
})

async function save() {
  if (!available.value) return
  isSaving.value = true
  fieldErrors.value = {}
  try {
    await workspace.update({
      channelNotifications: {
        enabled: form.value.enabled,
        events: { ...form.value.events },
        slackConfigured: current.value.slackConfigured,
        teamsConfigured: current.value.teamsConfigured,
        slackWebhookUrl: form.value.clearSlack
          ? null
          : form.value.slackWebhookUrl.trim()
            ? form.value.slackWebhookUrl.trim()
            : '',
        teamsWebhookUrl: form.value.clearTeams
          ? null
          : form.value.teamsWebhookUrl.trim()
            ? form.value.teamsWebhookUrl.trim()
            : '',
      },
    })
    form.value.slackWebhookUrl = ''
    form.value.teamsWebhookUrl = ''
    form.value.clearSlack = false
    form.value.clearTeams = false
    toast.success('Channel notifications saved')
  } catch (error) {
    fieldErrors.value = getFieldErrors(error)
    if (!Object.keys(fieldErrors.value).length) toast.error(getErrorMessage(error))
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle>Slack &amp; Teams</CardTitle>
      <CardDescription>
        <template v-if="available">
          Post work updates to a Slack or Microsoft Teams channel using an Incoming Webhook. Paste the webhook URL from
          your workspace admin.
        </template>
        <template v-else>Included on Pro and Enterprise (or when the portal turns this feature on).</template>
      </CardDescription>
    </CardHeader>
    <CardContent v-if="!available" class="text-sm text-muted-foreground">
      Ask the portal administrator to enable Slack &amp; Teams notifications on this organization’s plan.
    </CardContent>
    <CardContent v-else class="space-y-4">
      <label class="flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-border/70 px-3.5 py-3">
        <span class="min-w-0">
          <span class="block text-sm font-medium">Enable channel notifications</span>
          <span class="mt-0.5 block text-xs text-muted-foreground">Send selected events to the webhooks below.</span>
        </span>
        <Switch v-model="form.enabled" class="mt-0.5" :disabled="isSaving" />
      </label>

      <FormField
        label="Slack Incoming Webhook"
        for="channel-slack"
        :hint="current.slackConfigured ? 'Configured. Leave blank to keep, or clear below.' : 'https://hooks.slack.com/services/…'"
        :error="fieldErrors['channelNotifications.slackWebhookUrl']"
      >
        <Input
          id="channel-slack"
          v-model="form.slackWebhookUrl"
          type="url"
          placeholder="https://hooks.slack.com/services/…"
          :disabled="isSaving || form.clearSlack"
          autocomplete="off"
        />
      </FormField>
      <label v-if="current.slackConfigured" class="flex items-center gap-2 text-xs text-muted-foreground">
        <input v-model="form.clearSlack" type="checkbox" class="size-3.5" :disabled="isSaving" />
        Remove Slack webhook
      </label>

      <FormField
        label="Teams Incoming Webhook"
        for="channel-teams"
        :hint="current.teamsConfigured ? 'Configured. Leave blank to keep, or clear below.' : 'https://….webhook.office.com/…'"
        :error="fieldErrors['channelNotifications.teamsWebhookUrl']"
      >
        <Input
          id="channel-teams"
          v-model="form.teamsWebhookUrl"
          type="url"
          placeholder="https://….webhook.office.com/…"
          :disabled="isSaving || form.clearTeams"
          autocomplete="off"
        />
      </FormField>
      <label v-if="current.teamsConfigured" class="flex items-center gap-2 text-xs text-muted-foreground">
        <input v-model="form.clearTeams" type="checkbox" class="size-3.5" :disabled="isSaving" />
        Remove Teams webhook
      </label>

      <div class="space-y-2">
        <p class="text-sm font-medium">Events</p>
        <label
          v-for="option in EVENT_OPTIONS"
          :key="option.key"
          class="flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-border/70 px-3.5 py-3"
          :class="!form.enabled && 'opacity-60'"
        >
          <span class="min-w-0">
            <span class="block text-sm font-medium">{{ option.label }}</span>
            <span class="mt-0.5 block text-xs text-muted-foreground">{{ option.hint }}</span>
          </span>
          <Switch v-model="form.events[option.key]" class="mt-0.5" :disabled="isSaving || !form.enabled" />
        </label>
      </div>

      <Button type="button" :loading="isSaving" :disabled="!isDirty" @click="save">Save channel settings</Button>
    </CardContent>
  </Card>
</template>

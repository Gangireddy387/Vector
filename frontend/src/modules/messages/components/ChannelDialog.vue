<script setup lang="ts">
import { Hash, Lock } from 'lucide-vue-next'
import { computed, reactive, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { getErrorMessage } from '@/lib/http'
import { type ChannelPrivacy, type ConversationSummary, channelsApi } from '../messages.api'

/** Adds a channel to a team, or (with `channel`) renames one and changes its description. */
const props = defineProps<{ teams: Array<{ id: string; name: string }>; channel?: ConversationSummary | null; teamId?: string | null }>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ saved: [conversation: ConversationSummary, created: boolean] }>()

const form = reactive({ teamId: '', name: '', description: '', privacy: 'standard' as ChannelPrivacy })
const isSaving = ref(false)
const isEdit = computed(() => Boolean(props.channel?.channel))

watch(open, (value) => {
  if (!value) return
  const info = props.channel?.channel
  form.teamId = props.channel?.team?.id ?? props.teamId ?? props.teams[0]?.id ?? ''
  form.name = info?.name ?? ''
  form.description = info?.description ?? ''
  form.privacy = info?.privacy ?? 'standard'
})

const PRIVACY = [
  { value: 'standard', icon: Hash, label: 'Standard', hint: 'Everyone in the team can see and join in.' },
  { value: 'private', icon: Lock, label: 'Private', hint: 'Only the people you add. You choose them next.' },
] as const

async function save() {
  const name = form.name.trim()
  if (!name || !form.teamId || isSaving.value) return
  isSaving.value = true
  try {
    const description = form.description.trim() || null
    const conversation = isEdit.value
      ? await channelsApi.update(props.channel!.channel!.id, { name, description })
      : await channelsApi.create({ teamId: form.teamId, name, description, privacy: form.privacy })
    open.value = false
    emit('saved', conversation, !isEdit.value)
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{{ isEdit ? 'Edit channel' : 'Add a channel' }}</DialogTitle>
        <DialogDescription>
          {{ isEdit ? 'Change its name or what it is about.' : 'Channels keep a team’s conversations organized by topic, project or anything else.' }}
        </DialogDescription>
      </DialogHeader>

      <form id="channel-form" class="space-y-4" @submit.prevent="save">
        <div v-if="!isEdit" class="space-y-1.5">
          <Label for="channel-team">Team</Label>
          <Select v-model="form.teamId">
            <SelectTrigger id="channel-team"><SelectValue placeholder="Choose a team" /></SelectTrigger>
            <SelectContent>
              <SelectItem v-for="team in teams" :key="team.id" :value="team.id">{{ team.name }}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div class="space-y-1.5">
          <Label for="channel-name">Channel name</Label>
          <Input id="channel-name" v-model="form.name" maxlength="50" placeholder="e.g. Releases" autofocus />
        </div>
        <div class="space-y-1.5">
          <Label for="channel-description">Description <span class="font-normal text-muted-foreground">(optional)</span></Label>
          <Textarea id="channel-description" v-model="form.description" :rows="2" maxlength="300" placeholder="What this channel is for" />
        </div>
        <div v-if="!isEdit" class="space-y-1.5">
          <Label>Privacy</Label>
          <div class="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Privacy">
            <button
              v-for="option in PRIVACY"
              :key="option.value"
              type="button"
              role="radio"
              :aria-checked="form.privacy === option.value"
              class="flex flex-col gap-1 rounded-lg border p-3 text-left transition-colors"
              :class="form.privacy === option.value ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border hover:border-input'"
              @click="form.privacy = option.value"
            >
              <span class="flex items-center gap-1.5 text-sm font-medium"><component :is="option.icon" class="size-4" /> {{ option.label }}</span>
              <span class="text-xs text-muted-foreground">{{ option.hint }}</span>
            </button>
          </div>
        </div>
      </form>

      <DialogFooter>
        <Button variant="ghost" @click="open = false">Cancel</Button>
        <Button type="submit" form="channel-form" variant="brand" :disabled="!form.name.trim() || !form.teamId" :loading="isSaving">
          {{ isEdit ? 'Save' : 'Add channel' }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

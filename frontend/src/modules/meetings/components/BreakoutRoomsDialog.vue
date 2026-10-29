<script setup lang="ts">
import { DoorOpen, Megaphone, Shuffle, Undo2 } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import UserAvatar from '@/components/common/UserAvatar.vue'
import { SelectField, type SelectFieldOption } from '@/components/forms'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { type CallUser, useMeetingCall } from '../useMeetingCall'

/**
 * The host splits the call into smaller rooms and brings everyone back. While rooms are open, people can be moved,
 * the host can visit any room, and a message can be sent to all rooms at once.
 */
const open = defineModel<boolean>('open', { default: false })

const MAIN = 'main'
const call = useMeetingCall()
const isBusy = ref(false)
const count = ref(2)
const names = ref<string[]>([])
/** socketId → room index as text, or 'main'. */
const plan = ref<Record<string, string>>({})
const message = ref('')

/** Everyone in the call (before rooms open, all are in the main room). */
const people = computed<Array<{ socketId: string; user: CallUser | null; self: boolean }>>(() => [
  { socketId: call.selfId.value ?? 'self', user: call.selfUser.value, self: true },
  ...call.peers.value.map((peer) => ({ socketId: peer.socketId, user: peer.user, self: false })),
])

function distribute(shuffle: boolean) {
  const others = people.value.filter((person) => !person.self)
  const order = shuffle ? [...others].sort(() => Math.random() - 0.5) : others
  const next: Record<string, string> = {}
  for (const person of people.value) next[person.socketId] = MAIN
  order.forEach((person, index) => (next[person.socketId] = String(index % count.value)))
  plan.value = next
}

watch(open, (value) => {
  if (!value || call.breakouts.value) return
  count.value = Math.min(Math.max(2, Math.ceil(call.peers.value.length / 2)), 6)
  names.value = Array.from({ length: 6 }, (_, index) => `Room ${index + 1}`)
  distribute(false)
})
watch(count, () => !call.breakouts.value && distribute(false))

const roomOptions = computed<SelectFieldOption[]>(() => [
  { value: MAIN, label: 'Main room' },
  ...Array.from({ length: count.value }, (_, index) => ({ value: String(index), label: names.value[index] || `Room ${index + 1}` })),
])
const COUNTS: SelectFieldOption[] = [2, 3, 4, 5, 6].map((value) => ({ value: String(value), label: `${value} rooms` }))

async function run(action: () => Promise<unknown>, done?: string) {
  isBusy.value = true
  try {
    await action()
    if (done) toast.success(done)
  } catch (error) {
    toast.error(error instanceof Error ? error.message : 'That did not work')
  } finally {
    isBusy.value = false
  }
}

function openRooms() {
  const rooms = Array.from({ length: count.value }, (_, index) => ({
    name: names.value[index]?.trim() || `Room ${index + 1}`,
    socketIds: Object.entries(plan.value)
      .filter(([, room]) => room === String(index))
      .map(([socketId]) => socketId),
  }))
  void run(() => call.openBreakouts(rooms), 'Breakout rooms are open')
}

/** Rooms that are open now, with the main room first, for moving people. */
const liveOptions = computed<SelectFieldOption[]>(() => [
  { value: MAIN, label: 'Main room' },
  ...(call.breakouts.value?.rooms.map((room) => ({ value: room.id, label: room.name })) ?? []),
])
const livePeople = computed(() => {
  const state = call.breakouts.value
  if (!state) return []
  return [
    ...state.main.map((person) => ({ ...person, room: MAIN })),
    ...state.rooms.flatMap((room) => room.people.map((person) => ({ ...person, room: room.id }))),
  ]
})
const move = (socketId: string, room: string | null) => run(() => call.moveToRoom(socketId, room === MAIN || !room ? null : room))

function broadcast() {
  const body = message.value.trim()
  if (!body) return
  void run(async () => {
    await call.broadcastToRooms(body)
    message.value = ''
  }, 'Sent to every room')
}

function closeRooms() {
  void run(() => call.closeBreakouts(), 'Everyone is back in the main room').then(() => (open.value = false))
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-xl">
      <DialogHeader>
        <DialogTitle>Breakout rooms</DialogTitle>
        <DialogDescription>
          {{ call.breakouts.value ? 'Rooms are open. Move people, visit a room, or bring everyone back.' : 'Split the call into small groups. Only people in the same room see and hear each other.' }}
        </DialogDescription>
      </DialogHeader>

      <template v-if="!call.breakouts.value">
        <div class="grid gap-3 sm:grid-cols-[10rem_1fr]">
          <SelectField :model-value="String(count)" :options="COUNTS" aria-label="Number of rooms" @update:model-value="(value) => (count = Number(value ?? 2))" />
          <div class="grid grid-cols-2 gap-2">
            <Input v-for="index in count" :key="index" v-model="names[index - 1]" :aria-label="`Name of room ${index}`" maxlength="40" class="h-9" />
          </div>
        </div>
        <div class="flex items-center justify-between">
          <p class="text-sm font-medium">Who goes where</p>
          <Button variant="ghost" size="sm" @click="distribute(true)"><Shuffle /> Shuffle</Button>
        </div>
        <ul class="max-h-72 space-y-1.5 overflow-y-auto">
          <li v-for="person in people" :key="person.socketId" class="flex items-center gap-2.5">
            <UserAvatar :user="person.user" size="md" />
            <span class="min-w-0 flex-1 truncate text-sm">{{ person.self ? 'You' : person.user?.name }}</span>
            <SelectField
              class="w-40"
              :model-value="plan[person.socketId] ?? MAIN"
              :options="roomOptions"
              :aria-label="`Room for ${person.user?.name}`"
              @update:model-value="(value) => (plan[person.socketId] = value ?? MAIN)"
            />
          </li>
        </ul>
        <DialogFooter>
          <Button variant="ghost" @click="open = false">Cancel</Button>
          <Button variant="brand" :loading="isBusy" :disabled="people.length < 2" @click="openRooms"><DoorOpen /> Open rooms</Button>
        </DialogFooter>
      </template>

      <template v-else>
        <ul class="max-h-72 space-y-1.5 overflow-y-auto">
          <li v-for="person in livePeople" :key="person.socketId" class="flex items-center gap-2.5">
            <UserAvatar :user="person.user" size="md" />
            <span class="min-w-0 flex-1 truncate text-sm">{{ person.socketId === call.selfId.value ? 'You' : person.user.name }}</span>
            <SelectField class="w-40" :model-value="person.room" :options="liveOptions" :aria-label="`Room for ${person.user.name}`" @update:model-value="(value) => move(person.socketId, value ?? null)" />
          </li>
        </ul>
        <form class="flex items-center gap-2" @submit.prevent="broadcast">
          <Input v-model="message" placeholder="Message every room (e.g. 2 minutes left)" maxlength="500" />
          <Button type="submit" variant="outline" :disabled="!message.trim() || isBusy"><Megaphone /> Send</Button>
        </form>
        <DialogFooter>
          <Button variant="ghost" @click="open = false">Done</Button>
          <Button variant="brand" :loading="isBusy" @click="closeRooms"><Undo2 /> Bring everyone back</Button>
        </DialogFooter>
      </template>
    </DialogContent>
  </Dialog>
</template>

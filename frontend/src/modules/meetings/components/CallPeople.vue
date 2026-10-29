<script setup lang="ts">
import { Check, DoorOpen, Hand, MicOff, X } from 'lucide-vue-next'
import { computed } from 'vue'
import { toast } from 'vue-sonner'
import UserAvatar from '@/components/common/UserAvatar.vue'
import { Button } from '@/components/ui/button'
import { useCallTiles } from '../call/tiles'
import { useMeetingCall } from '../useMeetingCall'

/** Who is in the call (in this room), raised hands in order, guests waiting to come in, and the breakout rooms. */
const emit = defineEmits<{ breakouts: [] }>()
const call = useMeetingCall()
const { tiles, raisedHands } = useCallTiles()

const canAdmit = computed(() => !call.isGuest.value)
const admitAll = () => call.lobby.value.forEach((guest) => call.admit(guest.socketId, true))
const joinRoom = (roomId: string) => call.moveToRoom(null, roomId).catch((error: Error) => toast.error(error.message))
</script>

<template>
  <div class="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
    <slot />

    <section v-if="canAdmit && call.lobby.value.length" class="space-y-2 border border-amber-500/40 bg-amber-500/5 p-3">
      <div class="flex items-center gap-2">
        <DoorOpen class="size-4 text-amber-600" />
        <p class="flex-1 text-sm font-semibold">Waiting to join · {{ call.lobby.value.length }}</p>
        <Button v-if="call.lobby.value.length > 1" variant="ghost" size="sm" class="h-7" @click="admitAll">Let all in</Button>
      </div>
      <ul class="space-y-1.5">
        <li v-for="guest in call.lobby.value" :key="guest.socketId" class="flex items-center gap-2">
          <UserAvatar :user="guest.user" size="md" />
          <span class="min-w-0 flex-1 truncate text-sm">{{ guest.user.name }} <span class="text-xs text-muted-foreground">· guest</span></span>
          <Button variant="ghost" size="icon-sm" aria-label="Turn away" title="Turn away" @click="call.admit(guest.socketId, false)"><X /></Button>
          <Button variant="brand" size="sm" class="h-7" @click="call.admit(guest.socketId, true)"><Check /> Let in</Button>
        </li>
      </ul>
    </section>

    <section v-if="raisedHands.length" class="space-y-1.5">
      <h3 class="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Raised hands</h3>
      <ol class="space-y-1">
        <li v-for="(tile, index) in raisedHands" :key="tile.id" class="flex items-center gap-2 text-sm">
          <span class="w-4 text-xs text-muted-foreground tabular-nums">{{ index + 1 }}</span>
          <Hand class="size-4 text-amber-500" />
          <span class="min-w-0 flex-1 truncate">{{ tile.self ? 'You' : tile.user?.name }}</span>
          <Button v-if="tile.self" variant="ghost" size="sm" class="h-7" @click="call.toggleHand()">Lower</Button>
          <Button v-else-if="call.canManage.value" variant="ghost" size="sm" class="h-7" @click="call.lowerHand(tile.id)">Lower</Button>
        </li>
      </ol>
    </section>

    <section class="space-y-1.5">
      <h3 class="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
        {{ call.roomName.value ? `In ${call.roomName.value}` : 'In the call' }} · {{ tiles.length }}
      </h3>
      <ul class="space-y-1">
        <li v-for="tile in tiles" :key="tile.id" class="flex items-center gap-2.5 py-1">
          <span class="relative">
            <UserAvatar :user="tile.user" size="md" />
            <span v-if="tile.speaking && tile.audio" class="absolute -right-0.5 -bottom-0.5 size-3 rounded-full bg-emerald-500 ring-2 ring-card" />
          </span>
          <span class="min-w-0 flex-1 truncate text-sm">
            {{ tile.self ? 'You' : tile.user?.name }}<span v-if="tile.guest" class="text-xs text-muted-foreground"> · guest</span>
          </span>
          <Hand v-if="tile.hand" class="size-4 text-amber-500" />
          <MicOff v-if="!tile.audio" class="size-4 text-muted-foreground" />
        </li>
      </ul>
    </section>

    <section v-if="call.breakouts.value" class="space-y-2">
      <div class="flex items-center gap-2">
        <h3 class="flex-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase">Breakout rooms</h3>
        <Button v-if="call.canManage.value" variant="ghost" size="sm" class="h-7" @click="emit('breakouts')">Manage</Button>
      </div>
      <div v-for="room in call.breakouts.value.rooms" :key="room.id" class="border border-border/70 p-2">
        <div class="flex items-center gap-2">
          <p class="flex-1 truncate text-sm font-medium">{{ room.name }}</p>
          <span class="text-xs text-muted-foreground">{{ room.people.length }}</span>
          <Button v-if="call.room.value !== room.id" variant="ghost" size="sm" class="h-7" @click="joinRoom(room.id)">Join</Button>
        </div>
        <p class="truncate text-xs text-muted-foreground">{{ room.people.map((person) => person.user.name).join(', ') || 'Nobody yet' }}</p>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { Smile, Sticker } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import StickerBubble from '@/components/common/StickerBubble.vue'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { EMOJI_CATEGORIES, STICKERS, encodeSticker } from '@/lib/emoji-stickers'
import { cn } from '@/lib/utils'

const props = withDefaults(
  defineProps<{
    /** Extra classes on the trigger cluster. */
    triggerClass?: string
    side?: 'top' | 'bottom' | 'left' | 'right'
    align?: 'start' | 'center' | 'end'
    disabled?: boolean
    /** Reaction bars: emoji reacts; stickers still send a sticker message. */
    context?: 'compose' | 'react'
  }>(),
  { triggerClass: '', side: 'top', align: 'start', disabled: false, context: 'compose' },
)

const emit = defineEmits<{
  /** Insert unicode emoji into the composer text. */
  emoji: [value: string]
  /** Send a sticker message body (`[[sticker:id]]`). */
  sticker: [token: string]
}>()

const open = ref(false)
const tab = ref<'emoji' | 'stickers'>('emoji')

function openTab(next: 'emoji' | 'stickers') {
  tab.value = next
  open.value = true
}

function pickEmoji(value: string) {
  emit('emoji', value)
  open.value = false
}

function pickSticker(id: string) {
  emit('sticker', encodeSticker(id))
  open.value = false
}

const btn = computed(() =>
  props.context === 'react'
    ? 'flex size-8 items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50'
    : 'flex size-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50',
)
</script>

<template>
  <Popover v-model:open="open">
    <PopoverAnchor as-child>
      <div class="flex items-center" :class="[context === 'react' ? 'gap-0' : 'gap-0.5', triggerClass]">
        <button
          type="button"
          :class="cn(btn, open && tab === 'emoji' && 'bg-accent text-foreground')"
          aria-label="Emoji"
          :title="context === 'react' ? 'React with emoji' : 'Insert emoji into your message'"
          :aria-expanded="open && tab === 'emoji'"
          :disabled="disabled"
          @click="openTab('emoji')"
        >
          <Smile class="size-4" />
        </button>
        <button
          type="button"
          :class="cn(btn, open && tab === 'stickers' && 'bg-accent text-foreground')"
          aria-label="Stickers"
          title="Send a sticker"
          :aria-expanded="open && tab === 'stickers'"
          :disabled="disabled"
          @click="openTab('stickers')"
        >
          <Sticker class="size-4" />
        </button>
      </div>
    </PopoverAnchor>

    <PopoverContent :side="side" :align="align" class="w-[19.5rem] p-0 sm:w-[22rem]">
      <div class="flex border-b border-border">
        <button
          type="button"
          class="flex flex-1 items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-medium transition-colors"
          :class="tab === 'emoji' ? 'border-b-2 border-primary text-foreground' : 'text-muted-foreground hover:text-foreground'"
          :aria-pressed="tab === 'emoji'"
          @click="tab = 'emoji'"
        >
          <Smile class="size-3.5" />
          Emoji
          <span class="text-[10px] font-normal text-muted-foreground">{{ context === 'react' ? 'react' : 'insert' }}</span>
        </button>
        <button
          type="button"
          class="flex flex-1 items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-medium transition-colors"
          :class="tab === 'stickers' ? 'border-b-2 border-primary text-foreground' : 'text-muted-foreground hover:text-foreground'"
          :aria-pressed="tab === 'stickers'"
          @click="tab = 'stickers'"
        >
          <Sticker class="size-3.5" />
          Stickers
          <span class="text-[10px] font-normal text-muted-foreground">send</span>
        </button>
      </div>

      <div v-if="tab === 'emoji'" class="max-h-64 overflow-y-auto p-2">
        <p class="mb-2 px-1 text-[11px] text-muted-foreground">
          {{ context === 'react' ? 'Adds a reaction on this message.' : 'Adds the character into your message text.' }}
        </p>
        <section v-for="category in EMOJI_CATEGORIES" :key="category.id" class="mb-2 last:mb-0">
          <p class="px-1 pb-1 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">{{ category.label }}</p>
          <div class="grid grid-cols-8 gap-0.5">
            <button
              v-for="emoji in category.emojis"
              :key="`${category.id}-${emoji}`"
              type="button"
              class="flex size-8 items-center justify-center rounded-md text-lg transition-transform hover:scale-110 hover:bg-accent sm:size-9 sm:text-xl"
              :aria-label="`Insert ${emoji}`"
              @click="pickEmoji(emoji)"
            >
              {{ emoji }}
            </button>
          </div>
        </section>
      </div>

      <div v-else class="max-h-72 overflow-y-auto bg-muted/30 p-2.5">
        <p class="mb-2.5 px-0.5 text-[11px] text-muted-foreground">Animated sticker cards — tap to send with motion.</p>
        <div class="grid grid-cols-4 gap-2">
          <button
            v-for="item in STICKERS"
            :key="item.id"
            type="button"
            class="rounded-2xl transition-transform hover:scale-[1.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            :aria-label="`Send ${item.label} sticker`"
            :title="item.label"
            @click="pickSticker(item.id)"
          >
            <StickerBubble :sticker="item" size="sm" :enter="false" class="pointer-events-none mx-auto" />
          </button>
        </div>
      </div>
    </PopoverContent>
  </Popover>
</template>

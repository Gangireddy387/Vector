<script setup lang="ts">
import { CircleHelp } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useUiStore } from '@/stores/ui.store'

const props = withDefaults(
  defineProps<{
    topicId: string
    label?: string
    /** Icon-only control for tight headers. */
    iconOnly?: boolean
  }>(),
  { label: 'How to use', iconOnly: false },
)

const ui = useUiStore()
</script>

<template>
  <Tooltip v-if="iconOnly">
    <TooltipTrigger as-child>
      <Button variant="outline" size="icon-sm" :aria-label="label" @click="ui.openHelp(topicId)">
        <CircleHelp />
      </Button>
    </TooltipTrigger>
    <TooltipContent>{{ label }}</TooltipContent>
  </Tooltip>
  <Button v-else variant="outline" size="sm" @click="ui.openHelp(props.topicId)">
    <CircleHelp />
    {{ label }}
  </Button>
</template>

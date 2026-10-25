<script setup lang="ts">
import { CircleAlert, CircleCheck, Info, Lightbulb } from 'lucide-vue-next'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { ReportInsight } from '../reports.api'

defineProps<{ insights: ReportInsight[] }>()

const TONE = {
  positive: { icon: CircleCheck, class: 'text-success', bar: 'border-success' },
  warning: { icon: CircleAlert, class: 'text-destructive', bar: 'border-destructive' },
  neutral: { icon: Info, class: 'text-info', bar: 'border-info' },
}
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle class="flex items-center gap-2"><Lightbulb class="size-4 text-primary" /> What this means</CardTitle>
      <CardDescription>Plain-language highlights from the numbers.</CardDescription>
    </CardHeader>
    <CardContent>
      <ul class="space-y-2">
        <li v-for="(insight, index) in insights" :key="index" class="flex gap-2.5 border-l-2 bg-muted/40 px-3 py-2 text-sm" :class="TONE[insight.tone].bar">
          <component :is="TONE[insight.tone].icon" class="mt-0.5 size-4 shrink-0" :class="TONE[insight.tone].class" />
          <span class="leading-snug">{{ insight.text }}</span>
        </li>
      </ul>
    </CardContent>
  </Card>
</template>

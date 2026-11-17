<script setup lang="ts">
import { Mail, Sparkles } from 'lucide-vue-next'
import { onMounted, ref } from 'vue'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuthStore } from '@/modules/auth/auth.store'
import { aiApi } from '@/modules/issues/api/ai.api'

const auth = useAuthStore()
const aiStatus = ref<{ enabled: boolean; provider: 'openai' | 'heuristic' } | null>(null)
const loaded = ref(false)

onMounted(async () => {
  if (auth.hasFeature('aiAssistant')) {
    try {
      aiStatus.value = await aiApi.status()
    } catch {
      aiStatus.value = null
    }
  }
  loaded.value = true
})
</script>

<template>
  <Card class="gap-3">
    <CardHeader class="border-b border-border/60 pb-3">
      <CardTitle class="flex items-center gap-2"><Sparkles class="size-4" /> Server capabilities</CardTitle>
      <CardDescription>
        How AI and email behave on this deployment. Missing keys fall back gracefully — Vector still works.
      </CardDescription>
    </CardHeader>
    <CardContent class="space-y-2.5">
      <Skeleton v-if="!loaded" class="h-12 w-full rounded-xl" />
      <template v-else>
        <div class="flex flex-wrap items-center gap-3 rounded-xl border border-border/70 bg-muted/15 px-3.5 py-3">
          <Sparkles class="size-4 shrink-0 text-muted-foreground" />
          <div class="min-w-0 flex-1">
            <p class="text-sm font-medium">AI assistant</p>
            <p class="text-xs text-muted-foreground">
              <template v-if="!auth.hasFeature('aiAssistant')">Off on this plan.</template>
              <template v-else-if="aiStatus?.provider === 'openai'">OpenAI connected for drafts and briefings.</template>
              <template v-else-if="aiStatus">Smart fallback summaries (no OpenAI key on the server).</template>
              <template v-else>Status unavailable.</template>
            </p>
          </div>
          <Badge v-if="auth.hasFeature('aiAssistant') && aiStatus?.provider === 'openai'" variant="success">OpenAI</Badge>
          <Badge v-else-if="auth.hasFeature('aiAssistant')" variant="outline">Fallback</Badge>
          <Badge v-else variant="outline">Plan</Badge>
        </div>
        <div class="flex flex-wrap items-center gap-3 rounded-xl border border-border/70 bg-muted/15 px-3.5 py-3">
          <Mail class="size-4 shrink-0 text-muted-foreground" />
          <div class="min-w-0 flex-1">
            <p class="text-sm font-medium">Transactional email</p>
            <p class="text-xs text-muted-foreground">
              Digests, automation emails and invites need a mail provider (e.g. SendGrid) on the server. Password reset still works when mail is configured.
            </p>
          </div>
          <Badge variant="outline">Server env</Badge>
        </div>
      </template>
    </CardContent>
  </Card>
</template>

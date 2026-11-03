<script setup lang="ts">
import { EllipsisVertical, Eraser, ShieldCheck } from 'lucide-vue-next'
import { useTemplateRef } from 'vue'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useAuthStore } from '@/modules/auth/auth.store'
import SupportChatThread from '@/modules/support/components/SupportChatThread.vue'
import { organizationSupportApi } from '@/modules/support/support.api'

/** The organization admins' conversation with the Vector team (the portal's super admin). */
const auth = useAuthStore()
const chat = useTemplateRef<InstanceType<typeof SupportChatThread>>('chat')
</script>

<template>
  <Card v-if="auth.organization" class="flex h-[min(42rem,calc(100dvh-12rem))] flex-col gap-0 overflow-hidden py-0">
    <CardHeader class="shrink-0 border-b border-border/70 py-4">
      <CardTitle class="flex items-center gap-2"><ShieldCheck class="size-4 text-primary" /> Vector support</CardTitle>
      <CardDescription>
        Talk with the Vector team about your plan, approval or anything you need. Every admin of {{ auth.organization.name }} sees this conversation.
      </CardDescription>
      <CardAction>
        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <Button variant="ghost" size="icon-sm" aria-label="Chat options"><EllipsisVertical /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" class="w-44">
            <DropdownMenuItem variant="destructive" @select="chat?.clearChat()"><Eraser /> Clear chat</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardAction>
    </CardHeader>
    <SupportChatThread
      ref="chat"
      class="min-h-0 flex-1"
      side="organization"
      :organization-id="auth.organization.id"
      :api="organizationSupportApi"
      placeholder="Type a message"
      notice="Messages here are only between your organization’s admins and the Vector team. Ask about your plan, limits or anything else."
    />
  </Card>
</template>

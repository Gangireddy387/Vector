<script setup lang="ts">
import { useClipboard } from '@vueuse/core'
import { ArrowRight, Check, CircleCheck, ClipboardList, Copy, ListTodo, LoaderCircle, MailCheck, MessageCircle, Video } from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button } from '@/components/ui/button'
import { getErrorMessage } from '@/lib/http'
import { useAuthStore } from '../auth.store'
import AuthHeading from '../components/AuthHeading.vue'

/**
 * Where "Accept invitation" in the email lands: the account is set up at once with a temporary password, shown here
 * and emailed. Inside the app the person is asked to choose their own password before they Start my day on Home.
 */
const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const { copy, copied } = useClipboard({ legacy: true })

const token = computed(() => (typeof route.query.token === 'string' ? route.query.token : ''))
const temporaryPassword = ref<string | null>(null)
const errorMessage = ref('')
const isAccepting = ref(true)

const LOOP = [
  { icon: ClipboardList, label: 'Standup' },
  { icon: ListTodo, label: 'Tasks' },
  { icon: Video, label: 'Meetings' },
  { icon: MessageCircle, label: 'Messages' },
]

onMounted(async () => {
  if (!token.value) {
    isAccepting.value = false
    return
  }
  try {
    temporaryPassword.value = await auth.acceptInviteQuick(token.value)
  } catch (error) {
    errorMessage.value = getErrorMessage(error)
  } finally {
    isAccepting.value = false
  }
})

/** Invitees land on Home with Start my day highlighted — not a blank project list. */
const continueToApp = () => void router.replace({ name: 'home', query: { startDay: '1' } })
</script>

<template>
  <div v-if="isAccepting" class="flex flex-col items-center gap-3 py-10 text-center">
    <LoaderCircle class="size-8 animate-spin text-primary" />
    <p class="font-medium">Setting up your account…</p>
  </div>

  <template v-else-if="temporaryPassword">
    <AuthHeading
      :title="auth.organization ? `Welcome to ${auth.organization.name}` : 'Welcome to Vector'"
      description="Your account is ready. You’re signed in — next you’ll Start my day."
    />
    <div class="space-y-4">
      <div class="space-y-2 rounded-xl border border-border/70 bg-card p-4 shadow-soft">
        <p class="flex items-center gap-2 text-sm font-medium"><CircleCheck class="size-4 text-success" /> Your temporary password</p>
        <div class="flex items-center gap-2">
          <code class="min-w-0 flex-1 truncate rounded-lg bg-muted px-3 py-2 font-mono text-lg font-semibold tracking-wider">{{ temporaryPassword }}</code>
          <Button variant="outline" size="icon" :aria-label="copied ? 'Copied' : 'Copy password'" @click="copy(temporaryPassword)">
            <Check v-if="copied" class="text-success" />
            <Copy v-else />
          </Button>
        </div>
        <p class="text-xs text-muted-foreground">Sign in as <strong class="text-foreground">{{ auth.user?.email }}</strong> with this password until you choose your own.</p>
        <p class="flex items-center gap-1.5 text-xs text-muted-foreground"><MailCheck class="size-3.5" /> We also emailed it to you.</p>
      </div>

      <div class="rounded-xl border border-primary/20 bg-primary/[0.04] p-4">
        <p class="text-sm font-semibold">Your first workday loop</p>
        <p class="mt-0.5 text-xs text-muted-foreground">On Home, hit Start my day — Vector’s daily rhythm.</p>
        <ol class="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <li v-for="(step, index) in LOOP" :key="step.label" class="rounded-lg border border-border/70 bg-card px-2.5 py-2 text-center">
            <span class="mx-auto flex size-7 items-center justify-center rounded-md bg-primary/10 text-primary">
              <component :is="step.icon" class="size-3.5" />
            </span>
            <p class="mt-1.5 text-[11px] font-medium tabular-nums text-muted-foreground">{{ index + 1 }}</p>
            <p class="text-[12px] font-semibold">{{ step.label }}</p>
          </li>
        </ol>
      </div>

      <p class="text-sm text-muted-foreground">You’ll choose your own password next, then land on Start my day.</p>
      <Button variant="brand" class="w-full" size="lg" @click="continueToApp">Continue to Start my day <ArrowRight /></Button>
    </div>
  </template>

  <template v-else>
    <AuthHeading title="This invitation does not work" description="It may be incomplete, or it was already used." />
    <p class="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
      {{ errorMessage || 'This invitation link is incomplete. Open it again from the email.' }}
    </p>
    <Button variant="outline" class="mt-4 w-full" @click="router.replace({ name: 'login' })">Go to sign in</Button>
  </template>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import { EMBED_ORG_KEY, EMBED_PK_KEY, EMBED_TOKEN_KEY, getErrorMessage, markEmbedSession } from '@/lib/http'
import { useAuthStore } from '@/modules/auth/auth.store'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const error = ref<string | null>(null)
const ended = ref(false)

onMounted(async () => {
  if (route.query.ended === '1') {
    ended.value = true
    markEmbedSession()
    try {
      // Keep embed flag so a later login in this iframe still uses sessionStorage, not the normal tab’s localStorage.
      sessionStorage.removeItem(EMBED_PK_KEY)
      sessionStorage.removeItem(EMBED_TOKEN_KEY)
      sessionStorage.removeItem(EMBED_ORG_KEY)
    } catch {
      /* ignore */
    }
    return
  }

  const token = typeof route.query.token === 'string' ? route.query.token : ''
  const next = typeof route.query.next === 'string' && route.query.next.startsWith('/') ? route.query.next : '/'
  if (!token) {
    error.value = 'This embed link is missing a session token. Ask your app to open Vector again.'
    return
  }
  try {
    // Mark embed BEFORE accepting the token so storage writes go to sessionStorage only.
    markEmbedSession()
    if (typeof route.query.pk === 'string' && route.query.pk) {
      sessionStorage.setItem(EMBED_PK_KEY, route.query.pk)
    }
    await auth.acceptOAuthToken(token)
    await router.replace(next)
  } catch (err) {
    error.value = getErrorMessage(err, 'Could not open the embedded workspace.')
    toast.error(error.value)
  }
})
</script>

<template>
  <div class="flex min-h-dvh flex-col items-center justify-center gap-3 bg-background px-6 text-center">
    <template v-if="ended">
      <p class="text-base font-semibold text-foreground">Connection ended</p>
      <p class="max-w-md text-sm text-muted-foreground">
        This embed session is closed. Sign in again from HRMS with Vector email and password — your normal Vector tab
        login is unchanged.
      </p>
    </template>
    <template v-else-if="error">
      <p class="text-base font-semibold text-foreground">Could not open Vector</p>
      <p class="max-w-md text-sm text-muted-foreground">{{ error }}</p>
    </template>
    <template v-else>
      <div class="size-8 animate-pulse rounded-lg bg-primary/20" aria-hidden="true" />
      <p class="text-sm text-muted-foreground">Opening your workspace…</p>
    </template>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import { getErrorMessage } from '@/lib/http'
import { useAuthStore } from '@/modules/auth/auth.store'

const EMBED_FLAG = 'vector.embed'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const error = ref<string | null>(null)

onMounted(async () => {
  const token = typeof route.query.token === 'string' ? route.query.token : ''
  const next = typeof route.query.next === 'string' && route.query.next.startsWith('/') ? route.query.next : '/'
  if (!token) {
    error.value = 'This embed link is missing a session token. Ask your app to open Vector again.'
    return
  }
  try {
    sessionStorage.setItem(EMBED_FLAG, '1')
    if (typeof route.query.pk === 'string' && route.query.pk) {
      sessionStorage.setItem('vector.embed.pk', route.query.pk)
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
    <template v-if="error">
      <p class="text-base font-semibold text-foreground">Could not open Vector</p>
      <p class="max-w-md text-sm text-muted-foreground">{{ error }}</p>
    </template>
    <template v-else>
      <div class="size-8 animate-pulse rounded-lg bg-primary/20" aria-hidden="true" />
      <p class="text-sm text-muted-foreground">Opening your workspace…</p>
    </template>
  </div>
</template>

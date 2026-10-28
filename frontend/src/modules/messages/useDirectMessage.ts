import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import { getErrorMessage } from '@/lib/http'
import { useAuthStore } from '@/modules/auth/auth.store'
import { messagesApi } from './messages.api'
import { useMessagesStore } from './messages.store'

/** "Message" buttons next to people: opens (or starts) the private chat with them on the Messages page. */
export function useDirectMessage() {
  const auth = useAuthStore()
  const router = useRouter()
  const store = useMessagesStore()
  const openingId = ref<string | null>(null)

  const canMessage = (userId: string | null | undefined) => auth.hasFeature('directMessages') && Boolean(userId) && userId !== auth.user?.id
  const isAvailable = computed(() => auth.hasFeature('directMessages'))

  async function messagePerson(userId: string) {
    openingId.value = userId
    try {
      const conversation = await messagesApi.openDirect(userId)
      store.upsert(conversation)
      await router.push({ name: 'messages', params: { conversationId: conversation.id } })
    } catch (error) {
      toast.error(getErrorMessage(error))
    } finally {
      openingId.value = null
    }
  }

  return { isAvailable, canMessage, messagePerson, openingId }
}

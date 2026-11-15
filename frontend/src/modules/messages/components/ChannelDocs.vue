<script setup lang="ts">
import { format, parseISO } from 'date-fns'
import { ArrowLeft, FileText, Plus, Trash2 } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import MarkdownContent from '@/components/common/MarkdownContent.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { useConfirm } from '@/composables/useConfirm'
import { useDevice } from '@/composables/useDevice'
import { getErrorMessage } from '@/lib/http'
import { useSocketEvents } from '@/lib/socket-events'
import { useAuthStore } from '@/modules/auth/auth.store'
import { type ConversationDoc, messagesApi } from '../messages.api'

const props = defineProps<{ conversationId: string }>()
const auth = useAuthStore()
const confirm = useConfirm()
const { isDesktop } = useDevice()

const docs = ref<ConversationDoc[] | null>(null)
const selectedId = ref<string | null>(null)
const title = ref('')
const body = ref('')
const saving = ref(false)
const dirty = ref(false)
const showPreview = ref(false)

const selected = computed(() => docs.value?.find((doc) => doc.id === selectedId.value) ?? null)
const showList = computed(() => isDesktop.value || !selectedId.value)
const showEditor = computed(() => isDesktop.value || Boolean(selectedId.value))

async function load() {
  try {
    docs.value = await messagesApi.docs(props.conversationId)
    if (selectedId.value && !docs.value.some((doc) => doc.id === selectedId.value)) selectedId.value = null
  } catch (error) {
    docs.value = []
    toast.error(getErrorMessage(error))
  }
}

watch(
  () => props.conversationId,
  () => {
    selectedId.value = null
    title.value = ''
    body.value = ''
    dirty.value = false
    showPreview.value = false
    void load()
  },
  { immediate: true },
)

useSocketEvents({
  'conversation:doc': (event: { conversationId: string; doc?: ConversationDoc; docId?: string; action: 'upsert' | 'remove' }) => {
    if (event.conversationId !== props.conversationId || !docs.value) return
    if (event.action === 'remove' && event.docId) {
      docs.value = docs.value.filter((doc) => doc.id !== event.docId)
      if (selectedId.value === event.docId) {
        selectedId.value = null
        dirty.value = false
      }
      return
    }
    if (event.doc) {
      const rest = docs.value.filter((doc) => doc.id !== event.doc!.id)
      docs.value = [event.doc, ...rest].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      if (selectedId.value === event.doc.id && !dirty.value) {
        title.value = event.doc.title
        body.value = event.doc.body
      }
    }
  },
})

function openDoc(doc: ConversationDoc) {
  selectedId.value = doc.id
  title.value = doc.title
  body.value = doc.body
  dirty.value = false
  showPreview.value = false
}

function closeEditor() {
  selectedId.value = null
  dirty.value = false
  showPreview.value = false
}

async function createDoc() {
  try {
    const doc = await messagesApi.createDoc(props.conversationId, { title: 'Untitled note', body: '' })
    docs.value = [doc, ...(docs.value ?? []).filter((item) => item.id !== doc.id)]
    openDoc(doc)
  } catch (error) {
    toast.error(getErrorMessage(error))
  }
}

async function save() {
  if (!selected.value || !dirty.value) return
  saving.value = true
  try {
    const doc = await messagesApi.updateDoc(props.conversationId, selected.value.id, { title: title.value.trim() || 'Untitled note', body: body.value })
    docs.value = [doc, ...(docs.value ?? []).filter((item) => item.id !== doc.id)].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    dirty.value = false
    toast.success('Doc saved')
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    saving.value = false
  }
}

async function removeDoc(doc: ConversationDoc) {
  const ok = await confirm({
    title: 'Delete this doc?',
    description: `“${doc.title}” is removed for everyone in this channel.`,
    confirmLabel: 'Delete',
    destructive: true,
  })
  if (!ok) return
  try {
    await messagesApi.removeDoc(props.conversationId, doc.id)
    docs.value = (docs.value ?? []).filter((item) => item.id !== doc.id)
    if (selectedId.value === doc.id) closeEditor()
  } catch (error) {
    toast.error(getErrorMessage(error))
  }
}

const canDelete = (doc: ConversationDoc) => doc.createdById === auth.user?.id || auth.user?.workspaceRole === 'admin'
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col md:flex-row">
    <aside v-if="showList" class="flex min-h-0 w-full shrink-0 flex-col border-border bg-background md:w-64 md:border-r" :class="showEditor && isDesktop ? '' : 'flex-1'">
      <div class="flex items-center gap-2 border-b border-border px-3 py-2.5">
        <p class="min-w-0 flex-1 text-[13px] font-semibold">Docs</p>
        <Button size="sm" variant="secondary" @click="createDoc"><Plus class="size-3.5" /> New</Button>
      </div>
      <div class="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        <template v-if="docs === null">
          <Skeleton v-for="index in 4" :key="index" class="m-2 h-12" />
        </template>
        <p v-else-if="!docs.length" class="px-4 py-10 text-center text-xs text-muted-foreground">Shared notes for this channel. Create one to collaborate.</p>
        <button
          v-for="doc in docs"
          :key="doc.id"
          type="button"
          class="flex w-full items-start gap-2 border-b border-border/50 px-3 py-2.5 text-left transition-colors"
          :class="selectedId === doc.id ? 'bg-accent' : 'hover:bg-accent/50'"
          @click="openDoc(doc)"
        >
          <FileText class="mt-0.5 size-4 shrink-0 text-primary" />
          <span class="min-w-0 flex-1">
            <span class="block truncate text-[13px] font-medium">{{ doc.title }}</span>
            <span class="block text-[11px] text-muted-foreground">{{ format(parseISO(doc.updatedAt), 'd MMM, HH:mm') }}</span>
          </span>
        </button>
      </div>
    </aside>

    <section v-if="showEditor" class="flex min-h-0 min-w-0 flex-1 flex-col bg-sidebar/30">
      <div v-if="!selected" class="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center sm:p-8">
        <span class="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary"><FileText class="size-6" /></span>
        <p class="text-sm font-medium">Channel docs</p>
        <p class="max-w-sm text-xs text-muted-foreground">Loop-style notes shared with everyone here. Pick a doc or create a new one.</p>
        <Button class="mt-2" @click="createDoc"><Plus class="size-4" /> New doc</Button>
      </div>
      <template v-else>
        <div class="flex flex-wrap items-center gap-2 border-b border-border bg-background px-3 py-2 sm:px-4">
          <Button v-if="!isDesktop" variant="ghost" size="icon-sm" aria-label="Back to docs" @click="closeEditor"><ArrowLeft /></Button>
          <Input v-model="title" class="h-9 min-w-0 flex-1 font-semibold sm:max-w-md" aria-label="Doc title" @input="dirty = true" />
          <span class="hidden text-[11px] text-muted-foreground sm:inline">
            {{ selected.updatedBy?.name ?? selected.createdBy?.name ?? 'Someone' }} · {{ format(parseISO(selected.updatedAt), 'd MMM, HH:mm') }}
          </span>
          <div class="ml-auto flex items-center gap-1 sm:ml-0">
            <Button v-if="!isDesktop" size="sm" variant="ghost" @click="showPreview = !showPreview">{{ showPreview ? 'Edit' : 'Preview' }}</Button>
            <Button size="sm" :disabled="!dirty || saving" :loading="saving" @click="save">Save</Button>
            <Button v-if="canDelete(selected)" size="icon-sm" variant="ghost" title="Delete doc" @click="removeDoc(selected)"><Trash2 /></Button>
          </div>
        </div>
        <div class="grid min-h-0 flex-1 gap-0 lg:grid-cols-2">
          <textarea
            v-show="isDesktop || !showPreview"
            v-model="body"
            class="min-h-[12rem] w-full flex-1 resize-none border-border bg-background p-3 text-[14px] leading-6 outline-none sm:min-h-0 sm:p-4 lg:border-r"
            placeholder="Write in markdown…"
            aria-label="Doc body"
            @input="dirty = true"
          />
          <div v-show="isDesktop || showPreview" class="min-h-0 overflow-y-auto p-3 scrollbar-thin sm:p-4">
            <p class="mb-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Preview</p>
            <MarkdownContent v-if="body.trim()" :source="body" class="text-[14px]" />
            <p v-else class="text-sm text-muted-foreground italic">Nothing to preview yet.</p>
          </div>
        </div>
      </template>
    </section>
  </div>
</template>

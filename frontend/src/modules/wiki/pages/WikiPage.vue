<script setup lang="ts">
import { format, parseISO } from 'date-fns'
import { ArrowLeft, BookOpen, FileText, Plus, Trash2 } from 'lucide-vue-next'
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import MarkdownContent from '@/components/common/MarkdownContent.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { useConfirm } from '@/composables/useConfirm'
import { useDevice } from '@/composables/useDevice'
import { getErrorMessage } from '@/lib/http'
import { useAuthStore } from '@/modules/auth/auth.store'
import { type WikiPage, wikiApi } from '../wiki.api'

const props = defineProps<{ pageId?: string }>()
const auth = useAuthStore()
const confirm = useConfirm()
const route = useRoute()
const router = useRouter()
const { isWide } = useDevice()

const pages = ref<WikiPage[] | null>(null)
const selectedId = ref<string | null>(null)
const title = ref('')
const body = ref('')
const saving = ref(false)
const dirty = ref(false)
const showPreview = ref(false)

const selected = computed(() => pages.value?.find((page) => page.id === selectedId.value) ?? null)
const showList = computed(() => isWide.value || !selectedId.value)
const showEditor = computed(() => isWide.value || Boolean(selectedId.value))

async function load() {
  try {
    pages.value = await wikiApi.list()
    const fromRoute = props.pageId || (typeof route.params.pageId === 'string' ? route.params.pageId : null)
    if (fromRoute && pages.value.some((page) => page.id === fromRoute)) openPage(pages.value.find((page) => page.id === fromRoute)!)
    else if (selectedId.value && !pages.value.some((page) => page.id === selectedId.value)) closeEditor()
  } catch (error) {
    pages.value = []
    toast.error(getErrorMessage(error))
  }
}

onMounted(() => {
  void load()
})

watch(
  () => props.pageId,
  (pageId) => {
    if (!pageId || !pages.value) return
    const page = pages.value.find((item) => item.id === pageId)
    if (page) openPage(page)
  },
)

function openPage(page: WikiPage) {
  selectedId.value = page.id
  title.value = page.title
  body.value = page.body
  dirty.value = false
  showPreview.value = false
  if (route.name !== 'wiki-page' || route.params.pageId !== page.id) {
    void router.replace({ name: 'wiki-page', params: { pageId: page.id } })
  }
}

function closeEditor() {
  selectedId.value = null
  dirty.value = false
  showPreview.value = false
  if (route.name === 'wiki-page') void router.replace({ name: 'wiki' })
}

async function createPage() {
  try {
    const page = await wikiApi.create({ title: 'Untitled page', body: '' })
    pages.value = [page, ...(pages.value ?? []).filter((item) => item.id !== page.id)]
    openPage(page)
  } catch (error) {
    toast.error(getErrorMessage(error))
  }
}

async function save() {
  if (!selected.value || !dirty.value) return
  saving.value = true
  try {
    const page = await wikiApi.update(selected.value.id, {
      title: title.value.trim() || 'Untitled page',
      body: body.value,
    })
    pages.value = [page, ...(pages.value ?? []).filter((item) => item.id !== page.id)].sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt),
    )
    dirty.value = false
    toast.success('Page saved')
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    saving.value = false
  }
}

async function removePage(page: WikiPage) {
  const ok = await confirm({
    title: 'Delete this page?',
    description: `“${page.title}” will be removed for everyone in the organization.`,
    confirmLabel: 'Delete',
    destructive: true,
  })
  if (!ok) return
  try {
    await wikiApi.remove(page.id)
    pages.value = (pages.value ?? []).filter((item) => item.id !== page.id)
    if (selectedId.value === page.id) closeEditor()
  } catch (error) {
    toast.error(getErrorMessage(error))
  }
}

const canDelete = (page: WikiPage) => page.createdById === auth.user?.id || auth.isOrganizationAdmin
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col md:flex-row">
    <aside
      v-if="showList"
      class="flex min-h-0 w-full shrink-0 flex-col border-border bg-background md:w-72 md:border-r"
      :class="showEditor && isWide ? '' : 'flex-1'"
    >
      <div class="flex items-center gap-2 border-b border-border px-3 py-2.5">
        <BookOpen class="size-4 text-primary" />
        <p class="min-w-0 flex-1 text-[13px] font-semibold">Wiki</p>
        <Button size="sm" variant="secondary" @click="createPage"><Plus class="size-3.5" /> New</Button>
      </div>
      <div class="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        <template v-if="pages === null">
          <Skeleton v-for="index in 5" :key="index" class="m-2 h-12" />
        </template>
        <p v-else-if="!pages.length" class="px-4 py-10 text-center text-xs text-muted-foreground">
          Shared docs for the whole organization. Create a page for handbooks, runbooks, or meeting notes.
        </p>
        <button
          v-for="page in pages"
          :key="page.id"
          type="button"
          class="flex w-full items-start gap-2 border-b border-border/50 px-3 py-2.5 text-left transition-colors"
          :class="selectedId === page.id ? 'bg-accent' : 'hover:bg-accent/50'"
          @click="openPage(page)"
        >
          <FileText class="mt-0.5 size-4 shrink-0 text-primary" />
          <span class="min-w-0 flex-1">
            <span class="block truncate text-[13px] font-medium">{{ page.title }}</span>
            <span class="block text-[11px] text-muted-foreground">{{ format(parseISO(page.updatedAt), 'd MMM, HH:mm') }}</span>
          </span>
        </button>
      </div>
    </aside>

    <section v-if="showEditor" class="flex min-h-0 min-w-0 flex-1 flex-col bg-sidebar/30">
      <div v-if="!selected" class="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center sm:p-8">
        <span class="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary"><BookOpen class="size-6" /></span>
        <p class="text-sm font-medium">Shared wiki</p>
        <p class="max-w-sm text-xs text-muted-foreground">
          Organization knowledge in markdown. Pick a page or create a new one.
        </p>
        <Button class="mt-2" @click="createPage"><Plus class="size-4" /> New page</Button>
      </div>
      <template v-else>
        <div class="flex flex-wrap items-center gap-2 border-b border-border bg-background px-3 py-2 sm:px-4">
          <Button v-if="!isWide" variant="ghost" size="icon-sm" aria-label="Back to wiki" @click="closeEditor"><ArrowLeft /></Button>
          <Input v-model="title" class="h-9 min-w-0 flex-1 font-semibold sm:max-w-md" aria-label="Page title" @input="dirty = true" />
          <span class="hidden text-[11px] text-muted-foreground sm:inline">
            {{ selected.updatedBy?.name ?? selected.createdBy?.name ?? 'Someone' }} ·
            {{ format(parseISO(selected.updatedAt), 'd MMM, HH:mm') }}
          </span>
          <div class="ml-auto flex items-center gap-1 sm:ml-0">
            <Button v-if="!isWide" size="sm" variant="ghost" @click="showPreview = !showPreview">
              {{ showPreview ? 'Edit' : 'Preview' }}
            </Button>
            <Button size="sm" :disabled="!dirty || saving" :loading="saving" @click="save">Save</Button>
            <Button
              v-if="canDelete(selected)"
              size="icon-sm"
              variant="ghost"
              title="Delete page"
              @click="removePage(selected)"
            >
              <Trash2 />
            </Button>
          </div>
        </div>
        <div class="grid min-h-0 flex-1 gap-0 lg:grid-cols-2">
          <textarea
            v-show="isWide || !showPreview"
            v-model="body"
            class="min-h-[12rem] w-full flex-1 resize-none border-border bg-background p-3 text-[14px] leading-6 outline-none sm:min-h-0 sm:p-4 lg:border-r"
            placeholder="Write in markdown…"
            aria-label="Page body"
            @input="dirty = true"
          />
          <div v-show="isWide || showPreview" class="min-h-0 overflow-y-auto p-3 scrollbar-thin sm:p-4">
            <p class="mb-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Preview</p>
            <MarkdownContent v-if="body.trim()" :source="body" class="text-[14px]" />
            <p v-else class="text-sm text-muted-foreground italic">Nothing to preview yet.</p>
          </div>
        </div>
      </template>
    </section>
  </div>
</template>

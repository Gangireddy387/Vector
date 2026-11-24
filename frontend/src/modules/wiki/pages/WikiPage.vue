<script setup lang="ts">
import { useStorage } from '@vueuse/core'
import { format, parseISO } from 'date-fns'
import { ArrowLeft, BookOpen, FileText, Folder, History, PanelLeft, PanelLeftClose, Pencil, Plus, Search, Sparkles, Trash2 } from 'lucide-vue-next'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { onBeforeRouteLeave, RouterLink, useRoute, useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import PageFrame from '@/components/common/PageFrame.vue'
import RichText from '@/components/common/RichText.vue'
import SplitPane from '@/components/common/SplitPane.vue'
import Toolbar from '@/components/common/Toolbar.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { useConfirm } from '@/composables/useConfirm'
import { useDevice } from '@/composables/useDevice'
import { usePromptText } from '@/composables/usePromptText'
import { assetUrl, getErrorMessage } from '@/lib/http'
import WritingAssistBar from '@/modules/ai/components/WritingAssistBar.vue'
import { aiSourceHint } from '@/modules/issues/api/ai.api'
import { useAuthStore } from '@/modules/auth/auth.store'
import WikiEditorToolbar from '../components/WikiEditorToolbar.vue'
import WikiFillGuide from '../components/WikiFillGuide.vue'
import WikiHistoryDialog from '../components/WikiHistoryDialog.vue'
import WikiNewPageDialog from '../components/WikiNewPageDialog.vue'
import WikiTreeList from '../components/WikiTreeList.vue'
import { buildWikiTree, wikiFolders } from '../wiki-tree'
import {
  type WikiAiKind,
  type WikiLinkedPage,
  type WikiPage,
  type WikiReferencedIssue,
  type WikiTemplate,
  wikiApi,
} from '../wiki.api'

const props = defineProps<{ pageId?: string }>()
const auth = useAuthStore()
const confirm = useConfirm()
const promptText = usePromptText()
const route = useRoute()
const router = useRouter()
const { isWide } = useDevice()

/** Wiki page list open/closed on laptop+; remembered so reading width stays preferred. */
const listOpen = useStorage('vector.wiki.listOpen', true)

const pages = ref<WikiPage[] | null>(null)
const templates = ref<WikiTemplate[]>([])
const selectedId = ref<string | null>(null)
const listCollapsed = computed(() => isWide.value && Boolean(selectedId.value) && !listOpen.value)
const activeFolderId = ref<string | null>(null)
const expandedFolders = ref<Set<string>>(new Set())
const title = ref('')
const body = ref('')
const referencedIssues = ref<WikiReferencedIssue[]>([])
const linkedPages = ref<WikiLinkedPage[]>([])
const backlinks = ref<WikiLinkedPage[]>([])
const saving = ref(false)
const creating = ref(false)
const filling = ref(false)
const dirty = ref(false)
const editing = ref(false)
const showNew = ref(false)
const showHistory = ref(false)
const preferTemplateId = ref<string | null>(null)
const query = ref('')
const saveLabel = ref('')
const assistRef = ref<InstanceType<typeof WritingAssistBar> | null>(null)
const bodyEl = ref<HTMLTextAreaElement | null>(null)
/** Body with `wiki-file:<uuid>` rewritten to short-lived signed URLs for RichText. */
const resolvedBody = ref('')
let searchTimer: ReturnType<typeof setTimeout> | null = null
let autosaveTimer: ReturnType<typeof setTimeout> | null = null
let resolveTimer: ReturnType<typeof setTimeout> | null = null

async function resolveWikiFileRefs(source: string, pageId: string | null) {
  if (!pageId || !source.includes('wiki-file:')) {
    resolvedBody.value = source
    return
  }
  const ids = [...source.matchAll(/wiki-file:([0-9a-f-]{36})/gi)].map((match) => match[1]!)
  const unique = [...new Set(ids)]
  const map = new Map<string, string>()
  await Promise.all(
    unique.map(async (id) => {
      try {
        const link = await wikiApi.fileLink(pageId, id)
        map.set(id, assetUrl(link.url)!)
      } catch {
        /* leave unresolved */
      }
    }),
  )
  resolvedBody.value = source.replace(/wiki-file:([0-9a-f-]{36})/gi, (match, id: string) => map.get(id) ?? match)
}

watch(
  () => [body.value, selectedId.value] as const,
  ([source, pageId]) => {
    if (resolveTimer) clearTimeout(resolveTimer)
    resolveTimer = setTimeout(() => void resolveWikiFileRefs(source, pageId), 200)
  },
  { immediate: true },
)

const canAi = computed(() => auth.hasFeature('aiAssistant'))
const selected = computed(() => pages.value?.find((page) => page.id === selectedId.value) ?? null)
const isEmptyOrg = computed(() => pages.value !== null && !pages.value.length && !query.value.trim())
const looksUnfinished = computed(() => /_[^_\n]{2,80}_|> \*\*Tip:\*\*/.test(body.value))
const issueKeys = computed(() => referencedIssues.value.map((issue) => issue.key))
const searching = computed(() => Boolean(query.value.trim()))
const tree = computed(() => buildWikiTree(pages.value ?? []))
const folderChoices = computed(() => wikiFolders(pages.value ?? []))
const wikiLinkTargets = computed(() => {
  const byId = new Map<string, WikiLinkedPage>()
  for (const page of [...linkedPages.value, ...backlinks.value]) byId.set(page.id, page)
  for (const page of pages.value ?? []) {
    if (page.kind === 'folder') continue
    if (!byId.has(page.id)) byId.set(page.id, { id: page.id, title: page.title, excerpt: page.excerpt })
  }
  return [...byId.values()]
})

function toggleFolder(folderId: string) {
  const next = new Set(expandedFolders.value)
  if (next.has(folderId)) next.delete(folderId)
  else next.add(folderId)
  expandedFolders.value = next
}

function selectFolder(folderId: string | null) {
  activeFolderId.value = folderId
  if (folderId) {
    const next = new Set(expandedFolders.value)
    next.add(folderId)
    expandedFolders.value = next
  }
}

function applyPage(page: WikiPage) {
  title.value = page.title
  body.value = page.body ?? ''
  referencedIssues.value = page.referencedIssues ?? []
  linkedPages.value = page.linkedPages ?? []
  backlinks.value = page.backlinks ?? []
}

async function loadList() {
  try {
    pages.value = await wikiApi.list(query.value)
  } catch (error) {
    pages.value = []
    toast.error(getErrorMessage(error))
  }
}

async function load() {
  try {
    const [pageList, templateList] = await Promise.all([wikiApi.list(query.value), wikiApi.templates().catch(() => [])])
    pages.value = pageList
    templates.value = templateList
    const fromRoute = props.pageId || (typeof route.params.pageId === 'string' ? route.params.pageId : null)
    if (fromRoute) {
      const listed = pages.value.find((page) => page.id === fromRoute)
      if (listed) await openPage(listed, { force: true })
      else {
        try {
          await openPage(await wikiApi.get(fromRoute), { force: true })
        } catch {
          /* missing page */
        }
      }
    } else if (selectedId.value && !pages.value.some((page) => page.id === selectedId.value)) closeEditor()
  } catch (error) {
    pages.value = []
    toast.error(getErrorMessage(error))
  }
}

onMounted(() => {
  void load()
})

onBeforeUnmount(() => {
  if (searchTimer) clearTimeout(searchTimer)
  if (autosaveTimer) clearTimeout(autosaveTimer)
  if (resolveTimer) clearTimeout(resolveTimer)
})

watch(
  () => props.pageId,
  async (pageId) => {
    if (!pageId || !pages.value) return
    if (selectedId.value === pageId) return
    const listed = pages.value.find((item) => item.id === pageId)
    if (listed) {
      void openPage(listed)
      return
    }
    try {
      const full = await wikiApi.get(pageId)
      pages.value = [full, ...pages.value.filter((item) => item.id !== full.id)]
      void openPage(full, { force: true })
    } catch (error) {
      toast.error(getErrorMessage(error))
    }
  },
)

watch(query, () => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    void loadList()
  }, 250)
})

watch([title, body], () => {
  if (!selectedId.value || !dirty.value || !editing.value) return
  if (autosaveTimer) clearTimeout(autosaveTimer)
  autosaveTimer = setTimeout(() => {
    void save({ silent: true })
  }, 1800)
})

async function ensureSavedOrConfirm() {
  if (!dirty.value) return true
  if (autosaveTimer) {
    clearTimeout(autosaveTimer)
    autosaveTimer = null
  }
  const ok = await confirm({
    title: 'Save your changes?',
    description: 'This page still has unsaved edits. Save before leaving so nothing is lost.',
    confirmLabel: 'Save & continue',
    cancelLabel: 'Keep editing',
  })
  if (!ok) return false
  await save({ silent: true })
  return !dirty.value
}

onBeforeRouteLeave(async () => ensureSavedOrConfirm())

async function openPage(page: WikiPage, { force = false } = {}) {
  if (page.kind === 'folder') {
    activeFolderId.value = page.id
    toggleFolder(page.id)
    return
  }
  if (!force && selectedId.value && selectedId.value !== page.id) {
    const ok = await ensureSavedOrConfirm()
    if (!ok) return
  }
  selectedId.value = page.id
  if (page.parentId) selectFolder(page.parentId)
  editing.value = false
  dirty.value = false
  saveLabel.value = ''
  if (page.body == null || page.referencedIssues == null || page.linkedPages == null || page.backlinks == null) {
    try {
      const full = await wikiApi.get(page.id)
      applyPage(full)
      pages.value = [full, ...(pages.value ?? []).filter((item) => item.id !== full.id)]
    } catch (error) {
      toast.error(getErrorMessage(error))
      return
    }
  } else {
    applyPage(page)
  }
  if (route.name !== 'wiki-page' || route.params.pageId !== page.id) {
    void router.replace({ name: 'wiki-page', params: { pageId: page.id } })
  }
}

function closeEditor() {
  selectedId.value = null
  dirty.value = false
  editing.value = false
  if (route.name === 'wiki-page') void router.replace({ name: 'wiki' })
}

function openNewDialog(templateId?: string) {
  preferTemplateId.value = templateId ?? null
  showNew.value = true
}

async function createFromDialog(
  payload: { mode: 'ai'; kind: WikiAiKind; brief: string; title?: string } | { mode: 'template'; templateId: string; title?: string },
) {
  creating.value = true
  try {
    let page: WikiPage
    const parentId = activeFolderId.value
    if (payload.mode === 'ai') {
      const result = await wikiApi.generate({ kind: payload.kind, brief: payload.brief, title: payload.title, parentId })
      page = result.page
      const hint = aiSourceHint(result.source)
      toast.success('Page written', { description: hint ?? 'Review the draft — edit anything that needs a human check.' })
    } else {
      page = await wikiApi.create({ templateId: payload.templateId, title: payload.title, parentId })
      toast.message('Template ready', { description: canAi.value ? 'Use “Finish with AI” to write the placeholders.' : 'Replace italic prompts with your content.' })
    }
    showNew.value = false
    pages.value = [page, ...(pages.value ?? []).filter((item) => item.id !== page.id)]
    await openPage(page, { force: true })
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    creating.value = false
  }
}

async function createFolder() {
  const name = await promptText({
    title: 'New folder',
    description: activeFolderId.value
      ? 'Creates a folder inside the selected folder.'
      : 'Creates a folder at the root of the wiki.',
    label: 'Folder name',
    placeholder: 'e.g. Engineering',
    confirmLabel: 'Create folder',
    maxLength: 150,
  })
  if (!name?.trim()) return
  creating.value = true
  try {
    const folder = await wikiApi.create({
      title: name.trim(),
      kind: 'folder',
      parentId: activeFolderId.value,
    })
    pages.value = [folder, ...(pages.value ?? []).filter((item) => item.id !== folder.id)]
    selectFolder(folder.id)
    toast.success('Folder created')
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    creating.value = false
  }
}

async function moveSelected(parentId: string | null) {
  if (!selected.value || selected.value.kind === 'folder') return
  saving.value = true
  try {
    const updated = await wikiApi.update(selected.value.id, { parentId })
    pages.value = [updated, ...(pages.value ?? []).filter((item) => item.id !== updated.id)]
    activeFolderId.value = parentId
    if (parentId) {
      const next = new Set(expandedFolders.value)
      next.add(parentId)
      expandedFolders.value = next
    }
    toast.success(parentId ? 'Moved into folder' : 'Moved to root')
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    saving.value = false
  }
}

async function onHistoryRestored() {
  if (!selectedId.value) return
  try {
    const full = await wikiApi.get(selectedId.value)
    applyPage(full)
    pages.value = [full, ...(pages.value ?? []).filter((item) => item.id !== full.id)]
    dirty.value = false
    editing.value = false
  } catch (error) {
    toast.error(getErrorMessage(error))
  }
}

async function finishWithAi() {
  if (!selected.value || filling.value) return
  filling.value = true
  try {
    if (dirty.value) await save({ silent: true })
    const result = await wikiApi.fill(selected.value.id)
    const full = await wikiApi.get(result.page.id).catch(() => result.page)
    applyPage(full)
    pages.value = [full, ...(pages.value ?? []).filter((item) => item.id !== full.id)]
    dirty.value = false
    editing.value = false
    const hint = aiSourceHint(result.source)
    toast.success('Draft finished', { description: hint ?? 'Placeholders cleared — skim once and you are done.' })
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    filling.value = false
  }
}

function markDirty() {
  dirty.value = true
  saveLabel.value = 'Unsaved changes'
}

async function startEditing() {
  editing.value = true
  await nextTick()
  bodyEl.value?.focus()
}

async function save({ silent = false } = {}) {
  if (!selected.value || !dirty.value || saving.value) return
  saving.value = true
  try {
    await wikiApi.update(selected.value.id, {
      title: title.value.trim() || 'Untitled page',
      body: body.value,
    })
    const full = await wikiApi.get(selected.value.id)
    applyPage(full)
    pages.value = [full, ...(pages.value ?? []).filter((item) => item.id !== full.id)].sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt),
    )
    dirty.value = false
    saveLabel.value = `Saved ${format(new Date(), 'HH:mm')}`
    if (!silent) toast.success('Page saved')
  } catch (error) {
    toast.error(getErrorMessage(error))
    saveLabel.value = 'Could not save'
  } finally {
    saving.value = false
  }
}

async function removePage(page: WikiPage) {
  const isFolder = page.kind === 'folder'
  const ok = await confirm({
    title: isFolder ? 'Delete this folder?' : 'Delete this page?',
    description: isFolder
      ? `“${page.title}” must be empty. It will be removed for everyone in the organization.`
      : `“${page.title}” will be removed for everyone in the organization.`,
    confirmLabel: 'Delete',
    destructive: true,
  })
  if (!ok) return
  try {
    await wikiApi.remove(page.id)
    pages.value = (pages.value ?? []).filter((item) => item.id !== page.id)
    if (activeFolderId.value === page.id) activeFolderId.value = null
    if (selectedId.value === page.id) closeEditor()
  } catch (error) {
    toast.error(getErrorMessage(error))
  }
}

function onBodyKeydown(event: KeyboardEvent) {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
    event.preventDefault()
    void save()
    return
  }
  assistRef.value?.onKeydown(event)
}

function onBodyInput(event: Event) {
  body.value = (event.target as HTMLTextAreaElement).value
  markDirty()
}

const canDelete = (page: WikiPage) => page.createdById === auth.user?.id || auth.isOrganizationAdmin
</script>

<template>
  <PageFrame mode="bare" gap="none" pad="none" class="flex min-h-0 flex-1 flex-col">
  <SplitPane
    :selected="Boolean(selectedId)"
    :collapsed="listCollapsed"
    master-class="w-72 shrink-0 xl:w-80"
    detail-class="bg-sidebar/30"
  >
    <template #master>
      <Toolbar variant="wrap" dense class="border-b border-border px-3 py-2.5">
        <BookOpen class="size-4 text-primary" />
        <div class="min-w-0 flex-1">
          <p class="text-[13px] font-semibold">Wiki</p>
          <p class="truncate text-[11px] text-muted-foreground">
            {{
              activeFolderId
                ? `In ${pages?.find((p) => p.id === activeFolderId)?.title ?? 'folder'}`
                : canAi
                  ? 'AI writes · folders · history'
                  : 'Folders · versions · shared knowledge'
            }}
          </p>
        </div>
        <Button
          v-if="isWide && selectedId"
          size="icon-sm"
          variant="ghost"
          title="Hide page list"
          aria-label="Hide page list"
          @click="listOpen = false"
        >
          <PanelLeftClose class="size-3.5" />
        </Button>
        <Button size="icon-sm" variant="ghost" title="New folder" :disabled="creating" @click="createFolder">
          <Folder class="size-3.5" />
        </Button>
        <Button size="sm" variant="secondary" @click="openNewDialog">
          <Sparkles v-if="canAi" class="size-3.5" />
          <Plus v-else class="size-3.5" />
          New
        </Button>
      </Toolbar>
      <div class="border-b border-border px-2 py-2">
        <div class="relative">
          <Search class="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input v-model="query" class="h-8 pl-7 text-xs" placeholder="Search knowledge…" aria-label="Search wiki" />
        </div>
      </div>
      <div class="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        <template v-if="pages === null">
          <Skeleton v-for="index in 5" :key="index" class="m-2 h-14" />
        </template>
        <div v-else-if="isEmptyOrg" class="space-y-3 px-4 py-8 text-center">
          <p class="text-sm font-medium">{{ canAi ? 'Ask AI for your first page' : 'Start your knowledge base' }}</p>
          <p class="text-xs leading-relaxed text-muted-foreground">
            {{
              canAi
                ? 'One sentence is enough — handbook, runbook, FAQ, and more, drafted from your team and projects.'
                : 'Create a page and fill it in. AI Assistant unlocks one-sentence generation.'
            }}
          </p>
          <Button size="sm" @click="openNewDialog">
            <Sparkles v-if="canAi" class="size-3.5" />
            {{ canAi ? 'Generate first page' : 'Create first page' }}
          </Button>
        </div>
        <p v-else-if="!pages.length" class="px-4 py-10 text-center text-xs text-muted-foreground">No pages match that search.</p>
        <template v-else-if="searching">
          <button
            v-for="page in pages.filter((item) => item.kind !== 'folder')"
            :key="page.id"
            type="button"
            class="flex w-full items-start gap-2 border-b border-border/50 px-3 py-2.5 text-left transition-colors"
            :class="selectedId === page.id ? 'bg-accent' : 'hover:bg-accent/50'"
            @click="openPage(page)"
          >
            <FileText class="mt-0.5 size-4 shrink-0 text-primary" />
            <span class="min-w-0 flex-1">
              <span class="block truncate text-[13px] font-medium" :title="page.title">{{ page.title }}</span>
              <span v-if="page.excerpt" class="mt-0.5 line-clamp-2 block text-[11px] text-muted-foreground">{{ page.excerpt }}</span>
            </span>
          </button>
        </template>
        <WikiTreeList
          v-else
          :nodes="tree"
          :selected-id="selectedId"
          :active-folder-id="activeFolderId"
          :expanded="expandedFolders"
          :depth="0"
          @open="openPage"
          @toggle="toggleFolder"
          @select-folder="selectFolder"
        />
      </div>
    </template>

    <template #empty>
      <div class="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center sm:p-8">
        <span class="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Sparkles v-if="canAi" class="size-6" />
          <BookOpen v-else class="size-6" />
        </span>
        <p class="text-sm font-medium">{{ canAi ? 'Knowledge that writes itself' : 'Pick a page or create one' }}</p>
        <p class="max-w-md text-xs leading-relaxed text-muted-foreground">
          {{
            canAi
              ? 'Describe the doc once. AI drafts from your org — people, projects, and how you already work. You edit the 10% that needs a human.'
              : 'Templates still help. Turn on AI Assistant for generate-from-brief pages.'
          }}
        </p>
        <Button class="mt-1" @click="openNewDialog">
          <Sparkles v-if="canAi" class="size-4" />
          <Plus v-else class="size-4" />
          {{ canAi ? 'Generate a page' : 'New page' }}
        </Button>
        <div v-if="canAi" class="mt-4 grid w-full max-w-lg gap-2 text-left sm:grid-cols-2">
          <button
            v-for="item in [
              { id: 'handbook', title: 'Team handbook', description: 'How we work, owners, norms' },
              { id: 'runbook', title: 'Runbook', description: 'Incident steps that AI can draft' },
              { id: 'faq', title: 'FAQ', description: 'Answers people ask repeatedly' },
              { id: 'how-to', title: 'How-to', description: 'One outcome, clear steps' },
            ]"
            :key="item.id"
            type="button"
            class="border border-border/70 bg-background px-3 py-2.5 text-left transition-colors hover:border-primary/30 hover:bg-accent/40"
            @click="openNewDialog(item.id)"
          >
            <span class="block text-[13px] font-medium">{{ item.title }}</span>
            <span class="mt-0.5 block text-[11px] text-muted-foreground">{{ item.description }}</span>
          </button>
        </div>
      </div>
    </template>

    <template #detail>
        <div
          v-if="selectedId && !selected"
          class="flex min-h-0 flex-1 flex-col gap-3 p-4"
          aria-busy="true"
          aria-label="Loading page"
        >
          <Skeleton class="h-9 w-[66%] max-w-md" />
          <Skeleton class="h-4 w-40" />
          <Skeleton class="mt-2 h-4 w-full" />
          <Skeleton class="h-4 w-full" />
          <Skeleton class="h-4 w-[83%]" />
          <Skeleton class="mt-4 min-h-[12rem] w-full flex-1 rounded-xl" />
        </div>
        <div v-else-if="selected" class="flex min-h-0 min-w-0 flex-1 flex-col">
        <Toolbar variant="wrap" dense class="border-b border-border bg-background px-3 py-2.5 sm:px-5">
          <Button v-if="!isWide" variant="ghost" size="icon-sm" class="shrink-0" aria-label="Back to wiki" @click="closeEditor"><ArrowLeft /></Button>
          <Button
            v-else-if="listCollapsed"
            variant="outline"
            size="sm"
            class="shrink-0 gap-1.5"
            aria-label="Show page list"
            title="Show page list"
            @click="listOpen = true"
          >
            <PanelLeft class="size-3.5" />
            <span class="hidden sm:inline">Pages</span>
          </Button>
          <div class="min-w-0 flex-1">
            <Input
              v-if="editing"
              v-model="title"
              class="h-9 font-semibold"
              aria-label="Page title"
              placeholder="Page title"
              @input="markDirty"
            />
            <template v-else>
              <h1 class="truncate text-base font-semibold tracking-tight sm:text-lg">{{ title }}</h1>
              <p class="truncate text-[11px] text-muted-foreground">
                {{ selected?.updatedBy?.name ?? selected?.createdBy?.name ?? 'Someone' }}
                · {{ selected ? format(parseISO(selected.updatedAt), 'd MMM, HH:mm') : '' }}
                <span v-if="saveLabel || saving"> · {{ saving ? 'Saving…' : saveLabel }}</span>
              </p>
            </template>
          </div>
          <div class="flex shrink-0 items-center gap-1">
            <select
              v-if="folderChoices.length"
              class="hidden h-8 max-w-[9rem] rounded-md border border-input bg-background px-1.5 text-[11px] sm:block"
              :value="selected.parentId ?? ''"
              aria-label="Move to folder"
              @change="moveSelected(($event.target as HTMLSelectElement).value || null)"
            >
              <option value="">Root</option>
              <option
                v-for="folder in folderChoices.filter((item) => item.id !== selected?.id)"
                :key="folder.id"
                :value="folder.id"
              >
                {{ folder.title }}
              </option>
            </select>
            <Button
              v-if="canAi && (looksUnfinished || !body.trim())"
              size="sm"
              variant="secondary"
              :loading="filling"
              @click="finishWithAi"
            >
              <Sparkles class="size-3.5" />
              <span class="hidden sm:inline">Finish with AI</span>
            </Button>
            <Button size="icon-sm" variant="ghost" title="Version history" @click="showHistory = true">
              <History />
            </Button>
            <Button v-if="!editing" size="sm" variant="outline" @click="startEditing"><Pencil class="size-3.5" /> Edit</Button>
            <template v-else>
              <Button size="sm" variant="ghost" @click="editing = false">Done</Button>
              <Button size="sm" :disabled="!dirty || saving" :loading="saving" @click="save()">Save</Button>
            </template>
            <Button v-if="selected && canDelete(selected)" size="icon-sm" variant="ghost" title="Delete page" @click="removePage(selected)">
              <Trash2 />
            </Button>
          </div>
        </Toolbar>

        <!-- Read mode: document first -->
        <div v-if="!editing" class="min-h-0 flex-1 overflow-y-auto">
          <div
            v-if="canAi && looksUnfinished"
            class="flex flex-wrap items-center gap-2 border-b border-primary/20 bg-primary/5 px-4 py-2.5"
          >
            <Sparkles class="size-4 text-primary" />
            <p class="min-w-0 flex-1 text-[13px]">This still looks like a template. Let AI finish it from your org context.</p>
            <Button size="sm" :loading="filling" @click="finishWithAi"><Sparkles class="size-3.5" /> Finish with AI</Button>
          </div>
          <article class="w-full px-5 py-5 sm:px-6 sm:py-6 lg:px-8">
            <div
              v-if="referencedIssues.length || linkedPages.length || backlinks.length"
              class="mb-5 space-y-3"
            >
              <div v-if="referencedIssues.length" class="flex flex-wrap items-center gap-1.5">
                <span class="mr-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Referenced tasks</span>
                <RouterLink
                  v-for="issue in referencedIssues"
                  :key="issue.id"
                  :to="{ name: 'issue', params: { issueKey: issue.key } }"
                  class="inline-flex max-w-full items-center gap-1.5 rounded-md border border-primary/25 bg-primary/8 px-2 py-1 text-[12px] font-medium text-primary transition-colors hover:bg-primary/15"
                  :title="issue.title"
                >
                  <span class="font-mono text-[11px]">{{ issue.key }}</span>
                  <span class="truncate text-foreground/80">{{ issue.title }}</span>
                </RouterLink>
              </div>
              <div v-if="linkedPages.length" class="flex flex-wrap items-center gap-1.5">
                <span class="mr-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Links to</span>
                <RouterLink
                  v-for="page in linkedPages"
                  :key="page.id"
                  :to="{ name: 'wiki-page', params: { pageId: page.id } }"
                  class="inline-flex max-w-full items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2 py-1 text-[12px] font-medium transition-colors hover:bg-muted"
                  :title="page.excerpt || page.title"
                >
                  <BookOpen class="size-3 shrink-0 text-muted-foreground" />
                  <span class="truncate">{{ page.title }}</span>
                </RouterLink>
              </div>
              <div v-if="backlinks.length" class="flex flex-wrap items-center gap-1.5">
                <span class="mr-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Backlinks</span>
                <RouterLink
                  v-for="page in backlinks"
                  :key="page.id"
                  :to="{ name: 'wiki-page', params: { pageId: page.id } }"
                  class="inline-flex max-w-full items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2 py-1 text-[12px] font-medium transition-colors hover:bg-muted"
                  :title="page.excerpt || page.title"
                >
                  <FileText class="size-3 shrink-0 text-muted-foreground" />
                  <span class="truncate">{{ page.title }}</span>
                </RouterLink>
              </div>
            </div>
            <RichText
              v-if="body.trim()"
              :source="resolvedBody"
              :issue-keys="issueKeys"
              :wiki-pages="wikiLinkTargets"
              class="wiki-doc text-[15px]"
            />
            <div v-else class="space-y-3 py-10 text-center">
              <p class="text-sm text-muted-foreground">This page is empty.</p>
              <div class="flex justify-center gap-2">
                <Button v-if="canAi" :loading="filling" @click="finishWithAi"><Sparkles class="size-3.5" /> Write with AI</Button>
                <Button variant="outline" @click="startEditing"><Pencil class="size-3.5" /> Write manually</Button>
              </div>
            </div>
          </article>
        </div>

        <!-- Edit mode -->
        <template v-else>
          <div class="space-y-2 border-b border-border bg-background px-3 py-2 sm:px-4">
            <div class="flex flex-wrap items-center gap-2">
              <WikiEditorToolbar :textarea="bodyEl" :page-id="selectedId" @change="markDirty" />
              <Button v-if="canAi" size="xs" variant="secondary" class="ml-auto" :loading="filling" @click="finishWithAi">
                <Sparkles class="size-3.5" /> Finish with AI
              </Button>
            </div>
            <WritingAssistBar ref="assistRef" v-model="body" surface="wiki" @update:model-value="markDirty" @applied="markDirty" />
          </div>
          <!-- Side-by-side edit/preview only from xl — inside SplitPane, lg dual-cols are too skinny at 1024. -->
          <div class="grid min-h-0 flex-1 gap-0 xl:grid-cols-2">
            <div class="flex min-h-0 min-w-0 flex-col border-border xl:border-r">
              <textarea
                ref="bodyEl"
                :value="body"
                class="min-h-[12rem] w-full flex-1 resize-none bg-background p-3 text-[14px] leading-6 outline-none sm:min-h-0 sm:p-4"
                placeholder="Edit the draft, or click Finish with AI."
                aria-label="Page body"
                @input="onBodyInput"
                @keydown="onBodyKeydown"
              />
            </div>
            <div class="hidden min-h-0 space-y-3 overflow-y-auto p-3 scrollbar-thin sm:p-4 xl:block">
              <WikiFillGuide v-if="looksUnfinished" :body="body" :textarea="bodyEl" />
              <div>
                <p class="mb-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Preview</p>
                <RichText
                  v-if="body.trim()"
                  :source="resolvedBody"
                  :issue-keys="issueKeys"
                  :wiki-pages="wikiLinkTargets"
                  class="text-[14px]"
                />
                <p v-else class="text-sm text-muted-foreground italic">Nothing to preview yet.</p>
              </div>
            </div>
          </div>
        </template>
        </div>
    </template>
  </SplitPane>

  <WikiNewPageDialog
    v-model:open="showNew"
    :templates="templates"
    :creating="creating"
    :prefer-template-id="preferTemplateId"
    @create="createFromDialog"
  />
  <WikiHistoryDialog
    v-model:open="showHistory"
    :page-id="selectedId"
    :page-title="selected?.title"
    @restored="onHistoryRestored"
  />
  </PageFrame>
</template>

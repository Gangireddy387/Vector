<script setup lang="ts">
import { ArrowLeft, Package, RefreshCw } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import EmptyState from '@/components/common/EmptyState.vue'
import IssueTypeIcon from '@/components/common/IssueTypeIcon.vue'
import { DateField } from '@/components/forms'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { formatDate } from '@/lib/format'
import { getErrorMessage } from '@/lib/http'
import { useOpenIssue } from '@/modules/issues/composables/useOpenIssue'
import { useProjectsStore } from '@/modules/projects/projects.store'
import { releasesApi, type VersionDetail } from '../releases.api'

const route = useRoute()
const router = useRouter()
const projects = useProjectsStore()
const openIssue = useOpenIssue()

const projectId = computed(() => route.params.projectId as string)
const versionId = computed(() => route.params.versionId as string)
const canEdit = computed(() => projects.canEdit(projectId.value))

const detail = ref<VersionDetail | null>(null)
const loading = ref(false)
const loadError = ref<string | null>(null)
const saving = ref(false)
const notesDraft = ref('')
const meta = ref({ name: '', description: '', startDate: '', releaseDate: '' })

async function load() {
  const pid = projectId.value
  const vid = versionId.value
  if (!pid || !vid) return
  loading.value = true
  loadError.value = null
  try {
    detail.value = await releasesApi.get(pid, vid)
    const version = detail.value.version
    notesDraft.value = version.releaseNotes ?? ''
    meta.value = {
      name: version.name,
      description: version.description ?? '',
      startDate: version.startDate ?? '',
      releaseDate: version.releaseDate ?? '',
    }
  } catch (error) {
    loadError.value = getErrorMessage(error)
    toast.error(loadError.value)
  } finally {
    loading.value = false
  }
}

watch([projectId, versionId], load, { immediate: true })

const notesDirty = computed(() => (detail.value?.version.releaseNotes ?? '') !== notesDraft.value)
const metaDirty = computed(() => {
  const version = detail.value?.version
  if (!version) return false
  return (
    meta.value.name.trim() !== version.name ||
    (meta.value.description.trim() || null) !== (version.description || null) ||
    (meta.value.startDate || null) !== (version.startDate || null) ||
    (meta.value.releaseDate || null) !== (version.releaseDate || null)
  )
})

async function saveMeta() {
  if (!canEdit.value || !detail.value) return
  saving.value = true
  try {
    await releasesApi.update(projectId.value, versionId.value, {
      name: meta.value.name.trim(),
      description: meta.value.description.trim() || null,
      startDate: meta.value.startDate || null,
      releaseDate: meta.value.releaseDate || null,
    })
    toast.success('Version updated')
    await load()
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    saving.value = false
  }
}

async function saveNotes() {
  if (!canEdit.value) return
  saving.value = true
  try {
    await releasesApi.update(projectId.value, versionId.value, { releaseNotes: notesDraft.value })
    toast.success('Release notes saved')
    await load()
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    saving.value = false
  }
}

async function regenerateNotes() {
  if (!canEdit.value) return
  saving.value = true
  try {
    detail.value = await releasesApi.generateNotes(projectId.value, versionId.value, true)
    notesDraft.value = detail.value.version.releaseNotes ?? ''
    toast.success('Release notes regenerated')
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    saving.value = false
  }
}

async function releaseNow() {
  if (!canEdit.value) return
  saving.value = true
  try {
    detail.value = await releasesApi.release(projectId.value, versionId.value)
    notesDraft.value = detail.value.version.releaseNotes ?? ''
    toast.success(`${detail.value.version.name} released`)
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    saving.value = false
  }
}

async function archiveNow() {
  if (!canEdit.value) return
  saving.value = true
  try {
    await releasesApi.archive(projectId.value, versionId.value)
    toast.success('Version archived')
    await load()
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    saving.value = false
  }
}

async function reopenNow() {
  if (!canEdit.value) return
  saving.value = true
  try {
    await releasesApi.reopen(projectId.value, versionId.value)
    toast.success('Version reopened')
    await load()
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="flex h-full min-h-0 min-w-0 flex-col gap-3 overflow-hidden p-3 sm:gap-4 sm:p-4 lg:p-5">
    <header class="flex shrink-0 flex-wrap items-start justify-between gap-2">
      <div class="min-w-0 space-y-1">
        <Button
          variant="ghost"
          size="sm"
          class="-ml-2"
          @click="router.push({ name: 'project-releases', params: { projectId } })"
        >
          <ArrowLeft /> All releases
        </Button>
        <h1 class="text-lg font-semibold tracking-tight sm:text-xl">
          {{ detail?.version.name ?? 'Release' }}
        </h1>
        <p v-if="detail" class="text-xs text-muted-foreground">
          {{ detail.version.status }}
          <template v-if="detail.version.releaseDate"> · {{ formatDate(detail.version.releaseDate, 'd MMM yyyy') }}</template>
          · {{ detail.version.stats.doneCount }}/{{ detail.version.stats.issueCount }} issues done
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-1.5">
        <Button variant="outline" size="sm" :loading="loading" @click="load"><RefreshCw /></Button>
        <template v-if="canEdit && detail">
          <Button v-if="detail.version.status === 'unreleased'" size="sm" :loading="saving" @click="releaseNow">
            Release
          </Button>
          <Button
            v-if="detail.version.status !== 'archived'"
            variant="outline"
            size="sm"
            :loading="saving"
            @click="archiveNow"
          >
            Archive
          </Button>
          <Button v-else variant="outline" size="sm" :loading="saving" @click="reopenNow">Reopen</Button>
        </template>
      </div>
    </header>

    <div v-if="loading && !detail" class="min-h-0 flex-1 space-y-2">
      <Skeleton class="h-32 w-full rounded-xl" />
      <Skeleton class="h-64 w-full rounded-xl" />
    </div>

    <EmptyState
      v-else-if="loadError && !detail"
      :icon="Package"
      title="Version did not load"
      :description="loadError"
      class="min-h-0 flex-1"
    >
      <Button @click="load">Try again</Button>
    </EmptyState>

    <div v-else-if="detail" class="grid min-h-0 flex-1 gap-4 overflow-y-auto overscroll-contain lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <section class="space-y-4">
        <article class="space-y-3 rounded-xl border bg-card p-3 shadow-soft sm:p-4">
          <h2 class="text-sm font-semibold">Details</h2>
          <Input v-model="meta.name" :disabled="!canEdit || saving" maxlength="80" aria-label="Version name" />
          <Textarea v-model="meta.description" :disabled="!canEdit || saving" rows="3" placeholder="Description" />
          <div class="grid gap-3 sm:grid-cols-2">
            <DateField v-model="meta.startDate" label="Start date" :disabled="!canEdit || saving" />
            <DateField v-model="meta.releaseDate" label="Release date" :disabled="!canEdit || saving" />
          </div>
          <Button v-if="canEdit" size="sm" :loading="saving" :disabled="!metaDirty" @click="saveMeta">Save details</Button>
        </article>

        <article class="space-y-2 rounded-xl border bg-card p-3 shadow-soft sm:p-4">
          <h2 class="text-sm font-semibold">Fix-version issues</h2>
          <ul v-if="detail.issues.length" class="divide-y divide-border/60 overflow-hidden rounded-lg border">
            <li v-for="issue in detail.issues" :key="issue.id">
              <button
                type="button"
                class="flex w-full items-center gap-2 px-2.5 py-2 text-left text-sm hover:bg-muted/40"
                @click="openIssue(issue)"
              >
                <IssueTypeIcon :type="issue.type" class="size-3.5 shrink-0" />
                <span class="font-mono text-[11px] text-muted-foreground">{{ issue.key }}</span>
                <span class="min-w-0 flex-1 truncate">{{ issue.title }}</span>
                <span class="text-[10px] text-muted-foreground">{{ issue.status?.name }}</span>
              </button>
            </li>
          </ul>
          <p v-else class="text-sm text-muted-foreground">No issues tagged with this fix version yet.</p>
        </article>
      </section>

      <section class="flex min-h-0 flex-col gap-2 rounded-xl border bg-card p-3 shadow-soft sm:p-4">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h2 class="text-sm font-semibold">Release notes</h2>
          <div class="flex gap-1.5">
            <Button v-if="canEdit" variant="outline" size="sm" :loading="saving" @click="regenerateNotes">
              Regenerate
            </Button>
            <Button v-if="canEdit" size="sm" :loading="saving" :disabled="!notesDirty" @click="saveNotes">Save notes</Button>
          </div>
        </div>
        <Textarea
          v-model="notesDraft"
          class="min-h-72 flex-1 font-mono text-xs"
          :disabled="!canEdit || saving"
          placeholder="Markdown release notes…"
        />
      </section>
    </div>
  </div>
</template>

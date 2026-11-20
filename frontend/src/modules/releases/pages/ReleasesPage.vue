<script setup lang="ts">
import { Package, Plus, RefreshCw } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import EmptyState from '@/components/common/EmptyState.vue'
import { DateField } from '@/components/forms'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { formatDate } from '@/lib/format'
import { getErrorMessage } from '@/lib/http'
import { useProjectsStore } from '@/modules/projects/projects.store'
import type { VersionStatus } from '@/types/models'
import { releasesApi, type VersionSummary } from '../releases.api'

const route = useRoute()
const router = useRouter()
const projects = useProjectsStore()

const projectId = computed(() => route.params.projectId as string)
const canEdit = computed(() => projects.canEdit(projectId.value))

const versions = ref<VersionSummary[]>([])
const loading = ref(false)
const loadError = ref<string | null>(null)
const filter = ref<VersionStatus | 'all'>('all')
const creating = ref(false)
const saving = ref(false)
const form = ref({ name: '', description: '', startDate: '', releaseDate: '' })

const filtered = computed(() =>
  filter.value === 'all' ? versions.value : versions.value.filter((row) => row.status === filter.value),
)

const grouped = computed(() => ({
  unreleased: filtered.value.filter((row) => row.status === 'unreleased'),
  released: filtered.value.filter((row) => row.status === 'released'),
  archived: filtered.value.filter((row) => row.status === 'archived'),
}))

async function load() {
  const id = projectId.value
  if (!id) return
  loading.value = true
  loadError.value = null
  try {
    versions.value = await releasesApi.list(id)
  } catch (error) {
    loadError.value = getErrorMessage(error)
    toast.error(loadError.value)
  } finally {
    loading.value = false
  }
}

watch(projectId, load, { immediate: true })

async function createVersion() {
  if (!form.value.name.trim() || !canEdit.value) return
  saving.value = true
  try {
    const version = await releasesApi.create(projectId.value, {
      name: form.value.name.trim(),
      description: form.value.description.trim() || null,
      startDate: form.value.startDate || null,
      releaseDate: form.value.releaseDate || null,
    })
    creating.value = false
    form.value = { name: '', description: '', startDate: '', releaseDate: '' }
    toast.success(`Version ${version.name} created`)
    await router.push({ name: 'project-release', params: { projectId: projectId.value, versionId: version.id } })
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    saving.value = false
  }
}

function progress(version: VersionSummary) {
  if (!version.stats.issueCount) return 0
  return Math.round((version.stats.doneCount / version.stats.issueCount) * 100)
}

function statusClass(status: VersionStatus) {
  if (status === 'released') return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
  if (status === 'archived') return 'bg-muted text-muted-foreground'
  return 'bg-sky-500/15 text-sky-700 dark:text-sky-300'
}
</script>

<template>
  <div class="flex h-full min-h-0 min-w-0 flex-col gap-3 overflow-hidden p-3 sm:gap-4 sm:p-4 lg:p-5">
    <header class="flex shrink-0 flex-wrap items-start justify-between gap-2">
      <div class="min-w-0 space-y-0.5">
        <h1 class="text-lg font-semibold tracking-tight sm:text-xl lg:text-2xl">Releases</h1>
        <p class="hidden max-w-2xl text-sm text-muted-foreground sm:block">
          Project versions with fix/affected links on issues and markdown release notes.
        </p>
      </div>
      <div class="flex shrink-0 items-center gap-1.5">
        <Button variant="outline" size="sm" :loading="loading" @click="load"><RefreshCw /></Button>
        <Button v-if="canEdit" size="sm" @click="creating = true"><Plus /> New version</Button>
      </div>
    </header>

    <div class="flex flex-wrap gap-1.5">
      <Button
        v-for="item in [
          { value: 'all', label: 'All' },
          { value: 'unreleased', label: 'Unreleased' },
          { value: 'released', label: 'Released' },
          { value: 'archived', label: 'Archived' },
        ] as const"
        :key="item.value"
        variant="outline"
        size="sm"
        :aria-pressed="filter === item.value"
        :class="filter === item.value && 'bg-muted'"
        @click="filter = item.value"
      >
        {{ item.label }}
      </Button>
    </div>

    <div v-if="loading && !versions.length" class="min-h-0 flex-1 space-y-2">
      <Skeleton class="h-24 w-full rounded-xl" />
      <Skeleton class="h-24 w-full rounded-xl" />
    </div>

    <EmptyState
      v-else-if="loadError && !versions.length"
      :icon="Package"
      title="Releases did not load"
      :description="loadError"
      class="min-h-0 flex-1"
    >
      <Button @click="load">Try again</Button>
    </EmptyState>

    <EmptyState
      v-else-if="!filtered.length"
      :icon="Package"
      title="No versions yet"
      description="Create a version, tag issues with fix versions, then generate release notes."
      class="min-h-0 flex-1"
    >
      <Button v-if="canEdit" @click="creating = true"><Plus /> New version</Button>
    </EmptyState>

    <div v-else class="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain">
      <section v-for="section in [
        { key: 'unreleased', title: 'Unreleased', rows: grouped.unreleased },
        { key: 'released', title: 'Released', rows: grouped.released },
        { key: 'archived', title: 'Archived', rows: grouped.archived },
      ]" :key="section.key" class="space-y-2">
        <template v-if="section.rows.length">
          <h2 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{{ section.title }}</h2>
          <ul class="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            <li v-for="version in section.rows" :key="version.id">
              <button
                type="button"
                class="flex h-full w-full flex-col gap-2 rounded-xl border border-border/80 bg-card p-3 text-left shadow-soft transition-colors hover:border-primary/40"
                @click="router.push({ name: 'project-release', params: { projectId, versionId: version.id } })"
              >
                <div class="flex items-start justify-between gap-2">
                  <p class="font-semibold">{{ version.name }}</p>
                  <span class="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase" :class="statusClass(version.status)">
                    {{ version.status }}
                  </span>
                </div>
                <p v-if="version.description" class="line-clamp-2 text-xs text-muted-foreground">{{ version.description }}</p>
                <div class="mt-auto space-y-1.5">
                  <div class="flex justify-between text-[11px] text-muted-foreground">
                    <span>{{ version.stats.doneCount }}/{{ version.stats.issueCount }} done</span>
                    <span v-if="version.releaseDate">{{ formatDate(version.releaseDate, 'd MMM yyyy') }}</span>
                  </div>
                  <div class="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div class="h-full rounded-full bg-primary transition-all" :style="{ width: `${progress(version)}%` }" />
                  </div>
                </div>
              </button>
            </li>
          </ul>
        </template>
      </section>
    </div>

    <Dialog v-model:open="creating">
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New version</DialogTitle>
          <DialogDescription>Name a release (for example 1.4.0) and optionally set planning dates.</DialogDescription>
        </DialogHeader>
        <div class="space-y-3">
          <Input v-model="form.name" placeholder="1.4.0" maxlength="80" aria-label="Version name" />
          <Textarea v-model="form.description" placeholder="Optional description" rows="3" />
          <div class="grid gap-3 sm:grid-cols-2">
            <DateField v-model="form.startDate" label="Start date" />
            <DateField v-model="form.releaseDate" label="Release date" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="creating = false">Cancel</Button>
          <Button :loading="saving" :disabled="!form.name.trim()" @click="createVersion">Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>

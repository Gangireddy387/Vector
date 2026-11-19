<script setup lang="ts">
import { ImagePlus, Trash2 } from 'lucide-vue-next'
import { onMounted, ref, useTemplateRef } from 'vue'
import { toast } from 'vue-sonner'
import EmptyState from '@/components/common/EmptyState.vue'
import ImageCropDialog from '@/components/common/ImageCropDialog.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { reloadShowcaseTeam, type ShowcasePortrait } from '@/composables/useShowcaseTeam'
import { assetUrl, getErrorMessage, http } from '@/lib/http'
import { ACCEPTED_IMAGE_TYPES, assertImageFile } from '@/lib/image'
import { useSocketEvents } from '@/lib/socket-events'

/** Super admin uploads developers + feedback used on About / sign-in rich UI. */
const portraits = ref<ShowcasePortrait[] | null>(null)
const name = ref('')
const role = ref('')
const feedback = ref('')
const isUploading = ref(false)
const removingId = ref<string | null>(null)
const savingId = ref<string | null>(null)
const fileInput = useTemplateRef<HTMLInputElement>('fileInput')
const pendingFile = ref<File | null>(null)
const isCropOpen = ref(false)
const drafts = ref<Record<string, { name: string; role: string; feedback: string }>>({})

function draftFor(portrait: ShowcasePortrait) {
  if (!drafts.value[portrait.id]) {
    drafts.value[portrait.id] = {
      name: portrait.name,
      role: portrait.role ?? '',
      feedback: portrait.feedback ?? '',
    }
  }
  return drafts.value[portrait.id]!
}

function syncDrafts(list: ShowcasePortrait[]) {
  const next: Record<string, { name: string; role: string; feedback: string }> = {}
  for (const portrait of list) {
    next[portrait.id] = drafts.value[portrait.id] ?? {
      name: portrait.name,
      role: portrait.role ?? '',
      feedback: portrait.feedback ?? '',
    }
  }
  drafts.value = next
}

async function load() {
  try {
    const { data } = await http.get<{ portraits: ShowcasePortrait[] }>('/super-admin/showcase')
    portraits.value = data.portraits
    syncDrafts(data.portraits)
  } catch (error) {
    toast.error(getErrorMessage(error))
    portraits.value = []
  }
}

onMounted(load)
useSocketEvents({
  'showcase:updated': (payload: { portraits?: ShowcasePortrait[] }) => {
    const list = payload?.portraits ?? []
    portraits.value = list
    syncDrafts(list)
  },
})

function pick(file: File | undefined) {
  if (fileInput.value) fileInput.value.value = ''
  if (!file) return
  try {
    assertImageFile(file)
  } catch (error) {
    toast.error(error instanceof Error ? error.message : 'That file cannot be used.')
    return
  }
  pendingFile.value = file
  isCropOpen.value = true
}

async function upload(blob: Blob, fileName: string) {
  isUploading.value = true
  try {
    const body = new FormData()
    body.append('image', blob, fileName)
    if (name.value.trim()) body.append('name', name.value.trim())
    if (role.value.trim()) body.append('role', role.value.trim())
    if (feedback.value.trim()) body.append('feedback', feedback.value.trim())
    await http.post('/super-admin/showcase', body)
    name.value = ''
    role.value = ''
    feedback.value = ''
    isCropOpen.value = false
    pendingFile.value = null
    toast.success('Developer added to the gallery')
    await load()
    await reloadShowcaseTeam()
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    isUploading.value = false
  }
}

async function save(id: string) {
  const draft = drafts.value[id]
  if (!draft) return
  savingId.value = id
  try {
    await http.patch(`/super-admin/showcase/${id}`, {
      name: draft.name.trim(),
      role: draft.role.trim(),
      feedback: draft.feedback.trim(),
    })
    toast.success('Developer details saved')
    await load()
    await reloadShowcaseTeam()
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    savingId.value = null
  }
}

async function remove(id: string) {
  removingId.value = id
  try {
    await http.delete(`/super-admin/showcase/${id}`)
    toast.success('Removed from gallery')
    await load()
    await reloadShowcaseTeam()
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    removingId.value = null
  }
}
</script>

<template>
  <div class="space-y-4">
    <div class="rounded-xl border border-border bg-card p-4 shadow-soft sm:p-5">
      <h2 class="text-sm font-semibold">Developers &amp; feedback</h2>
      <p class="mt-1 text-sm text-muted-foreground">
        Photos, roles and short quotes appear as floating people and testimonials on About and sign-in. Up to 20.
      </p>
      <div class="mt-4 grid gap-3 sm:grid-cols-2">
        <div class="space-y-1">
          <label class="text-xs font-medium text-muted-foreground" for="showcase-name">Name</label>
          <Input id="showcase-name" v-model="name" placeholder="e.g. Gangireddy" maxlength="60" />
        </div>
        <div class="space-y-1">
          <label class="text-xs font-medium text-muted-foreground" for="showcase-role">Role / title</label>
          <Input id="showcase-role" v-model="role" placeholder="e.g. Product engineer" maxlength="80" />
        </div>
        <div class="space-y-1 sm:col-span-2">
          <label class="text-xs font-medium text-muted-foreground" for="showcase-feedback">Feedback quote</label>
          <Textarea
            id="showcase-feedback"
            v-model="feedback"
            rows="2"
            maxlength="280"
            placeholder="e.g. Less busywork — standups and boards finally live in one place."
          />
        </div>
      </div>
      <div class="mt-3 flex flex-wrap items-center gap-2">
        <input
          ref="fileInput"
          type="file"
          class="hidden"
          :accept="ACCEPTED_IMAGE_TYPES.join(',')"
          @change="pick(($event.target as HTMLInputElement).files?.[0])"
        />
        <Button type="button" :loading="isUploading" @click="fileInput?.click()">
          <ImagePlus />
          Upload photo
        </Button>
        <p class="text-xs text-muted-foreground">PNG, JPEG, WebP or GIF — crop before saving.</p>
      </div>
    </div>

    <div v-if="!portraits" class="grid gap-3 lg:grid-cols-2">
      <Skeleton v-for="index in 2" :key="index" class="h-44" />
    </div>
    <EmptyState
      v-else-if="!portraits.length"
      title="No developers yet"
      description="Add a photo, role and short feedback — they show up on About and sign-in right away."
    />
    <ul v-else class="grid gap-3 lg:grid-cols-2">
      <li
        v-for="portrait in portraits"
        :key="portrait.id"
        class="rounded-xl border border-border bg-card p-3 shadow-soft sm:p-4"
      >
        <div class="flex items-start gap-3">
          <img
            :src="assetUrl(portrait.imageUrl)"
            :alt="portrait.name"
            class="size-14 shrink-0 rounded-full object-cover ring-2 ring-border"
            :class="`bg-linear-to-br ${portrait.tone}`"
          />
          <div class="min-w-0 flex-1 space-y-2">
            <Input v-model="draftFor(portrait).name" maxlength="60" placeholder="Name" aria-label="Name" />
            <Input v-model="draftFor(portrait).role" maxlength="80" placeholder="Role / title" aria-label="Role" />
            <Textarea
              v-model="draftFor(portrait).feedback"
              rows="2"
              maxlength="280"
              placeholder="Feedback quote"
              aria-label="Feedback"
            />
            <div class="flex flex-wrap gap-2">
              <Button type="button" size="sm" :loading="savingId === portrait.id" @click="save(portrait.id)">Save</Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                class="text-destructive"
                :loading="removingId === portrait.id"
                @click="remove(portrait.id)"
              >
                <Trash2 />
                Remove
              </Button>
            </div>
          </div>
        </div>
      </li>
    </ul>

    <ImageCropDialog v-model:open="isCropOpen" :file="pendingFile" :saving="isUploading" @save="upload" />
  </div>
</template>

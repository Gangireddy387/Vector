<script setup lang="ts">
import { CircleCheck, Eye, Lock, MessageSquare, Paperclip } from 'lucide-vue-next'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import DueDateBadge from '@/components/common/DueDateBadge.vue'
import FormField from '@/components/common/FormField.vue'
import IssueTypeIcon from '@/components/common/IssueTypeIcon.vue'
import LabelChip from '@/components/common/LabelChip.vue'
import OrganizationLogo from '@/components/common/OrganizationLogo.vue'
import PriorityIcon from '@/components/common/PriorityIcon.vue'
import UserAvatar from '@/components/common/UserAvatar.vue'
import AppLogo from '@/components/layout/AppLogo.vue'
import BrandMark from '@/components/layout/BrandMark.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { assetUrl, getErrorMessage } from '@/lib/http'
import { getDueState } from '@/lib/format'
import PublicIssueDetail from '../components/PublicIssueDetail.vue'
import PublicShareIssueSheet from '../components/PublicShareIssueSheet.vue'
import ShareProductTour from '../components/ShareProductTour.vue'
import SharePromoChips from '../components/SharePromoChips.vue'
import { sharesApi, type PublicShareIssueCard, type PublicSharePayload } from '../shares.api'

const props = defineProps<{ token: string }>()

const data = ref<PublicSharePayload | null>(null)
const problem = ref<string | null>(null)
const isLoading = ref(true)
const unlockPassword = ref('')
const unlockError = ref('')
const isUnlocking = ref(false)
const openIssueId = ref<string | null>(null)
const sheetOpen = ref(false)
const linkExpired = ref(false)
let expireTimer: ReturnType<typeof setTimeout> | null = null

const orgLogo = computed(() => assetUrl(data.value?.organization.logoUrl))
const totalIssues = computed(() => data.value?.columns?.reduce((sum, column) => sum + column.issues.length, 0) ?? 0)
const isLocked = computed(() => Boolean(data.value?.locked))
const accessLabel = computed(() => {
  if (!data.value || isLocked.value || linkExpired.value) return ''
  if (data.value.guestCommentsEnabled) return 'Comments welcome'
  return 'Read-only'
})

function clearExpireTimer() {
  if (expireTimer) {
    clearTimeout(expireTimer)
    expireTimer = null
  }
}

function scheduleExpiry(expiresAt?: string | null) {
  clearExpireTimer()
  linkExpired.value = false
  if (!expiresAt) return
  const ms = new Date(expiresAt).getTime() - Date.now()
  if (ms <= 0) {
    linkExpired.value = true
    return
  }
  expireTimer = setTimeout(() => {
    linkExpired.value = true
    sheetOpen.value = false
  }, ms)
}

function applyPayload(payload: PublicSharePayload) {
  data.value = payload
  problem.value = null
  scheduleExpiry(payload.expiresAt)
}

onMounted(async () => {
  try {
    applyPayload(await sharesApi.publicShare(props.token))
  } catch (error) {
    problem.value = getErrorMessage(error, 'This share link does not work.')
  } finally {
    isLoading.value = false
  }
})

watch(
  () => props.token,
  async () => {
    isLoading.value = true
    problem.value = null
    data.value = null
    try {
      applyPayload(await sharesApi.publicShare(props.token))
    } catch (error) {
      problem.value = getErrorMessage(error, 'This share link does not work.')
    } finally {
      isLoading.value = false
    }
  },
)

onBeforeUnmount(clearExpireTimer)

async function unlock() {
  unlockError.value = ''
  isUnlocking.value = true
  try {
    applyPayload(await sharesApi.unlockShare(props.token, unlockPassword.value))
    unlockPassword.value = ''
  } catch (error) {
    unlockError.value = getErrorMessage(error, 'Incorrect password')
  } finally {
    isUnlocking.value = false
  }
}

function openTicket(issue: PublicShareIssueCard) {
  openIssueId.value = issue.id
  sheetOpen.value = true
}

function isOverdue(issue: PublicShareIssueCard) {
  return getDueState(issue.dueDate, issue.status?.category === 'done') === 'overdue'
}
</script>

<template>
  <div class="public-share flex min-h-dvh flex-col bg-app text-foreground">
    <header class="public-share-chrome sticky top-0 z-20 border-b border-border/50 bg-background/80 backdrop-blur-xl">
      <div
        class="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent"
        aria-hidden="true"
      />
      <div class="mx-auto flex w-full max-w-[90rem] items-center gap-3 px-4 py-3.5 sm:gap-4 sm:px-6 sm:py-4">
        <div class="flex min-w-0 flex-1 items-center gap-3 sm:gap-4">
          <OrganizationLogo
            v-if="orgLogo"
            :src="orgLogo"
            :alt="data?.organization.name ?? 'Organization'"
            size="md"
            bare
            class="h-9 max-w-40 shrink-0 sm:h-10 sm:max-w-48"
          />
          <AppLogo v-else compact />

          <template v-if="data">
            <span class="hidden h-7 w-px shrink-0 bg-border/70 sm:block" aria-hidden="true" />
            <div class="min-w-0 flex-1">
              <div class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
                <span
                  class="inline-flex size-2.5 shrink-0 rounded-full ring-2 ring-background"
                  :style="{ backgroundColor: data.project.color }"
                  aria-hidden="true"
                />
                <p class="truncate text-sm font-semibold tracking-tight sm:text-[15px]">{{ data.project.name }}</p>
                <span class="hidden rounded-md bg-muted/70 px-1.5 py-0.5 font-mono text-[10px] font-medium tracking-wide text-muted-foreground sm:inline">
                  {{ data.project.key }}
                </span>
              </div>
              <p class="mt-0.5 truncate text-xs text-muted-foreground">
                {{ data.organization.name }}
                <template v-if="data.scope === 'board' && data.sprint"> · {{ data.sprint.name }}</template>
              </p>
            </div>
          </template>
        </div>

        <div class="public-share-actions flex shrink-0 items-center gap-2">
          <span
            v-if="accessLabel"
            class="hidden items-center gap-1 rounded-md border border-border/70 bg-card/80 px-2 py-1 text-[11px] font-medium text-muted-foreground sm:inline-flex"
          >
            <Eye class="size-3" />
            {{ accessLabel }}
          </span>
          <ShareProductTour />
          <RouterLink
            to="/login"
            class="inline-flex h-9 shrink-0 items-center justify-center rounded-lg bg-primary px-3.5 text-xs font-semibold text-primary-foreground shadow-soft transition-[transform,box-shadow] hover:-translate-y-px hover:shadow-elevated focus-visible:ring-[3px] focus-visible:ring-ring/30 focus-visible:outline-none sm:px-4"
          >
            Sign in
          </RouterLink>
        </div>
      </div>
    </header>

    <main class="mx-auto w-full max-w-[90rem] flex-1 px-4 py-5 sm:px-6 sm:py-7">
      <div v-if="isLoading" class="space-y-5">
        <div class="space-y-2">
          <Skeleton class="h-4 w-28" />
          <Skeleton class="h-8 w-64" />
          <Skeleton class="h-4 w-48" />
        </div>
        <Skeleton class="h-10 w-full max-w-xl rounded-xl" />
        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Skeleton v-for="n in 4" :key="n" class="h-72 rounded-2xl" />
        </div>
      </div>

      <div
        v-else-if="problem || linkExpired"
        class="mx-auto max-w-md space-y-4 py-20 text-center"
      >
        <div class="mx-auto flex size-12 items-center justify-center overflow-hidden rounded-xl bg-brand text-white shadow-glow">
          <BrandMark class="size-7" />
        </div>
        <div class="space-y-2">
          <p class="text-lg font-semibold tracking-tight">{{ linkExpired ? 'This share has expired' : 'Link unavailable' }}</p>
          <p class="text-sm text-muted-foreground text-pretty">
            {{ linkExpired ? 'The link’s expiry time has passed. Ask the owner for a new share link.' : problem }}
          </p>
        </div>
        <RouterLink
          to="/"
          class="inline-flex h-9 items-center justify-center rounded-lg border border-border bg-card px-4 text-sm font-medium shadow-soft transition-colors hover:bg-muted/50"
        >
          Go to Vector
        </RouterLink>
      </div>

      <div v-else-if="isLocked && data" class="mx-auto max-w-sm space-y-5 py-16">
        <div class="space-y-3 text-center">
          <span class="mx-auto flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/15">
            <Lock class="size-5" />
          </span>
          <div class="space-y-1.5">
            <p class="text-lg font-semibold tracking-tight">Password required</p>
            <p class="text-sm text-muted-foreground text-pretty">
              {{ data.organization.name }} protected this {{ data.scope === 'board' ? 'board' : 'task' }}.
              Enter the password to continue.
            </p>
          </div>
        </div>
        <form class="space-y-3 rounded-2xl border border-border/70 bg-card/90 p-5 shadow-soft" @submit.prevent="unlock">
          <FormField label="Password" for="share-password">
            <Input id="share-password" v-model="unlockPassword" type="password" autocomplete="current-password" required class="h-10" />
          </FormField>
          <p v-if="unlockError" class="text-sm text-destructive">{{ unlockError }}</p>
          <Button type="submit" class="w-full" :disabled="isUnlocking || !unlockPassword">
            {{ isUnlocking ? 'Unlocking…' : 'Unlock' }}
          </Button>
        </form>
      </div>

      <template v-else-if="data?.scope === 'board' && data.columns">
        <header class="relative mb-5 max-w-3xl space-y-1.5 sm:mb-6">
          <div
            class="pointer-events-none absolute -inset-x-6 -top-8 h-28 opacity-90"
            style="background: radial-gradient(70% 120% at 8% 0%, color-mix(in oklch, var(--primary) 14%, transparent), transparent 65%)"
            aria-hidden="true"
          />
          <p class="relative text-[11px] font-medium text-muted-foreground sm:text-xs">
            <span class="text-brand font-semibold">Shared board</span>
            <span class="mx-1.5 text-border">·</span>
            Live view
          </p>
          <h1 class="relative text-balance text-xl font-semibold tracking-tight sm:text-2xl">{{ data.project.name }}</h1>
          <p class="relative text-sm text-muted-foreground">
            {{ totalIssues }} {{ totalIssues === 1 ? 'task' : 'tasks' }} across {{ data.columns.length }}
            {{ data.columns.length === 1 ? 'column' : 'columns' }}
            <span class="hidden sm:inline"> · click a card for details</span>
          </p>
        </header>

        <SharePromoChips
          class="public-share-promo mb-4"
          placement="strip"
          :organization-name="data.organization.name"
          :task-count="totalIssues"
          :access-label="accessLabel"
        />

        <div
          class="share-board-panel overflow-hidden rounded-2xl border border-border/70 bg-background/90 shadow-panel ring-1 ring-border/30 backdrop-blur-[2px]"
        >
          <div
            class="share-board-cols grid gap-0 p-2 sm:gap-2 sm:p-3"
            :style="{ '--col-count': Math.max(data.columns.length, 1) }"
          >
            <section
              v-for="column in data.columns"
              :key="column.status.id"
              class="flex min-w-0 flex-col rounded-xl bg-muted/40"
            >
              <header class="flex items-center gap-2 px-3 pt-3 pb-2">
                <span class="size-2.5 shrink-0 rounded-full" :style="{ backgroundColor: column.status.color }" />
                <h2 class="min-w-0 flex-1 truncate text-sm font-semibold">{{ column.status.name }}</h2>
                <span class="rounded-md bg-background/80 px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground tabular-nums ring-1 ring-border/50">
                  {{ column.issues.length }}
                </span>
              </header>

              <div class="flex flex-1 flex-col gap-2 px-2 pb-2.5">
                <button
                  v-for="issue in column.issues"
                  :key="issue.id"
                  type="button"
                  class="share-card group relative w-full overflow-hidden rounded-[10px] border bg-card px-3 py-2.5 text-left outline-none"
                  :class="isOverdue(issue) ? 'border-destructive/45' : 'border-border/90'"
                  :aria-label="`Open ${issue.key} ${issue.title}`"
                  @click="openTicket(issue)"
                >
                  <div class="mb-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <IssueTypeIcon :type="issue.type" class="opacity-90" />
                    <span class="font-medium tracking-tight tabular-nums">{{ issue.key }}</span>
                    <span class="ml-auto flex items-center gap-1">
                      <CircleCheck v-if="issue.status?.category === 'done'" class="size-3.5 text-success" aria-label="Done" />
                      <PriorityIcon :priority="issue.priority" />
                    </span>
                  </div>

                  <p class="line-clamp-3 text-[13px] leading-snug font-medium text-foreground">{{ issue.title }}</p>

                  <div v-if="issue.labels.length" class="mt-2 flex flex-wrap gap-1">
                    <LabelChip v-for="label in issue.labels.slice(0, 3)" :key="label.id" :label="label" />
                    <span v-if="issue.labels.length > 3" class="text-[11px] text-muted-foreground">+{{ issue.labels.length - 3 }}</span>
                  </div>

                  <div class="mt-2.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <DueDateBadge
                      v-if="issue.dueDate"
                      :due-date="issue.dueDate"
                      :done="issue.status?.category === 'done'"
                      compact
                    />
                    <span v-if="issue.subtaskProgress.total" class="inline-flex items-center gap-1 tabular-nums">
                      <CircleCheck class="size-3" />
                      {{ issue.subtaskProgress.done }}/{{ issue.subtaskProgress.total }}
                    </span>
                    <span v-if="issue.commentCount" class="inline-flex items-center gap-0.5 tabular-nums">
                      <MessageSquare class="size-3" />
                      {{ issue.commentCount }}
                    </span>
                    <span v-if="issue.attachmentCount" class="inline-flex items-center gap-0.5 tabular-nums">
                      <Paperclip class="size-3" />
                      {{ issue.attachmentCount }}
                    </span>
                    <UserAvatar
                      v-if="issue.assignee"
                      class="ml-auto"
                      :user="{ ...issue.assignee, email: '' }"
                      size="sm"
                      show-tooltip
                    />
                  </div>
                </button>

                <p v-if="!column.issues.length" class="px-2 py-10 text-center text-xs text-muted-foreground">No tasks</p>
              </div>
            </section>
          </div>
        </div>

        <PublicShareIssueSheet v-model="sheetOpen" :token="token" :issue-id="openIssueId" />
      </template>

      <template v-else-if="data?.scope === 'issue' && data.issue">
        <div class="mx-auto max-w-2xl">
          <header class="relative mb-5 space-y-1.5">
            <div
              class="pointer-events-none absolute -inset-x-6 -top-8 h-28 opacity-90"
              style="background: radial-gradient(70% 120% at 10% 0%, color-mix(in oklch, var(--primary) 14%, transparent), transparent 65%)"
              aria-hidden="true"
            />
            <p class="relative text-[11px] font-medium text-muted-foreground sm:text-xs">
              <span class="text-brand font-semibold">Shared task</span>
              <span class="mx-1.5 text-border">·</span>
              {{ data.organization.name }}
            </p>
          </header>

          <SharePromoChips
            class="public-share-promo mb-4"
            placement="strip"
            :organization-name="data.organization.name"
            :access-label="accessLabel"
          />

          <div class="overflow-hidden rounded-2xl border border-border/70 bg-card/95 p-5 shadow-panel ring-1 ring-border/30 sm:p-7">
            <PublicIssueDetail
              :token="token"
              :issue="data.issue"
              :guest-comments-enabled="data.guestCommentsEnabled"
              :comments="data.comments"
            />
          </div>
        </div>
      </template>
    </main>

    <footer class="public-share-chrome border-t border-border/50 bg-background/70 px-4 py-4 backdrop-blur-md sm:px-6">
      <div class="mx-auto flex w-full max-w-[90rem] flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
        <RouterLink to="/" class="inline-flex items-center gap-2 font-medium text-foreground/80 transition-colors hover:text-foreground">
          <span class="relative flex size-5 items-center justify-center overflow-hidden rounded-[5px] bg-brand text-white shadow-glow">
            <BrandMark class="relative size-3.5" />
          </span>
          <span>Powered by <span class="text-brand">Vector</span></span>
        </RouterLink>
        <p class="text-muted-foreground/80">Work management for every team</p>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.share-board-cols {
  grid-template-columns: minmax(0, 1fr);
}
@media (min-width: 640px) {
  .share-board-cols {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (min-width: 1024px) {
  .share-board-cols {
    grid-template-columns: repeat(var(--col-count, 4), minmax(0, 1fr));
  }
}

.share-card {
  box-shadow:
    0 1px 2px oklch(0 0 0 / 0.04),
    0 0 0 1px color-mix(in oklch, var(--border) 55%, transparent);
  transition:
    transform var(--motion-base, 180ms) var(--ease-out-soft, ease),
    box-shadow var(--motion-base, 180ms) var(--ease-out-soft, ease),
    border-color var(--motion-fast, 120ms) ease;
}
.share-card:hover {
  z-index: 1;
  border-color: color-mix(in oklch, var(--primary) 28%, var(--border));
  box-shadow: var(--shadow-elevated);
  transform: translateY(-2px);
}
.share-card:focus-visible {
  border-color: color-mix(in oklch, var(--ring) 55%, var(--border));
  box-shadow:
    var(--shadow-soft),
    0 0 0 3px color-mix(in oklch, var(--ring) 28%, transparent);
}
@media (prefers-reduced-motion: reduce) {
  .share-card,
  .share-card:hover {
    transition: none;
    transform: none;
  }
}

/* Screenshot / print: drop promo chrome, keep the board crisp. */
@media print {
  .public-share {
    background: white !important;
  }
  .public-share-chrome,
  .public-share-promo,
  .public-share-actions {
    display: none !important;
  }
  .share-board-panel,
  .share-card {
    box-shadow: none !important;
    break-inside: avoid;
  }
}
</style>

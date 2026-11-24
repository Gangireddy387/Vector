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
  <div
    class="min-h-dvh bg-[radial-gradient(1200px_600px_at_10%_-10%,oklch(0.92_0.04_250),transparent),radial-gradient(900px_500px_at_90%_0%,oklch(0.93_0.03_180),transparent)] bg-background text-foreground"
  >
    <header class="sticky top-0 z-20 border-b border-border/50 bg-background/75 shadow-[0_1px_0_oklch(0_0_0/0.03)] backdrop-blur-xl">
      <div class="mx-auto flex w-full max-w-none items-center gap-3 px-3 py-3.5 sm:gap-4 sm:px-4 sm:py-4 lg:px-5">
        <div class="flex min-w-0 flex-1 items-center gap-3 sm:gap-4">
          <OrganizationLogo
            v-if="orgLogo"
            :src="orgLogo"
            :alt="data?.organization.name ?? 'Organization'"
            size="md"
            bare
            class="h-10 max-w-44 shrink-0 sm:h-11 sm:max-w-52"
          />
          <AppLogo v-else compact />

          <template v-if="data">
            <span class="hidden h-8 w-px shrink-0 bg-border/80 sm:block" aria-hidden="true" />
            <div class="min-w-0 flex-1">
              <div class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                <span
                  class="inline-flex size-2.5 shrink-0 rounded-full ring-2 ring-background"
                  :style="{ backgroundColor: data.project.color }"
                  aria-hidden="true"
                />
                <h1 class="truncate text-sm font-semibold tracking-tight sm:text-[15px]">{{ data.project.name }}</h1>
                <span class="hidden rounded-md bg-muted/80 px-1.5 py-0.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase sm:inline">
                  {{ data.project.key }}
                </span>
              </div>
              <div class="mt-1 flex min-w-0 flex-wrap items-center gap-1.5">
                <span class="truncate text-xs text-muted-foreground">Shared by {{ data.organization.name }}</span>
                <span
                  v-if="data.scope === 'board' && data.sprint"
                  class="inline-flex items-center rounded-full border border-border/70 bg-card px-2 py-0.5 text-[11px] font-medium text-foreground/80"
                >
                  {{ data.sprint.name }}
                </span>
                <span
                  v-if="accessLabel"
                  class="inline-flex items-center gap-1 rounded-full border border-sky-500/20 bg-sky-500/10 px-2 py-0.5 text-[11px] font-medium text-sky-700 dark:text-sky-300"
                >
                  <Eye class="size-3" />
                  {{ accessLabel }}
                </span>
              </div>
            </div>
          </template>
        </div>

        <div class="flex shrink-0 items-center gap-2">
          <ShareProductTour />
          <RouterLink
            to="/login"
            class="inline-flex h-9 shrink-0 items-center justify-center rounded-full bg-primary px-4 text-xs font-semibold text-primary-foreground shadow-soft transition-[transform,box-shadow] hover:-translate-y-px hover:shadow-elevated focus-visible:ring-[3px] focus-visible:ring-ring/30 focus-visible:outline-none"
          >
            Sign in
          </RouterLink>
        </div>
      </div>
    </header>

    <main class="mx-auto w-full max-w-none px-3 py-5 sm:px-4 sm:py-6 lg:px-5">
      <div v-if="isLoading" class="space-y-4">
        <Skeleton class="h-8 w-64" />
        <div class="flex gap-3 overflow-hidden">
          <Skeleton v-for="n in 4" :key="n" class="h-80 w-72 shrink-0 rounded-2xl" />
        </div>
      </div>

      <div v-else-if="problem || linkExpired" class="mx-auto max-w-md space-y-3 py-16 text-center">
        <p class="text-lg font-semibold">{{ linkExpired ? 'This share has expired' : 'Link unavailable' }}</p>
        <p class="text-sm text-muted-foreground">
          {{ linkExpired ? 'The link’s expiry time has passed. Ask the owner for a new share link.' : problem }}
        </p>
        <RouterLink to="/login" class="inline-block text-sm font-medium underline-offset-2 hover:underline">Go to Vector</RouterLink>
      </div>

      <div v-else-if="isLocked && data" class="mx-auto max-w-sm space-y-4 py-12">
        <div class="space-y-2 text-center">
          <span class="mx-auto flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Lock class="size-5" />
          </span>
          <p class="text-lg font-semibold">Password required</p>
          <p class="text-sm text-muted-foreground">
            {{ data.organization.name }} protected this {{ data.scope === 'board' ? 'board' : 'task' }}. Enter the password to continue.
          </p>
        </div>
        <form class="space-y-3" @submit.prevent="unlock">
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
        <div class="mb-3">
          <h1 class="text-base font-semibold sm:text-lg">Board</h1>
          <p class="text-sm text-muted-foreground">
            {{ totalIssues }} {{ totalIssues === 1 ? 'task' : 'tasks' }} · click a card to open details
          </p>
        </div>

        <div class="mb-4 lg:hidden">
          <SharePromoChips
            placement="strip"
            :organization-name="data.organization.name"
            :task-count="totalIssues"
            :access-label="accessLabel"
          />
        </div>

        <div class="grid grid-cols-1 gap-3 lg:grid-cols-[9.5rem_minmax(0,1fr)_9.5rem] lg:items-start lg:gap-3">
          <SharePromoChips
            placement="left"
            :organization-name="data.organization.name"
            :task-count="totalIssues"
            :access-label="accessLabel"
          />

          <div
            class="share-board-cols grid gap-3"
            :style="{ '--col-count': Math.max(data.columns.length, 1) }"
          >
            <section
              v-for="column in data.columns"
              :key="column.status.id"
              class="flex min-w-0 flex-col rounded-2xl border border-border/60 bg-muted/35"
            >
              <header class="flex items-center gap-2 px-3 pt-3 pb-2">
                <span class="size-2.5 shrink-0 rounded-full" :style="{ backgroundColor: column.status.color }" />
                <h2 class="min-w-0 flex-1 truncate text-sm font-semibold">{{ column.status.name }}</h2>
                <span class="rounded-full bg-background/80 px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground tabular-nums">
                  {{ column.issues.length }}
                </span>
              </header>

              <div class="flex flex-1 flex-col gap-2 px-2 pb-2">
                <button
                  v-for="issue in column.issues"
                  :key="issue.id"
                  type="button"
                  class="group relative w-full rounded-lg border bg-card px-3 py-2.5 text-left shadow-[0_1px_2px_oklch(0_0_0/0.05)] transition-[box-shadow,border-color,transform] duration-150 hover:-translate-y-px hover:border-input hover:shadow-[0_6px_16px_-6px_oklch(0_0_0/0.18)] focus-visible:ring-[3px] focus-visible:ring-ring/30 focus-visible:outline-none"
                  :class="isOverdue(issue) ? 'border-destructive/40' : 'border-border'"
                  :aria-label="`Open ${issue.key} ${issue.title}`"
                  @click="openTicket(issue)"
                >
                  <div class="mb-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <IssueTypeIcon :type="issue.type" />
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

                  <div class="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
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

                <p v-if="!column.issues.length" class="px-2 py-8 text-center text-xs text-muted-foreground">No tasks</p>
              </div>
            </section>
          </div>

          <SharePromoChips
            placement="right"
            :organization-name="data.organization.name"
            :task-count="totalIssues"
            :access-label="accessLabel"
          />
        </div>

        <PublicShareIssueSheet v-model="sheetOpen" :token="token" :issue-id="openIssueId" />
      </template>

      <template v-else-if="data?.scope === 'issue' && data.issue">
        <div class="mx-auto max-w-2xl rounded-2xl border border-border/70 bg-card/95 p-5 shadow-soft sm:p-7">
          <PublicIssueDetail
            :token="token"
            :issue="data.issue"
            :guest-comments-enabled="data.guestCommentsEnabled"
            :comments="data.comments"
          />
        </div>
      </template>

    </main>
  </div>
</template>

<style scoped>
/* Fit columns to the available width — no sideways scroll when they can share the row. */
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
@media (min-width: 1024px) and (max-width: 1279px) {
  /* With side chips, keep columns readable if there are many statuses. */
  .share-board-cols {
    grid-template-columns: repeat(auto-fit, minmax(12.5rem, 1fr));
  }
}
</style>

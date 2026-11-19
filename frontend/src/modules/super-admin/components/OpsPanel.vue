<script setup lang="ts">
import { Activity, AlertTriangle, CheckCircle2, CreditCard, RefreshCw, Server, Workflow } from 'lucide-vue-next'
import { onMounted, ref } from 'vue'
import { toast } from 'vue-sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDateTime, timeAgo } from '@/lib/format'
import { getErrorMessage } from '@/lib/http'
import { type OpsStatus, superAdminApi } from '../super-admin.api'

const ops = ref<OpsStatus | null>(null)
const loading = ref(false)

async function load() {
  loading.value = true
  try {
    ops.value = await superAdminApi.ops()
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    loading.value = false
  }
}

onMounted(load)

function formatUptime(seconds: number) {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (hours >= 48) return `${Math.floor(hours / 24)}d ${hours % 24}h`
  if (hours) return `${hours}h ${minutes}m`
  return `${minutes}m`
}
</script>

<template>
  <section class="space-y-4 sm:space-y-5">
    <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <p class="max-w-2xl text-[13px] text-muted-foreground sm:text-sm">
        Stripe webhooks, background jobs and automation failures for this backend process. Counters reset on restart; automation rule errors also live in the database.
      </p>
      <Button variant="outline" size="sm" class="shrink-0 max-sm:w-full" :loading="loading" @click="load">
        <RefreshCw /> Refresh
      </Button>
    </div>

    <div v-if="!ops" class="grid gap-3 sm:grid-cols-3">
      <Skeleton v-for="index in 3" :key="index" class="h-28 rounded-xl" />
    </div>

    <template v-else>
      <div class="grid gap-3 sm:grid-cols-3">
        <article class="rounded-xl border bg-card p-4 shadow-soft" :class="ops.summary.healthy ? 'border-success/30' : 'border-destructive/40'">
          <div class="flex items-center gap-2 text-sm font-medium">
            <CheckCircle2 v-if="ops.summary.healthy" class="size-4 text-success" />
            <AlertTriangle v-else class="size-4 text-destructive" />
            {{ ops.summary.healthy ? 'All clear' : 'Needs attention' }}
          </div>
          <p class="mt-2 text-xs text-muted-foreground">{{ ops.process.scope }}</p>
          <p class="mt-1 text-xs text-muted-foreground">
            Uptime {{ formatUptime(ops.process.uptimeSec) }} · shared state {{ ops.process.sharedState }}
            <template v-if="ops.process.sharedState === 'redis'"> · Redis {{ ops.process.redisOk ? 'ok' : 'down' }}</template>
          </p>
        </article>

        <article class="rounded-xl border border-border/80 bg-card p-4 shadow-soft">
          <div class="flex items-center gap-2 text-sm font-medium"><CreditCard class="size-4 text-primary" /> Stripe webhooks</div>
          <p class="mt-2 text-2xl font-semibold tabular-nums" :class="ops.summary.stripeWebhookFailures ? 'text-destructive' : 'text-foreground'">
            {{ ops.summary.stripeWebhookFailures }}
            <span class="text-sm font-normal text-muted-foreground">failures</span>
          </p>
          <p class="mt-1 text-xs text-muted-foreground">
            <template v-if="!ops.stripe.configured">Checkout not configured on this server.</template>
            <template v-else-if="ops.stripe.webhook.lastFailedAt">Last fail {{ timeAgo(ops.stripe.webhook.lastFailedAt) }}</template>
            <template v-else-if="ops.stripe.webhook.lastOkAt">Last ok {{ timeAgo(ops.stripe.webhook.lastOkAt) }}</template>
            <template v-else>No webhooks received since start.</template>
          </p>
          <p v-if="ops.stripe.webhook.lastError" class="mt-2 text-xs text-destructive">{{ ops.stripe.webhook.lastError }}</p>
        </article>

        <article class="rounded-xl border border-border/80 bg-card p-4 shadow-soft">
          <div class="flex items-center gap-2 text-sm font-medium"><Server class="size-4 text-primary" /> Background jobs</div>
          <p class="mt-2 text-2xl font-semibold tabular-nums" :class="ops.summary.jobFailures ? 'text-destructive' : 'text-foreground'">
            {{ ops.summary.jobFailures }}
            <span class="text-sm font-normal text-muted-foreground">failures</span>
          </p>
          <p class="mt-1 text-xs text-muted-foreground">
            {{ ops.jobs.enabled ? `${Object.keys(ops.jobs.byName).length || 'No'} job(s) recorded this process` : 'JOBS_ENABLED=false' }}
          </p>
        </article>
      </div>

      <article class="rounded-xl border border-border/80 bg-card p-4 shadow-soft">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex items-center gap-2 text-sm font-medium"><Workflow class="size-4 text-primary" /> Automation rules with errors</div>
          <Badge :variant="ops.automations.rulesWithErrors ? 'destructive' : 'secondary'">{{ ops.automations.rulesWithErrors }}</Badge>
        </div>
        <ul v-if="ops.automations.failing.length" class="mt-3 space-y-2 border-t border-border/60 pt-3 text-sm">
          <li v-for="rule in ops.automations.failing" :key="rule.id" class="flex flex-col gap-0.5">
            <span class="font-medium">
              {{ rule.name }}
              <span v-if="rule.project" class="font-normal text-muted-foreground">· {{ rule.project.key }}</span>
            </span>
            <span class="text-xs text-destructive">{{ rule.lastError }}</span>
            <span v-if="rule.lastRunAt" class="text-xs text-muted-foreground">{{ formatDateTime(rule.lastRunAt) }}</span>
          </li>
        </ul>
        <p v-else class="mt-2 text-xs text-muted-foreground">No rules currently storing a lastError.</p>
      </article>

      <article v-if="ops.jobs.unhealthy.length" class="rounded-xl border border-destructive/30 bg-card p-4 shadow-soft">
        <div class="flex items-center gap-2 text-sm font-medium text-destructive"><AlertTriangle class="size-4" /> Jobs last failed</div>
        <ul class="mt-3 space-y-2 text-sm">
          <li v-for="job in ops.jobs.unhealthy" :key="job.name">
            <span class="font-medium">{{ job.name }}</span>
            <span class="text-xs text-destructive"> — {{ job.lastError }}</span>
          </li>
        </ul>
      </article>

      <article class="rounded-xl border border-border/80 bg-card p-4 shadow-soft">
        <div class="flex items-center gap-2 text-sm font-medium"><Activity class="size-4 text-primary" /> Recent signals</div>
        <ul v-if="ops.recent.length" class="mt-3 max-h-64 space-y-1.5 overflow-y-auto text-xs">
          <li v-for="(entry, index) in ops.recent" :key="`${entry.at}-${index}`" class="flex flex-wrap gap-x-2">
            <span class="tabular-nums text-muted-foreground">{{ formatDateTime(entry.at) }}</span>
            <Badge :variant="entry.ok ? 'secondary' : 'destructive'" class="px-1.5 py-0">{{ entry.ok ? 'ok' : 'fail' }}</Badge>
            <span>{{ entry.area }}/{{ entry.name }}</span>
            <span v-if="entry.error" class="text-destructive">{{ entry.error }}</span>
          </li>
        </ul>
        <p v-else class="mt-2 text-xs text-muted-foreground">Nothing recorded since this process started.</p>
      </article>
    </template>
  </section>
</template>

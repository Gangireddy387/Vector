<script setup lang="ts">
import { Code2, KeyRound } from 'lucide-vue-next'
import { RouterLink } from 'vue-router'
import PageHeader from '@/components/common/PageHeader.vue'
import { Button } from '@/components/ui/button'

const curl = `curl -s https://your-vector.example/api/issues \\\\
  -H "Authorization: Bearer vtk_…" \\\\
  -H "X-Organization-Id: <org-uuid>"`
</script>

<template>
  <div class="mx-auto w-full max-w-[90rem] space-y-8 p-4 sm:p-6 lg:p-8">
    <PageHeader
      title="Developers"
      description="Call Vector with a personal API token. Same APIs the app uses — scoped to your organization."
    >
      <template #actions>
        <Button variant="outline" as-child><RouterLink :to="{ name: 'pricing' }">Pricing</RouterLink></Button>
        <Button as-child><RouterLink :to="{ name: 'register' }">Create account</RouterLink></Button>
      </template>
    </PageHeader>

    <section class="space-y-3 rounded-xl border bg-card p-5 shadow-soft">
      <h2 class="flex items-center gap-2 text-sm font-semibold"><KeyRound class="size-4" /> Personal access tokens</h2>
      <ol class="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
        <li>Sign in → <strong class="text-foreground">Settings → Security → API tokens</strong>.</li>
        <li>Create a token. Copy the <code class="rounded bg-muted px-1 py-0.5 text-[11px] text-foreground">vtk_…</code> value once.</li>
        <li>Send it as <code class="rounded bg-muted px-1 py-0.5 text-[11px] text-foreground">Authorization: Bearer vtk_…</code>.</li>
        <li>Add <code class="rounded bg-muted px-1 py-0.5 text-[11px] text-foreground">X-Organization-Id</code> when you belong to more than one org.</li>
      </ol>
    </section>

    <section class="space-y-3 rounded-xl border bg-card p-5 shadow-soft">
      <h2 class="flex items-center gap-2 text-sm font-semibold"><Code2 class="size-4" /> Quickstart</h2>
      <p class="text-sm text-muted-foreground">List issues in the current organization:</p>
      <pre class="overflow-x-auto rounded-lg bg-muted/50 p-3 text-xs leading-relaxed whitespace-pre-wrap break-all">{{ curl }}</pre>
      <p class="text-sm text-muted-foreground">
        Create: <code class="rounded bg-muted px-1 py-0.5 text-[11px]">POST /api/issues</code> with
        <code class="rounded bg-muted px-1 py-0.5 text-[11px]">{ projectId, title }</code>.
        Automations can also <strong class="text-foreground">Send webhook</strong> to your systems.
      </p>
    </section>

    <section class="space-y-2 rounded-xl border bg-card p-5 shadow-soft text-sm text-muted-foreground">
      <h2 class="text-sm font-semibold text-foreground">Conventions</h2>
      <ul class="list-disc space-y-1.5 pl-5">
        <li>Base path <code class="rounded bg-muted px-1 py-0.5 text-[11px] text-foreground">/api</code>, JSON in and out.</li>
        <li>Validation errors return <code class="rounded bg-muted px-1 py-0.5 text-[11px]">400</code> with field details.</li>
        <li>Full module map lives in the repo at <code class="rounded bg-muted px-1 py-0.5 text-[11px]">docs/API.md</code>.</li>
      </ul>
      <div class="flex flex-wrap gap-2 pt-2">
        <Button variant="outline" size="sm" as-child><RouterLink :to="{ name: 'login' }">Sign in to create a token</RouterLink></Button>
        <Button variant="ghost" size="sm" as-child><RouterLink :to="{ name: 'pricing' }">Plans</RouterLink></Button>
      </div>
    </section>
  </div>
</template>

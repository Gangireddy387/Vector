<script setup lang="ts">
import { CheckCircle2 } from 'lucide-vue-next'
import { computed, onMounted, reactive, ref } from 'vue'
import { RouterLink } from 'vue-router'
import AppLogo from '@/components/layout/AppLogo.vue'
import FormField from '@/components/common/FormField.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { SelectField } from '@/components/forms'
import { assetUrl, getErrorMessage } from '@/lib/http'
import type { IssuePriority } from '@/types/models'
import { intakeApi, type IntakeSubmissionResult, type PublicIntakeForm } from '../intake.api'

const props = defineProps<{ token: string }>()

const form = ref<PublicIntakeForm | null>(null)
const problem = ref<string | null>(null)
const isLoading = ref(true)
const isSubmitting = ref(false)
const result = ref<IntakeSubmissionResult | null>(null)
const submitError = ref('')
const draft = reactive({
  name: '',
  email: '',
  title: '',
  description: '',
  priority: 'medium' as IssuePriority,
  company: '',
})

const orgLogo = computed(() => assetUrl(form.value?.organization.logoUrl))
const priorityOptions = computed(() =>
  (form.value?.fields.priorities ?? []).map((value) => ({
    value,
    label: value.charAt(0).toUpperCase() + value.slice(1),
  })),
)

onMounted(async () => {
  try {
    form.value = await intakeApi.publicForm(props.token)
    draft.priority = form.value.fields.defaultPriority
  } catch (error) {
    problem.value = getErrorMessage(error, 'This request form does not work.')
  } finally {
    isLoading.value = false
  }
})

async function submit() {
  if (!form.value) return
  submitError.value = ''
  isSubmitting.value = true
  try {
    result.value = await intakeApi.submit(props.token, {
      name: draft.name.trim(),
      email: draft.email.trim(),
      title: draft.title.trim(),
      description: form.value.fields.askDescription ? draft.description.trim() || undefined : undefined,
      priority: form.value.fields.askPriority ? draft.priority : undefined,
      company: draft.company,
    })
  } catch (error) {
    submitError.value = getErrorMessage(error)
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <div class="min-h-dvh bg-[radial-gradient(900px_500px_at_10%_-10%,oklch(0.92_0.04_250),transparent),radial-gradient(700px_400px_at_90%_0%,oklch(0.93_0.03_180),transparent)] bg-background text-foreground">
    <header class="border-b border-border/60 bg-background/80 backdrop-blur-md">
      <div class="mx-auto flex max-w-xl items-center gap-3 px-4 py-3 sm:px-6">
        <AppLogo compact />
        <div v-if="form" class="min-w-0 flex-1">
          <p class="truncate text-sm font-semibold">
            <span class="mr-1.5 inline-block size-2.5 rounded-full align-middle" :style="{ backgroundColor: form.project.color }" />
            {{ form.project.name }}
          </p>
          <p class="truncate text-xs text-muted-foreground">{{ form.organization.name }} · Request form</p>
        </div>
        <RouterLink to="/login" class="text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">Sign in</RouterLink>
      </div>
    </header>

    <main class="mx-auto max-w-xl px-4 py-8 sm:px-6">
      <div v-if="isLoading" class="space-y-3">
        <Skeleton class="h-8 w-2/3" />
        <Skeleton class="h-24 w-full" />
        <Skeleton class="h-40 w-full" />
      </div>

      <div v-else-if="problem" class="space-y-3 py-12 text-center">
        <p class="text-lg font-semibold">Form unavailable</p>
        <p class="text-sm text-muted-foreground">{{ problem }}</p>
        <RouterLink to="/login" class="inline-block text-sm font-medium underline-offset-2 hover:underline">Go to Vector</RouterLink>
      </div>

      <div v-else-if="result" class="space-y-4 rounded-2xl border border-border/70 bg-card/90 p-6 text-center shadow-sm">
        <CheckCircle2 class="mx-auto size-10 text-success" />
        <h1 class="text-xl font-semibold">Request received</h1>
        <p class="text-sm text-muted-foreground">
          Thank you. Your request was logged as <span class="font-medium text-foreground">{{ result.key }}</span>
          in {{ result.project.name }}.
        </p>
        <p class="text-xs text-muted-foreground">The team will follow up using the email you provided.</p>
      </div>

      <form v-else-if="form" class="space-y-5 rounded-2xl border border-border/70 bg-card/90 p-5 shadow-sm sm:p-7" @submit.prevent="submit">
        <div class="space-y-2">
          <h1 class="text-2xl font-semibold tracking-tight text-balance">{{ form.title }}</h1>
          <p v-if="form.intro" class="text-sm text-muted-foreground whitespace-pre-wrap">{{ form.intro }}</p>
        </div>

        <div class="grid gap-4 sm:grid-cols-2">
          <FormField label="Your name" for="intake-name">
            <Input id="intake-name" v-model="draft.name" required autocomplete="name" minlength="2" maxlength="80" />
          </FormField>
          <FormField label="Email" for="intake-email">
            <Input id="intake-email" v-model="draft.email" type="email" required autocomplete="email" maxlength="190" />
          </FormField>
        </div>

        <FormField label="Title" for="intake-title">
          <Input id="intake-title" v-model="draft.title" required minlength="3" maxlength="255" placeholder="Short summary of the request" />
        </FormField>

        <FormField v-if="form.fields.askDescription" label="Details" for="intake-description" optional>
          <Textarea id="intake-description" v-model="draft.description" rows="5" maxlength="10000" placeholder="What should the team know?" />
        </FormField>

        <FormField v-if="form.fields.askPriority" label="Priority" for="intake-priority">
          <SelectField v-model="draft.priority" :options="priorityOptions" aria-label="Priority" />
        </FormField>

        <!-- Honeypot for bots -->
        <input v-model="draft.company" type="text" tabindex="-1" autocomplete="off" class="absolute -left-[9999px] h-0 w-0 opacity-0" aria-hidden="true" />

        <p v-if="submitError" class="text-sm text-destructive" role="alert">{{ submitError }}</p>
        <Button type="submit" class="w-full sm:w-auto" :loading="isSubmitting">Submit request</Button>
      </form>

      <footer v-if="form && !result" class="mt-8 flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <img v-if="orgLogo" :src="orgLogo" alt="" class="size-5 rounded object-cover" />
        <span>Shared from {{ form.organization.name }} · Powered by Vector</span>
      </footer>
    </main>
  </div>
</template>

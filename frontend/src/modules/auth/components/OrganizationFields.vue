<script setup lang="ts">
import { useDebounceFn } from '@vueuse/core'
import { CircleAlert, CircleCheck, LoaderCircle } from 'lucide-vue-next'
import { ref, watch } from 'vue'
import FormField from '@/components/common/FormField.vue'
import { Input } from '@/components/ui/input'
import { organizationsApi, type SlugCheck } from '../auth.api'
import { organizationAddress, slugify } from '../organization-slug'

/** Organization name plus its address (/o/:slug), suggested from the name and checked while typing. */
const props = defineProps<{ errors?: Record<string, string>; autofocus?: boolean; currentSlug?: string }>()
const name = defineModel<string>('name', { required: true })
const slug = defineModel<string>('slug', { required: true })
const available = defineModel<boolean>('available', { default: false })

const slugEdited = ref(Boolean(slug.value))
const check = ref<SlugCheck | null>(null)
const isChecking = ref(false)

const runCheck = useDebounceFn(async (value: string) => {
  if (value.length < 3) {
    check.value = { slug: value, available: false, suggestion: null, reason: 'Use at least 3 characters' }
    available.value = false
    isChecking.value = false
    return
  }
  try {
    const result = await organizationsApi.checkSlug(value)
    if (slug.value !== value) return
    // Keeping your own current address is always fine.
    check.value = value === props.currentSlug ? { ...result, available: true, reason: null } : result
    available.value = check.value.available
  } catch {
    check.value = null
    available.value = true
  } finally {
    if (slug.value === value) isChecking.value = false
  }
}, 300)

watch(
  name,
  (value) => {
    if (!slugEdited.value) slug.value = slugify(value)
  },
  { immediate: true },
)
watch(
  slug,
  (value) => {
    available.value = false
    if (!value) {
      check.value = null
      return
    }
    isChecking.value = true
    void runCheck(value)
  },
  { immediate: true },
)

function onSlugInput(event: Event) {
  slugEdited.value = true
  const input = event.target as HTMLInputElement
  slug.value = input.value.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40)
}
</script>

<template>
  <div class="space-y-4">
    <FormField label="Organization name" for="organization-name" :error="errors?.organizationName ?? errors?.name" hint="Usually your company or team name.">
      <Input id="organization-name" v-model="name" autocomplete="organization" placeholder="Acme Inc." maxlength="80" :autofocus="autofocus" required />
    </FormField>

    <FormField label="Organization URL" for="organization-slug" :error="errors?.organizationSlug ?? errors?.slug">
      <div class="flex items-stretch border border-input bg-card shadow-xs transition focus-within:border-ring focus-within:ring-4 focus-within:ring-ring/15">
        <span class="flex max-w-[55%] items-center truncate border-r bg-muted/50 px-2.5 text-sm text-muted-foreground select-none" :title="organizationAddress('')">
          {{ organizationAddress('') }}
        </span>
        <input
          id="organization-slug"
          :value="slug"
          class="h-9 min-w-0 flex-1 bg-transparent px-2.5 text-sm font-medium outline-none placeholder:text-muted-foreground"
          placeholder="acme"
          autocomplete="off"
          spellcheck="false"
          maxlength="40"
          required
          aria-describedby="organization-slug-status"
          @input="onSlugInput"
        />
        <span class="flex w-9 items-center justify-center" aria-hidden="true">
          <LoaderCircle v-if="isChecking" class="size-4 animate-spin text-muted-foreground" />
          <CircleCheck v-else-if="check?.available" class="size-4 text-success" />
          <CircleAlert v-else-if="check" class="size-4 text-destructive" />
        </span>
      </div>
      <p id="organization-slug-status" class="min-h-4 text-xs" aria-live="polite">
        <template v-if="!errors?.organizationSlug && !errors?.slug">
          <span v-if="isChecking" class="text-muted-foreground">Checking availability…</span>
          <span v-else-if="check?.available && slug === currentSlug" class="text-muted-foreground">{{ organizationAddress(slug) }} is the current address</span>
          <span v-else-if="check?.available" class="text-success">{{ organizationAddress(slug) }} is yours to take</span>
          <span v-else-if="check" class="text-destructive">
            {{ check.reason }}.
            <button
              v-if="check.suggestion"
              type="button"
              class="font-medium text-primary underline-offset-2 hover:underline"
              @click="
                slugEdited = true;
                slug = check.suggestion
              "
            >
              Use “{{ check.suggestion }}”
            </button>
          </span>
          <span v-else class="text-muted-foreground">Lowercase letters, numbers and hyphens.</span>
        </template>
      </p>
    </FormField>
  </div>
</template>

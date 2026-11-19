<script setup lang="ts">
/** Prefer `DateField` in new UI — same control as `DatePicker`. */
import DatePicker from './DatePicker.vue'

defineOptions({ inheritAttrs: false })
</script>

<template>
  <DatePicker v-bind="$attrs" />
</template>

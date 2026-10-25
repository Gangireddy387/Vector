<script setup lang="ts">
/**
 * The Vector mark: a "V" whose right stroke is an arrow pointing up and forward.
 * Drawn in currentColor so it adapts to any tile or background; same geometry as public/logo.svg.
 */
defineProps<{ class?: string }>()
</script>

<template>
  <svg viewBox="84 84 344 344" :class="$props.class" aria-hidden="true">
    <g transform="translate(0 16)" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
      <path d="M128 128 L240 368" stroke-width="56" stroke-opacity="0.55" />
      <path d="M240 368 L352.4 169.6" stroke-width="56" />
      <path d="M403.7 79.2 L406.3 200.2 L298.5 139 Z" fill="currentColor" stroke-width="18" />
    </g>
  </svg>
</template>

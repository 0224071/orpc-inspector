<script setup lang="ts">
import { t } from './i18n'

/** Toggle next to a section title: include this section in the copied report */
const included = defineModel<boolean>({ required: true })
</script>

<template>
  <button
    class="copy-toggle inline-flex items-center rounded-sm p-0.5 text-muted opacity-60 [border:0] hover:bg-border hover:opacity-100 aria-pressed:text-key aria-pressed:opacity-100"
    type="button"
    :aria-pressed="included"
    :title="included ? t('copyToggle.included') : t('copyToggle.excluded')"
    @click="included = !included"
  >
    <svg
      aria-hidden="true"
      fill="none"
      height="14"
      stroke="currentColor"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="2"
      viewBox="0 0 24 24"
      width="14"
    >
      <rect height="14" rx="2" width="14" x="8" y="8" />
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
      <path v-if="!included" d="M2 22 22 2" />
    </svg>
  </button>
</template>

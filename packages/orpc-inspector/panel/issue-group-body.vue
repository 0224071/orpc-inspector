<script setup lang="ts">
import type { IssueGroup } from './group-issues'
import { t } from './i18n'

/**
 * Path, message and count of one issue group; the list item around it decides whether it is a link.
 * Renders two root nodes and no single root element, so it takes no class, style or other attributes.
 */
defineProps<{ group: IssueGroup }>()
</script>

<template>
  <code class="font-mono text-(--tone)">{{ group.path }}</code>
  <span class="message flex-1" :title="group.translatedMessage ? t('issues.original', { message: group.message }) : undefined">
    {{ group.translatedMessage ?? group.message }}
    <span v-if="group.translatedMessage" class="sr-only">{{ t('issues.original', { message: group.message }) }}</span>
    <span v-if="group.count > 1" class="count whitespace-nowrap text-muted">
      ×{{ group.count }}
      <template v-if="group.ranges">{{ t('issues.items', { ranges: group.ranges }) }}</template>
    </span>
  </span>
</template>

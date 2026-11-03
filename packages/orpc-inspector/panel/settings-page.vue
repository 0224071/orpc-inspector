<script setup lang="ts">
import type { MessageKey } from './i18n'
import type { LocaleSetting } from './panel-settings'
import type { ReportOptions } from './report'
import type { useReportTemplates } from './report-settings'
import { messages, t } from './i18n'
import { browserLocale } from './panel-settings'
import ReportTemplatesSection from './report-templates-section.vue'

export type SettingsCategory = 'display' | 'reports'

defineProps<{
  templates: ReturnType<typeof useReportTemplates>
  /** Report generated from the options being edited, for comparison */
  preview: (options: ReportOptions) => string
}>()

const emit = defineEmits<{
  close: []
}>()

const category = defineModel<SettingsCategory>('category', { required: true })
const showHeaders = defineModel<boolean>('showHeaders', { required: true })
const locale = defineModel<LocaleSetting>('locale', { required: true })

const categories: { id: SettingsCategory, label: MessageKey }[] = [
  { id: 'display', label: 'settings.display' },
  { id: 'reports', label: 'settings.reports' },
]

/** Language names are shown in their own language so they are recognizable either way */
const languageName = (value: keyof typeof messages) => messages[value][`language.${value}`]
</script>

<template>
  <div class="settings-page flex h-screen flex-col">
    <header class="head flex items-center justify-between gap-2 border-b border-b-border px-3 py-2">
      <strong>{{ t('settings.title') }}</strong>
      <button type="button" @click="emit('close')">
        {{ t('settings.back') }}
      </button>
    </header>

    <div class="layout grid min-h-0 flex-1 grid-cols-[140px_minmax(0,1fr)] max-sm:grid-cols-[minmax(0,1fr)] max-sm:grid-rows-[auto_minmax(0,1fr)]">
      <nav class="categories flex flex-col gap-0.5 border-r border-r-border p-2 max-sm:flex-row max-sm:flex-wrap max-sm:border-b max-sm:border-b-border max-sm:[border-right:0]">
        <button
          v-for="item in categories"
          :key="item.id"
          type="button"
          :aria-current="item.id === category ? 'page' : undefined"
          class="border-transparent text-start"
          :class="item.id === category ? 'is-active bg-selected' : 'hover:bg-hover'"
          @click="category = item.id"
        >
          {{ t(item.label) }}
        </button>
      </nav>

      <section v-if="category === 'display'" class="display flex flex-col gap-4 overflow-auto px-4 py-3">
        <label class="option is-field flex max-w-120 cursor-pointer flex-col items-start gap-1">
          <span>
            {{ t('settings.language') }}
            <small class="mt-0.5 block text-muted">{{ t('settings.languageHint') }}</small>
          </span>
          <select v-model="locale">
            <option value="auto">
              {{ t('settings.languageAuto', { language: languageName(browserLocale()) }) }}
            </option>
            <option v-for="(_, value) in messages" :key="value" :value="value">
              {{ languageName(value) }}
            </option>
          </select>
        </label>
        <label class="option flex max-w-120 cursor-pointer items-start gap-2">
          <input v-model="showHeaders" type="checkbox">
          <span>
            {{ t('settings.showHeaders') }}
            <small class="mt-0.5 block text-muted">{{ t('settings.showHeadersHint') }}</small>
          </span>
        </label>
      </section>
      <ReportTemplatesSection v-else :preview="preview" :store="templates" />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { MessageKey } from './i18n'
import type { ReportOmit, ReportOptions, ReportSections, ReportSyntax } from './report'
import type { QuickPreset } from './report-presets'
import { computed } from 'vue'
import { t } from './i18n'
import { DEFAULT_MASK_PATTERN, isValidMaskPattern } from './report'
import {
  LENGTH_PRESETS,
  matchPreset,
  OMIT_PRESETS,
  SECTIONS_PRESETS,
  SYNTAX_PRESETS,
} from './report-presets'

defineProps<{
  mode: 'quick' | 'advanced'
}>()

const options = defineModel<ReportOptions>('options', { required: true })

interface QuickRow {
  label: MessageKey
  presets: QuickPreset<unknown>[]
  value: () => unknown
  apply: (value: unknown) => void
}

const QUICK_ROWS: QuickRow[] = [
  {
    label: 'options.syntax',
    presets: SYNTAX_PRESETS,
    value: () => options.value.syntax,
    apply: value => (options.value.syntax = structuredClone(value as ReportSyntax)),
  },
  {
    label: 'options.sections',
    presets: SECTIONS_PRESETS,
    value: () => options.value.sections,
    apply: value => (options.value.sections = structuredClone(value as ReportSections)),
  },
  {
    label: 'options.omission',
    presets: OMIT_PRESETS,
    value: () => options.value.omit,
    apply: value => (options.value.omit = structuredClone(value as ReportOmit)),
  },
  {
    label: 'options.maxLength',
    presets: LENGTH_PRESETS,
    value: () => options.value.maxLength,
    apply: value => (options.value.maxLength = value as number),
  },
]

const matched = (row: QuickRow) => matchPreset(row.presets, row.value())?.id

function presetLabel(preset: QuickPreset<unknown>) {
  return preset.label
    ? t(preset.label)
    : preset.id
}

/** Label of the matching preset, or "Custom" */
function matchedLabel(row: QuickRow) {
  const preset = matchPreset(row.presets, row.value())
  return preset
    ? presetLabel(preset)
    : t('options.custom')
}

/** Labels are `options.syntax.<key>`, fallbacks `options.syntax.<key>Off` */
const SYNTAX_FIELDS = [
  'heading',
  'bold',
  'inlineCode',
  'inlineCodeSkipStars',
  'codeBlock',
  'codeBlockLang',
  'table',
  'html',
  'emoji',
] as const satisfies (keyof ReportSyntax)[]

/** Options that only apply while another syntax is on */
const DEPENDS_ON: Partial<Record<keyof ReportSyntax, keyof ReportSyntax>> = {
  inlineCodeSkipStars: 'inlineCode',
  codeBlockLang: 'codeBlock',
}

function isInactive(field: keyof ReportSyntax) {
  const parent = DEPENDS_ON[field]
  return parent !== undefined && !options.value.syntax[parent]
}

const SECTION_FIELDS: (keyof ReportSections)[] = [
  'request',
  'time',
  'repeat',
  'issues',
  'input',
  'output',
  'requestHeaders',
  'responseHeaders',
]

const OMIT_FIELDS: { key: Exclude<keyof ReportOmit, 'mergeDuplicates'>, min: number }[] = [
  { key: 'maxIssues', min: 0 },
  { key: 'sampleValues', min: 1 },
  { key: 'maxValueLength', min: 0 },
  { key: 'maxArrayItems', min: 0 },
  { key: 'maxStringLength', min: 0 },
]

function toNumber(event: Event, min: number) {
  const value = Math.floor(Number((event.target as HTMLInputElement).value))
  return Number.isFinite(value)
    ? Math.max(min, value)
    : min
}

const maskValid = computed(() => isValidMaskPattern(options.value.maskPattern))
</script>

<template>
  <div v-if="mode === 'quick'" class="quick flex flex-col gap-3">
    <div v-for="row in QUICK_ROWS" :key="row.label" class="row flex items-start gap-2">
      <span class="label w-20 flex-none pt-1 text-muted">{{ t(row.label) }}</span>
      <div class="segments flex flex-wrap gap-1">
        <button
          v-for="preset in row.presets"
          :key="preset.id"
          type="button"
          :class="{ 'is-active border-current bg-selected text-fg': matched(row) === preset.id }"
          @click="row.apply(preset.value)"
        >
          {{ presetLabel(preset) }}
        </button>
        <span v-if="!matched(row)" class="custom rounded-sm border border-dashed border-warn px-2.5 py-[3px] text-warn">{{ t('options.custom') }}</span>
      </div>
    </div>
    <p class="hint m-0 text-[12px] text-muted">
      {{ t('options.quickHint') }}
    </p>
  </div>

  <div v-else class="advanced flex flex-col gap-3">
    <fieldset class="m-0 flex min-w-0 flex-col gap-1.5 rounded-md border border-border px-3 pt-2 pb-2.5">
      <legend class="px-1 font-semibold">
        {{ t('options.syntax') }}
        <span class="matched text-[11px] font-normal text-muted">{{ matchedLabel(QUICK_ROWS[0]!) }}</span>
      </legend>
      <label v-for="field in SYNTAX_FIELDS" :key="field" class="check flex items-center gap-1.5 has-disabled:opacity-50">
        <input v-model="options.syntax[field]" type="checkbox" :disabled="isInactive(field)">
        {{ t(`options.syntax.${field}`) }}
        <span class="fallback ml-auto text-[11px] text-muted">{{ t('options.off', { fallback: t(`options.syntax.${field}Off`) }) }}</span>
      </label>
      <label class="number flex items-center justify-between gap-2">
        <span>{{ t('options.bullet') }}</span>
        <select v-model="options.syntax.bullet" class="min-w-0 rounded-sm border border-border bg-bg px-1.5 py-0.5 text-inherit [font:inherit]">
          <option value="-">{{ t('options.bullet.markdown') }}</option>
          <option value="•">{{ t('options.bullet.plain') }}</option>
        </select>
      </label>
      <label class="number flex items-center justify-between gap-2">
        <span>{{ t('options.separator') }}</span>
        <select v-model="options.syntax.separator" class="min-w-0 rounded-sm border border-border bg-bg px-1.5 py-0.5 text-inherit [font:inherit]">
          <option value="---">{{ t('options.separator.markdown') }}</option>
          <option value="────">{{ t('options.separator.plain') }}</option>
        </select>
      </label>
    </fieldset>

    <fieldset class="m-0 flex min-w-0 flex-col gap-1.5 rounded-md border border-border px-3 pt-2 pb-2.5">
      <legend class="px-1 font-semibold">
        {{ t('options.sections') }}
        <span class="matched text-[11px] font-normal text-muted">{{ matchedLabel(QUICK_ROWS[1]!) }}</span>
      </legend>
      <label v-for="field in SECTION_FIELDS" :key="field" class="check flex items-center gap-1.5">
        <input v-model="options.sections[field]" type="checkbox">
        {{ t(`options.sections.${field}`) }}
      </label>
    </fieldset>

    <fieldset class="m-0 flex min-w-0 flex-col gap-1.5 rounded-md border border-border px-3 pt-2 pb-2.5">
      <legend class="px-1 font-semibold">
        {{ t('options.issueMessage') }}
      </legend>
      <label class="number flex items-center justify-between gap-2">
        <span>{{ t('options.issueMessage.label') }}</span>
        <select v-model="options.issueMessage" class="min-w-0 rounded-sm border border-border bg-bg px-1.5 py-0.5 text-inherit [font:inherit]">
          <option value="original">{{ t('options.issueMessage.original') }}</option>
          <option value="translated">{{ t('options.issueMessage.translated') }}</option>
          <option value="both">{{ t('options.issueMessage.both') }}</option>
        </select>
      </label>
      <p class="hint m-0 text-[12px] text-muted">
        {{ t('options.issueMessage.hint') }}
      </p>
    </fieldset>

    <fieldset class="m-0 flex min-w-0 flex-col gap-1.5 rounded-md border border-border px-3 pt-2 pb-2.5">
      <legend class="px-1 font-semibold">
        {{ t('options.omission') }}
        <span class="matched text-[11px] font-normal text-muted">{{ matchedLabel(QUICK_ROWS[2]!) }}</span>
      </legend>
      <label v-for="field in OMIT_FIELDS" :key="field.key" class="number flex items-center justify-between gap-2">
        <span>{{ t(`options.omit.${field.key}`) }}</span>
        <input
          class="w-20"
          type="number"
          :min="field.min"
          :value="options.omit[field.key]"
          @change="
            Object.assign(options.omit, {
              [field.key]: toNumber($event, field.min),
            })
          "
        >
      </label>
      <label class="check flex items-center gap-1.5">
        <input v-model="options.omit.mergeDuplicates" type="checkbox">
        {{ t('options.omit.mergeDuplicates') }}
      </label>
      <p class="hint m-0 text-[12px] text-muted">
        {{ t('options.zeroUnlimited') }}
      </p>
    </fieldset>

    <fieldset class="m-0 flex min-w-0 flex-col gap-1.5 rounded-md border border-border px-3 pt-2 pb-2.5">
      <legend class="px-1 font-semibold">
        {{ t('options.headers') }}
      </legend>
      <label class="number flex items-center justify-between gap-2">
        <span>{{ t('options.headers.scope') }}</span>
        <select v-model="options.headers.scope" class="min-w-0 rounded-sm border border-border bg-bg px-1.5 py-0.5 text-inherit [font:inherit]">
          <option value="common">{{ t('options.headers.common') }}</option>
          <option value="all">{{ t('options.headers.all') }}</option>
          <option value="list">{{ t('options.headers.list') }}</option>
        </select>
      </label>
      <label v-if="options.headers.scope === 'list'" class="mask flex flex-col gap-1">
        <span>{{ t('options.headers.names') }}</span>
        <input
          v-model="options.headers.list"
          class="font-mono text-[12px]"
          placeholder="x-request-id, content-type"
          type="text"
        >
      </label>
      <p class="hint m-0 text-[12px] text-muted">
        {{ t('options.headers.hint') }}
      </p>
    </fieldset>

    <fieldset class="m-0 flex min-w-0 flex-col gap-1.5 rounded-md border border-border px-3 pt-2 pb-2.5">
      <legend class="px-1 font-semibold">
        {{ t('options.length') }}
      </legend>
      <label class="number flex items-center justify-between gap-2">
        <span>{{ t('options.length.max') }}</span>
        <input
          min="0"
          class="w-20"
          type="number"
          :value="options.maxLength"
          @change="options.maxLength = toNumber($event, 0)"
        >
      </label>
      <p class="hint m-0 text-[12px] text-muted">
        {{ t('options.length.hint') }}
      </p>
    </fieldset>

    <fieldset class="m-0 flex min-w-0 flex-col gap-1.5 rounded-md border border-border px-3 pt-2 pb-2.5">
      <legend class="px-1 font-semibold">
        {{ t('options.masking') }}
      </legend>
      <label class="mask flex flex-col gap-1">
        <span>{{ t('options.masking.pattern') }}</span>
        <input v-model="options.maskPattern" class="font-mono text-[12px]" type="text" :class="{ 'invalid border-bad': !maskValid }">
      </label>
      <p class="hint m-0 text-[12px] text-muted">
        <template v-if="!maskValid">
          {{ t('options.masking.invalid') }}
        </template>
        <template v-else>
          {{ t('options.masking.hint') }}
        </template>
        <button class="link ml-1.5 p-0 text-number [border:none]" type="button" @click="options.maskPattern = DEFAULT_MASK_PATTERN">
          {{ t('options.masking.reset') }}
        </button>
      </p>
    </fieldset>
  </div>
</template>

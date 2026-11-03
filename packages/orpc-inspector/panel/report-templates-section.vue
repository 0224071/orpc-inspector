<script setup lang="ts">
import type { ReportOptions } from './report'
import type { useReportTemplates } from './report-settings'
import { computed, ref } from 'vue'
import { t, tc } from './i18n'
import ReportOptionsForm from './report-options-form.vue'

const props = defineProps<{
  store: ReturnType<typeof useReportTemplates>
  /** Report generated from the options being edited, for comparison */
  preview: (options: ReportOptions) => string
}>()

const editingId = ref(props.store.lastId.value)
const mode = ref<'quick' | 'advanced'>('quick')

const template = computed(() => props.store.find(editingId.value) ?? props.store.templates[0]!)
const previewText = computed(() => props.preview(template.value.options))
const overLimit = computed(
  () =>
    template.value.options.maxLength > 0
    && previewText.value.length > template.value.options.maxLength,
)

function add() {
  editingId.value = props.store.duplicate(template.value.id)
}

function remove() {
  // eslint-disable-next-line no-alert -- the panel has no UI library; a native confirm is enough
  if (!window.confirm(t('templates.confirmDelete', { name: template.value.name }))) {
    return
  }
  props.store.remove(template.value.id)
  editingId.value = props.store.lastId.value
}
</script>

<template>
  <div class="report-templates flex min-h-0 flex-col">
    <nav class="templates flex flex-wrap gap-1 border-b border-b-border px-3 py-2">
      <button
        v-for="item in store.templates"
        :key="item.id"
        type="button"
        :aria-current="item.id === editingId ? 'true' : undefined"
        class="flex items-center gap-1.5"
        :class="item.id === editingId ? 'is-active bg-selected' : 'hover:bg-hover'"
        @click="editingId = item.id"
      >
        {{ item.name }}
        <span v-if="item.id === store.lastId.value" class="tag rounded-[3px] border border-border px-1 text-[10px] text-muted">{{ t('templates.default') }}</span>
      </button>
      <button class="add flex items-center gap-1.5 border-dashed hover:bg-hover" :title="t('templates.duplicate')" type="button" @click="add">
        {{ t('templates.new') }}
      </button>
    </nav>

    <div class="body grid min-h-0 flex-1 grid-cols-[minmax(300px,1fr)_minmax(260px,1fr)] max-sm:grid-cols-[minmax(0,1fr)]">
      <section class="editor flex flex-col gap-3 overflow-auto border-r border-r-border px-4 py-3">
        <div class="editor-head flex items-center gap-1.5">
          <input
            v-model="template.name"
            class="title min-w-0 flex-1 font-semibold disabled:border-transparent"
            type="text"
            :disabled="template.builtin"
            :title="template.builtin ? t('templates.builtinName') : t('templates.name')"
          >
          <button
            v-if="template.id !== store.lastId.value"
            type="button"
            @click="store.use(template.id)"
          >
            {{ t('templates.setDefault') }}
          </button>
          <button v-if="template.builtin" type="button" @click="store.reset(template.id)">
            {{ t('templates.reset') }}
          </button>
          <button v-else class="danger text-bad" type="button" @click="remove">
            {{ t('templates.delete') }}
          </button>
        </div>
        <div class="tabs flex gap-1">
          <button type="button" :class="{ 'is-active bg-selected': mode === 'quick' }" @click="mode = 'quick'">
            {{ t('templates.quick') }}
          </button>
          <button
            type="button"
            :class="{ 'is-active bg-selected': mode === 'advanced' }"
            @click="mode = 'advanced'"
          >
            {{ t('templates.advanced') }}
          </button>
        </div>
        <ReportOptionsForm v-model:options="template.options" :mode="mode" />
      </section>

      <section class="preview flex min-h-0 min-w-0 flex-col px-4 py-3">
        <div class="preview-head mb-1.5 text-[12px] text-muted">
          {{ t('templates.preview') }}
          <span :class="{ 'over text-bad': overLimit }">{{ tc('templates.char', previewText.length) }}</span>
          <template v-if="template.options.maxLength">
            {{ t('templates.limit', { max: template.options.maxLength }) }}
          </template>
        </div>
        <pre class="m-0 flex-1 overflow-auto rounded-md border border-border p-2 font-mono text-[12px] whitespace-pre-wrap">{{ previewText || t('templates.noPreview') }}</pre>
      </section>
    </div>
  </div>
</template>

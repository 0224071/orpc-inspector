<script setup lang="ts">
import type { ReportTemplate } from './report-presets'
import { computed, ref } from 'vue'
import { t } from './i18n'

const props = defineProps<{
  label: string
  templates: ReportTemplate[]
  /** Template used by the main button */
  current: string
  disabled?: boolean
}>()

const emit = defineEmits<{
  copy: [id: string]
  settings: []
}>()

const open = ref(false)
const currentName = computed(() => props.templates.find(item => item.id === props.current)?.name)

/** Close only when focus leaves the whole menu, so clicking an item doesn't close it first */
function onFocusOut(event: FocusEvent) {
  if (!(event.currentTarget as Element).contains(event.relatedTarget as Node | null)) {
    open.value = false
  }
}

function pick(id: string) {
  open.value = false
  emit('copy', id)
}

function openSettings() {
  open.value = false
  emit('settings')
}
</script>

<template>
  <div class="report-menu relative inline-flex" @focusout="onFocusOut" @keydown.esc="open = false">
    <button class="rounded-e-none" type="button" :disabled="disabled" @click="emit('copy', current)">
      {{ label }} <span class="format text-[11px] text-muted">{{ currentName }}</span>
    </button>
    <button
      aria-haspopup="menu"
      class="toggle rounded-s-none px-1.5 [border-inline-start:none]"
      :title="t('reportMenu.choose')"
      type="button"
      :aria-expanded="open"
      :disabled="disabled"
      @click="open = !open"
    >
      ▾
    </button>
    <ul
      v-if="open"
      class="menu absolute inset-e-0 top-[calc(100%+4px)] z-10 m-0 min-w-40 list-none rounded-md border border-border bg-bg p-1 [box-shadow:0_4px_12px_rgb(0_0_0/12%)]"
      role="menu"
    >
      <li v-for="item in templates" :key="item.id">
        <button class="flex w-full gap-1.5 px-2 py-1 text-start whitespace-nowrap [border:none] hover:bg-hover" role="menuitem" type="button" @click="pick(item.id)">
          <span class="check w-[1em]">{{ item.id === current ? '✓' : '' }}</span>
          {{ t('reportMenu.copyAs', { name: item.name }) }}
        </button>
      </li>
      <li class="divider my-1 border-t border-t-border" />
      <li>
        <button class="flex w-full gap-1.5 px-2 py-1 text-start whitespace-nowrap [border:none] hover:bg-hover" role="menuitem" type="button" @click="openSettings">
          <span class="check w-[1em]" />
          {{ t('reportMenu.settings') }}
        </button>
      </li>
    </ul>
  </div>
</template>

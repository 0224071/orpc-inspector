<script setup lang="ts">
import type { OrpcHeaders } from '../src/core/types'
import { computed, ref } from 'vue'
import { MASK } from '../src/core/mask'
import { headerCell } from './header-cell'
import { t } from './i18n'

const props = defineProps<{
  headers?: OrpcHeaders
  maskPattern: string
}>()

/** Split multi-value headers (e.g. SSR set-cookie) into rows */
const rows = computed(() =>
  Object.entries(props.headers ?? {})
    .flatMap(([name, value]) => [value].flat().map(v => ({ name, value: v })))
    .sort((a, b) => a.name.localeCompare(b.name)),
)

const summary = computed(() => `{${rows.value.length}}`)

const open = defineModel<boolean>('open', { required: true })

const revealed = ref(new Set<number>())

function cell(row: { name: string, value: string }, index: number) {
  return headerCell(row.name, row.value, props.maskPattern, revealed.value.has(index))
}

function reveal(index: number) {
  revealed.value = new Set(revealed.value).add(index)
}
</script>

<template>
  <button
    class="row flex w-full items-baseline gap-1.5 rounded-[3px] py-px pr-2 pl-1.5 text-start [border:0] hover:bg-hover"
    type="button"
    :aria-expanded="open"
    @click="open = !open"
  >
    <span class="caret w-2.5 flex-none text-muted">{{ open ? '▾' : '▸' }}</span>
    <span class="brace text-muted">{{ summary }}</span>
  </button>
  <template v-if="!open" />
  <table v-else-if="rows.length" class="headers w-full border-collapse font-mono text-[12px]">
    <tbody>
      <tr v-for="(row, i) in rows" :key="i">
        <th class="w-[35%] px-2 py-0.5 text-start align-top font-normal break-all text-key">
          {{ row.name }}
        </th>
        <td v-if="cell(row, i) === 'recorded-mask'" class="px-2 py-0.5 text-start align-top break-all" :title="t('headers.maskedAtRecord')">
          {{ MASK }}
        </td>
        <td v-else-if="cell(row, i) === 'revealable'" class="px-2 py-0.5 text-start align-top break-all">
          <button class="reveal px-1 py-0" :title="t('headers.reveal')" type="button" @click="reveal(i)">
            {{ MASK }}
          </button>
        </td>
        <td v-else class="px-2 py-0.5 text-start align-top break-all">
          {{ row.value }}
        </td>
      </tr>
    </tbody>
  </table>
  <span v-else class="empty px-2 text-[12px] text-muted">{{ t('detail.none') }}</span>
</template>

<script setup lang="ts">
import type { Ref } from 'vue'
import type { OrpcCallIssue } from '../src/core/types'
import { computed, ref, watch } from 'vue'
import { MASK } from '../src/core/mask'
import { dataHeaderCell } from './header-cell'
import { t, tc } from './i18n'

export interface JsonTreeFocus {
  key: string
  /** All ancestors of the target, expanded so the target is visible */
  ancestors: Set<string>
}

export interface JsonTreeContext {
  /** pathKey → the node's own issues */
  issueMap: Map<string, OrpcCallIssue[]>
  /** Nodes with issues and all their ancestors, expanded by default */
  hot: Set<string>
  issues: OrpcCallIssue[]
  /** Node to scroll to */
  focus?: Ref<JsonTreeFocus | undefined>
  /** Call shown; revealed values are masked again when it changes */
  callId?: string
  /** Set when the tree shows error data: mask pattern for the headers it carries */
  dataHeadersMask?: string
}

const props = defineProps<{
  value: unknown
  path: (string | number)[]
  ctx: JsonTreeContext
  name?: string | number
  missing?: boolean
}>()

const pathKey = (path: (string | number)[]) => JSON.stringify(path.map(String))

const key = computed(() => pathKey(props.path))
const depth = computed(() => props.path.length)
const ownIssues = computed(() => props.ctx.issueMap.get(key.value) ?? [])
const isBad = computed(() => ownIssues.value.length > 0 || props.missing)

const revealed = ref(false)
watch(() => props.ctx.callId, () => {
  revealed.value = false
})
const maskCell = computed(() =>
  props.ctx.dataHeadersMask === undefined
    ? undefined
    : dataHeaderCell(props.path, props.value, props.ctx.dataHeadersMask, revealed.value),
)
const masked = computed(() => maskCell.value === 'revealable' || maskCell.value === 'recorded-mask')

const isArray = computed(() => Array.isArray(props.value))
const isObject = computed(() => !masked.value && props.value !== null && typeof props.value === 'object')
const entries = computed<[string | number, unknown][]>(() => {
  if (Array.isArray(props.value)) {
    return props.value.map((v, i) => [i, v])
  }
  return isObject.value
    ? Object.entries(props.value as Record<string, unknown>)
    : []
})

/** Child fields required by the schema but missing from the data */
const missingChildren = computed(() => {
  if (!isObject.value) {
    return []
  }
  const existing = new Set(entries.value.map(([k]) => String(k)))
  const names = new Set<string | number>()
  for (const issue of props.ctx.issues) {
    if (issue.path.length !== depth.value + 1) {
      continue
    }
    const child = issue.path.at(-1)!
    if (pathKey(issue.path.slice(0, -1)) === key.value && !existing.has(String(child))) {
      names.add(child)
    }
  }
  return [...names]
})

/** Issue count of descendants, shown on this row when collapsed */
const nestedIssueCount = computed(() => {
  if (!isObject.value) {
    return 0
  }
  return props.ctx.issues.filter(
    issue =>
      issue.path.length > depth.value && pathKey(issue.path.slice(0, depth.value)) === key.value,
  ).length
})

/** Text color of a primitive value, keyed by `primitive.type` */
const VALUE_COLOR: Record<string, string> = {
  null: 'text-muted',
  string: 'text-string',
  number: 'text-number',
  bigint: 'text-number',
  boolean: 'text-boolean',
}

const open = ref(
  depth.value === 0 || props.ctx.hot.has(key.value) || (props.ctx.hot.size === 0 && depth.value < 2),
)

watch(
  () => props.ctx.focus?.value,
  (focus) => {
    if (focus?.ancestors.has(key.value)) {
      open.value = true
    }
  },
  { immediate: true },
)

const hasNestedBad = computed(() => !open.value && nestedIssueCount.value > 0)

const summary = computed(() => {
  const size = entries.value.length
  return isArray.value
    ? `Array(${size})`
    : `{${size}}`
})

const primitive = computed(() => {
  const v = props.value
  if (v === null) {
    return { text: 'null', type: 'null' }
  }
  if (v === undefined) {
    return { text: 'undefined', type: 'null' }
  }
  if (typeof v === 'string') {
    return {
      text: JSON.stringify(v),
      type: 'string',
    }
  }
  return {
    text: String(v),
    type: typeof v,
  }
})

function toggle() {
  if (isObject.value) {
    open.value = !open.value
  }
}
</script>

<template>
  <div>
    <div
      class="row flex flex-wrap items-baseline gap-1.5 rounded-[3px] py-px pr-2 break-all whitespace-pre-wrap"
      :class="{
        'is-bad bg-bad-bg': isBad,
        'hover:bg-hover': !isBad,
        'is-container cursor-pointer': isObject,
        'has-nested-bad': hasNestedBad,
        '[box-shadow:inset_2px_0_0_var(--bad)]': isBad || hasNestedBad,
      }"
      :data-path="key"
      :style="{ paddingLeft: `${depth * 14 + 6}px` }"
      @click="toggle"
    >
      <span class="caret w-2.5 flex-none text-muted">{{ isObject ? (open ? '▾' : '▸') : '' }}</span>
      <span v-if="name !== undefined" class="key text-key">{{ name }}:</span>
      <span v-if="missing" class="missing text-muted italic">{{ t('json.missing') }}</span>
      <span v-else-if="maskCell === 'recorded-mask'" class="v-null text-muted" :title="t('headers.maskedAtRecord')">{{ MASK }}</span>
      <button v-else-if="maskCell === 'revealable'" class="reveal px-1 py-0" :title="t('headers.reveal')" type="button" @click.stop="revealed = true">
        {{ MASK }}
      </button>
      <span v-else-if="isObject" class="brace text-muted">{{ summary }}</span>
      <span v-else :class="[`v-${primitive.type}`, VALUE_COLOR[primitive.type]]">{{ primitive.text }}</span>
      <span v-if="hasNestedBad" class="badge rounded-[999px] bg-bad-bg px-1.5 font-sans text-[11px]/4 text-bad">{{ tc('json.issue', nestedIssueCount) }}</span>
      <span
        v-for="(issue, i) in ownIssues"
        :key="i"
        class="msg font-sans text-[12px] text-bad"
        :title="issue.translatedMessage ? t('issues.original', { message: issue.message }) : undefined"
      >✖ {{ issue.translatedMessage ?? issue.message }}<span v-if="issue.translatedMessage" class="sr-only">{{ t('issues.original', { message: issue.message }) }}</span></span>
    </div>
    <template v-if="isObject && open">
      <json-node
        v-for="[childName, child] in entries"
        :key="childName"
        :ctx="ctx"
        :name="childName"
        :path="[...path, childName]"
        :value="child"
      />
      <json-node
        v-for="childName in missingChildren"
        :key="`missing-${childName}`"
        missing
        :ctx="ctx"
        :name="childName"
        :path="[...path, childName]"
        :value="undefined"
      />
    </template>
  </div>
</template>

<style scoped>
/* Flash when jumped to from the issue list; class is added by panel-app */
.row.is-flash {
  animation: flash 1.2s ease-out;
}

@keyframes flash {
  0%,
  40% {
    outline: 2px solid var(--bad);
  }

  100% {
    outline: 2px solid transparent;
  }
}
</style>

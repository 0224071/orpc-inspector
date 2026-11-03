<script setup lang="ts">
import type { OrpcCall, OrpcCallIssue, OrpcInspectorProtocol } from '../src/core/types'
import type { CopyResult, CopyTarget } from './clipboard'
import type { IssueGroup } from './group-issues'
import type { MessageKey } from './i18n'
import type { JsonTreeContext, JsonTreeFocus } from './json-node.vue'
import type { ReportOptions, ReportSections } from './report'
import type { SettingsCategory } from './settings-page.vue'
import { connectPanelChannel } from 'devframe/in-page-channel'
import { computed, nextTick, onBeforeUnmount, reactive, ref, shallowRef, watch } from 'vue'
import { ORPC_INSPECTOR_CHANNEL } from '../src/core/types'
import { copyResultKey, writeClipboard } from './clipboard'
import CopyToggle from './copy-toggle.vue'
import { CLIENT_SCRIPT_WAIT_MS, diagnose, DISCONNECTED_CAUSES, isEmbedded } from './diagnostic'
import { groupIssues } from './group-issues'
import { hasPath } from './has-path'
import HeadersTable from './headers-table.vue'
import { locale, t, tc } from './i18n'
import IssueGroupBody from './issue-group-body.vue'
import JsonNode from './json-node.vue'
import { narrowView, useNarrow } from './narrow-layout'
import { resolveLocale, usePanelSettings } from './panel-settings'
import { buildCallReport, buildErrorsReport, defaultCallSections } from './report'
import ReportMenu from './report-menu.vue'
import { useReportTemplates } from './report-settings'
import { responseView } from './response-view'
import SettingsPage from './settings-page.vue'

type Filter = 'all' | 'error' | 'invalid'

const channel = connectPanelChannel<OrpcInspectorProtocol>({
  name: ORPC_INSPECTOR_CHANNEL,
  functions: {},
})
onBeforeUnmount(() => channel.close())

const status = ref(channel.status)
channel.events.on('status:updated', (value) => {
  status.value = value
})

const embedded = isEmbedded(window)
const startedAt = Date.now()
const elapsed = ref(0)
const waitTimer = setTimeout(() => (elapsed.value = Date.now() - startedAt), CLIENT_SCRIPT_WAIT_MS)
onBeforeUnmount(() => clearTimeout(waitTimer))
const diagnostic = computed(() => diagnose({ status: status.value, embedded, elapsed: elapsed.value }))

function retry() {
  // The channel has no reconnect; reloading builds a new one
  location.reload()
}

const calls = shallowRef<OrpcCall[]>([])
void channel.sharedState.get('calls').then((state) => {
  calls.value = state.value().list as OrpcCall[]
  state.on('updated', (full) => {
    calls.value = full.list
  })
})

const filter = ref<Filter>('all')
const keyword = ref('')
const selectedId = ref<string>()

const counts = computed(() => ({
  all: calls.value.length,
  error: calls.value.filter(c => c.state === 'error').length,
  invalid: calls.value.filter(c => c.state === 'invalid').length,
}))

const visibleCalls = computed(() => {
  const word = keyword.value.trim().toLowerCase()
  return calls.value.filter((call) => {
    if (filter.value !== 'all' && call.state !== filter.value) {
      return false
    }
    return !word || `${call.procedure} ${call.url ?? ''}`.toLowerCase().includes(word)
  })
})

const selected = computed(() => calls.value.find(call => call.id === selectedId.value))
/** Details show only while the selected call is in the visible list; hiding keeps the selection */
const selectionShown = computed(() => !!selected.value && visibleCalls.value.some(call => call.id === selectedId.value))

const narrow = useNarrow()
/** False after the back control in the narrow layout; the selection stays highlighted */
const detailOpen = ref(false)
const view = computed(() => narrowView(narrow.value, selectionShown.value, detailOpen.value))
/** A hidden selection closes the narrow details, so it comes back highlighted in the list */
watch(selectionShown, (value) => {
  if (!value) {
    detailOpen.value = false
  }
})
const list = ref<HTMLElement>()
const detail = ref<HTMLElement>()
const back = ref<HTMLButtonElement>()

/** Falls back to the first row, then the list itself, when a filter hides the selected row */
function focusSelectedRow() {
  const row = list.value?.querySelector<HTMLElement>('.is-selected') ?? list.value?.querySelector<HTMLElement>('.item')
  const target = row ?? list.value
  row?.scrollIntoView({ block: 'nearest' })
  target?.focus({ preventScroll: true })
}

/** In the narrow layout the list is hidden, so focus moves to the back control */
async function select(id: string) {
  selectedId.value = id
  detailOpen.value = true
  await nextTick()
  back.value?.focus()
}

/** The reset button is removed once the records show, so focus moves to a row */
async function resetFilters() {
  keyword.value = ''
  filter.value = 'all'
  await nextTick()
  focusSelectedRow()
}

/** The back control is removed, so focus returns to the selected row */
async function backToList() {
  detailOpen.value = false
  await nextTick()
  focusSelectedRow()
}

/** Crossing 640px can hide or remove the focused element; move focus to the part still shown */
watch(view, async (next) => {
  const active = document.activeElement
  const inList = !!active && !!list.value?.contains(active)
  const onBack = !!active && active === back.value
  const inDetail = !!active && !!detail.value?.contains(active)
  await nextTick()
  if (next === 'detail' && inList) {
    back.value?.focus()
  }
  else if ((next === 'split' && onBack) || (next === 'list' && inDetail)) {
    focusSelectedRow()
  }
})

const pathKey = (path: (string | number)[]) => JSON.stringify(path.map(String))

const ancestorKeys = (path: (string | number)[]) => path.map((_, i) => pathKey(path.slice(0, i)))

function createContext(issues: OrpcCallIssue[] = [], focus?: JsonTreeContext['focus']) {
  const issueMap = new Map<string, OrpcCallIssue[]>()
  const hot = new Set<string>()
  for (const issue of issues) {
    const key = pathKey(issue.path)
    issueMap.set(key, [
      ...(issueMap.get(key) ?? []),
      issue,
    ])
    ancestorKeys(issue.path).forEach(ancestor => hot.add(ancestor))
    hot.add(key)
  }
  return { issueMap, hot, issues, focus } satisfies JsonTreeContext
}

const focus = shallowRef<JsonTreeFocus>()
/** Input issues point at Input */
const inputInvalid = computed(() => selected.value?.issuesOf === 'input')
/** The server rejected the input: the request was sent, so status and response stay visible */
const serverRejected = computed(() => selected.value?.issuesSource === 'server')
/** The request is not sent when the client's input validation fails */
const notSent = computed(() => inputInvalid.value && !serverRejected.value)
/** The server validated what it received, so its issues at paths absent from the recorded input stay out of the tree */
const placedIssues = computed(() => {
  const issues = selected.value?.issues ?? []
  if (!(inputInvalid.value && serverRejected.value)) {
    return { inInput: issues, outside: [] }
  }
  const input = selected.value?.input
  return {
    inInput: issues.filter(issue => hasPath(input, issue.path)),
    outside: issues.filter(issue => !hasPath(input, issue.path)),
  }
})
const issueGroups = computed(() => groupIssues(placedIssues.value.inInput))
const outsideIssueGroups = computed(() => groupIssues(placedIssues.value.outside))
const inputContext = computed(() =>
  createContext(inputInvalid.value
    ? placedIssues.value.inInput
    : [], focus),
)

const inputTree = ref<HTMLElement>()
const responseTree = ref<HTMLElement>()
/** Last jumped-to issue; clicking a merged issue again jumps to the next one */
let lastJump: { group: number, index: number } | undefined
watch(selectedId, () => {
  lastJump = undefined
  focus.value = undefined
})

async function jumpToIssue(group: IssueGroup, groupIndex: number) {
  const index = lastJump?.group === groupIndex
    ? (lastJump.index + 1) % group.issues.length
    : 0
  lastJump = { group: groupIndex, index }
  const { path } = group.issues[index]!
  const key = pathKey(path)
  focus.value = {
    key,
    ancestors: new Set(ancestorKeys(path)),
  }
  await nextTick()
  const tree = inputInvalid.value ? inputTree.value : responseTree.value
  const row = tree?.querySelector<HTMLElement>(`[data-path="${CSS.escape(key)}"]`)
  if (!row) {
    return
  }
  row.scrollIntoView({ block: 'center', behavior: 'smooth' })
  // Remove and re-add so the animation replays on repeated clicks
  for (const flashed of tree!.querySelectorAll('.is-flash')) {
    flashed.classList.remove('is-flash')
  }
  void row.offsetWidth
  row.classList.add('is-flash')
}

const response = computed(() => selected.value && responseView(selected.value))
const responseValue = computed(() => response.value?.value)

/** Connection dot color; anything else, e.g. `connecting`, is amber */
const STATUS_COLOR: Partial<Record<string, string>> = {
  connected: 'bg-ok',
  closed: 'bg-bad',
}

/** List dot look by call state; `invalid` shows the ≠ mark instead. Shape tells pending apart without color */
const DOT_STYLE: Record<Exclude<OrpcCall['state'], 'invalid'>, string> = {
  pending: 'box-border border-[1.5px] border-muted',
  streaming: 'bg-number',
  success: 'bg-ok',
  error: 'bg-bad',
  cancelled: 'bg-muted',
}

/** What an invalid call failed on: the row tag and its tooltip */
function invalidReason(call: OrpcCall): { tag: MessageKey, title: MessageKey } | undefined {
  if (call.state !== 'invalid')
    return
  if (call.issuesSource === 'server')
    return { tag: 'call.serverTag', title: 'call.serverRejected' }
  return call.issuesOf === 'input'
    ? { tag: 'call.notSent', title: 'call.inputMismatch' }
    : { tag: 'call.responseTag', title: 'call.responseMismatch' }
}

/** Detail state badge colors; the rest only get the neutral background */
const BADGE_COLOR: Partial<Record<OrpcCall['state'], string>> = {
  success: 'bg-hover text-ok',
  error: 'bg-bad-bg text-bad',
  invalid: 'bg-bad-bg text-bad',
}

const STATE_LABEL: Record<OrpcCall['state'], MessageKey> = {
  pending: 'state.pending',
  streaming: 'state.streaming',
  success: 'state.success',
  error: 'state.error',
  invalid: 'state.invalid',
  cancelled: 'state.cancelled',
}

function formatTime(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString(locale.value, { hour12: false })
}

const visibleErrorCount = computed(
  () =>
    visibleCalls.value.filter(call => call.state === 'error' || call.state === 'invalid').length,
)

/** The button just copied from and whether it worked, to briefly show "Copied" or "Copy failed" */
const copied = ref<CopyResult>()
let copiedTimer: ReturnType<typeof setTimeout> | undefined

function copyLabel(target: CopyTarget, idle: string) {
  const key = copyResultKey(copied.value, target)
  return key
    ? t(key)
    : idle
}

const reportTemplates = useReportTemplates()
const panelSettings = usePanelSettings()
watch(
  () => resolveLocale(panelSettings.locale),
  (value) => {
    locale.value = value
    document.documentElement.lang = value
  },
  { immediate: true },
)
/** Settings category being shown; undefined shows the panel */
const settingsCategory = ref<SettingsCategory>()

const currentTemplate = computed(() => reportTemplates.find(reportTemplates.lastId.value))

/** Masking in the panel follows the current template's pattern */
const maskPattern = computed(() => currentTemplate.value?.options.maskPattern ?? '')

const responseContext = computed(() => ({
  ...createContext(inputInvalid.value
    ? []
    : selected.value?.issues, focus),
  callId: selected.value?.id,
  dataHeadersMask: response.value?.errorData
    ? maskPattern.value
    : undefined,
}))

type CopyPart = keyof Pick<
  ReportSections,
  'requestHeaders' | 'input' | 'responseHeaders' | 'output'
>

/** Sections to include in this copy, only those the user toggled; resets to the template when another call is selected */
const copyParts = ref<Partial<Record<CopyPart, boolean>>>({})
watch(selectedId, () => (copyParts.value = {}))

function isCopyPart(part: CopyPart) {
  const call = selected.value
  const options = currentTemplate.value?.options
  return (
    copyParts.value[part] ?? (call && options
      ? defaultCallSections(call, options)[part]
      : false)
  )
}

function setCopyPart(part: CopyPart, value: boolean) {
  copyParts.value = { ...copyParts.value, [part]: value }
}

/** Headers start collapsed and stay expanded across calls once opened */
const headersOpen = reactive({ request: false, response: false })

function previewReport(options: ReportOptions) {
  return visibleErrorCount.value
    ? buildErrorsReport(visibleCalls.value, options)
    : ''
}

async function copyReport(target: CopyTarget, templateId: string) {
  const template = reportTemplates.find(templateId)
  if (!template) {
    return
  }
  const { options } = template
  const text
    = target === 'all'
      ? buildErrorsReport(visibleCalls.value, options)
      : selected.value && buildCallReport(selected.value, options, copyParts.value)
  if (!text) {
    return
  }
  reportTemplates.use(templateId)
  const ok = await writeClipboard(text)
  copied.value = { target, ok }
  clearTimeout(copiedTimer)
  copiedTimer = setTimeout(() => (copied.value = undefined), ok
    ? 1500
    : 3000)
}

async function clear() {
  selectedId.value = undefined
  await channel.call('calls:clear')
}
</script>

<template>
  <SettingsPage
    v-if="settingsCategory"
    v-model:category="settingsCategory"
    v-model:locale="panelSettings.locale"
    v-model:show-headers="panelSettings.showHeaders"
    :preview="previewReport"
    :templates="reportTemplates"
    @close="settingsCategory = undefined"
  />
  <div v-else class="panel flex h-screen flex-col">
    <header class="toolbar flex flex-wrap items-center gap-2 border-b border-b-border px-3 py-2">
      <strong class="title">oRPC</strong>
      <span class="status size-2 rounded-[50%]" :class="[`is-${status}`, STATUS_COLOR[status] ?? 'bg-warn-fill']" :title="t(`status.${status}`)" />
      <div class="filters flex gap-1">
        <button type="button" :class="{ 'is-active bg-selected': filter === 'all' }" @click="filter = 'all'">
          {{ t('toolbar.all', { count: counts.all }) }}
        </button>
        <button
          class="is-error text-bad"
          type="button"
          :class="{ 'is-active bg-selected': filter === 'error' }"
          @click="filter = 'error'"
        >
          {{ t('toolbar.errors', { count: counts.error }) }}
        </button>
        <button
          class="is-invalid text-bad"
          type="button"
          :class="{ 'is-active bg-selected': filter === 'invalid' }"
          @click="filter = 'invalid'"
        >
          <span class="mark inline-flex size-3.5 flex-none items-center justify-center rounded-[3px] bg-bad font-mono text-[12px] font-bold text-white">≠</span> {{ t('toolbar.invalid', { count: counts.invalid }) }}
        </button>
      </div>
      <input v-model="keyword" class="search min-w-30 flex-1 max-sm:order-2 max-sm:basis-full" :placeholder="t('toolbar.search')" type="search">
      <ReportMenu
        class="max-sm:order-3"
        :current="reportTemplates.lastId.value"
        :disabled="visibleErrorCount === 0"
        :label="copyLabel('all', t('toolbar.copyErrors', { count: visibleErrorCount }))"
        :templates="reportTemplates.templates"
        @copy="copyReport('all', $event)"
        @settings="settingsCategory = 'reports'"
      />
      <button class="clear max-sm:order-3" type="button" @click="clear">
        {{ t('toolbar.clear') }}
      </button>
      <button
        class="settings max-sm:order-3 max-sm:ms-auto"
        :aria-label="t('toolbar.settings')"
        :title="t('toolbar.settings')"
        type="button"
        @click="settingsCategory = 'display'"
      >
        ⚙
      </button>
    </header>

    <section v-if="diagnostic.show" class="diagnostic max-w-140 self-center p-6" role="status">
      <h2 class="diagnostic-title mt-0 mb-3 text-[14px] font-semibold">
        {{ t('panel.waiting') }}
      </h2>
      <p class="diagnostic-heading mt-0 mb-2 text-muted">
        {{ t('panel.causesHeading') }}
      </p>
      <ul class="causes mt-0 mb-4 flex list-none flex-col gap-1.5 p-0">
        <li
          v-for="cause in DISCONNECTED_CAUSES"
          :key="cause"
          class="cause rounded-md border px-2.5 py-2 leading-normal"
          :class="diagnostic.marked === cause ? 'is-marked border-warn-fill' : 'border-border'"
          :data-cause="cause"
        >
          <span v-if="diagnostic.marked === cause" class="cause-mark mr-1.5 inline-block rounded-sm border border-warn-fill px-1.5 text-[11px] font-semibold text-warn">{{ t('panel.causeMarked') }}</span>
          {{ t(`panel.cause.${cause}`) }}
        </li>
      </ul>
      <button type="button" class="retry" @click="retry">
        {{ t('panel.retry') }}
      </button>
    </section>
    <div v-else class="body grid min-h-0 flex-1 grid-cols-[minmax(240px,2fr)_3fr] max-sm:grid-cols-[minmax(0,1fr)]" :class="view === 'split' ? undefined : `is-${view}`">
      <ul ref="list" class="list m-0 list-none overflow-auto border-r border-r-border p-0 max-sm:[border-right:0] max-sm:in-[.is-detail]:hidden" tabindex="-1">
        <li v-if="visibleCalls.length === 0" class="empty p-6 text-center text-muted">
          <p class="m-0">
            {{ calls.length === 0 ? t('panel.noCalls') : t('panel.noMatchingCalls') }}
          </p>
          <button v-if="calls.length > 0" type="button" class="reset-filters mt-2" @click="resetFilters">
            {{ t('panel.clearFilters') }}
          </button>
        </li>
        <li
          v-for="call in visibleCalls"
          :key="call.id"
          class="item flex cursor-pointer items-center gap-2 border-b border-b-border px-3 py-1.5 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-key"
          :class="[`is-${call.state}`, call.id === selectedId ? 'is-selected bg-selected' : 'hover:bg-hover']"
          tabindex="0"
          @click="select(call.id)"
          @keydown.enter.exact.prevent="!$event.repeat && select(call.id)"
          @keydown.space.exact.prevent
          @keyup.space.exact.prevent="select(call.id)"
        >
          <span
            v-if="call.state === 'invalid'"
            class="mark inline-flex size-3.5 flex-none items-center justify-center rounded-[3px] bg-bad font-mono text-[12px] font-bold text-white"
            role="img"
            :aria-label="t(STATE_LABEL[call.state])"
            :title="t(invalidReason(call)!.title)"
          >≠</span>
          <span
            v-else
            class="dot mx-[3px] size-2 flex-none rounded-[50%]"
            :class="[`is-${call.state}`, DOT_STYLE[call.state]]"
            role="img"
            :aria-label="t(STATE_LABEL[call.state])"
            :title="t(STATE_LABEL[call.state])"
          />
          <span class="method w-11 flex-none font-mono text-[11px] text-muted">{{ call.method ?? '—' }}</span>
          <span class="procedure flex-1 truncate font-mono" :class="{ 'text-bad': call.state === 'invalid' }">{{ call.procedure }}</span>
          <span
            v-if="invalidReason(call)"
            class="tag is-reason rounded-[3px] border border-border px-1 text-[10px] whitespace-nowrap text-muted"
            :class="{ 'is-server': call.issuesSource === 'server' }"
            :title="t(invalidReason(call)!.title)"
          >{{ t(invalidReason(call)!.tag) }}</span>
          <span v-if="call.side === 'ssr'" class="tag rounded-[3px] border border-border px-1 text-[10px] text-muted">SSR</span>
          <span class="meta text-[12px] text-muted">
            {{ call.status ?? '' }}
            <template v-if="call.duration !== undefined">· {{ call.duration }}ms</template>
          </span>
        </li>
      </ul>

      <section v-if="selected" v-show="selectionShown" ref="detail" class="detail overflow-auto px-4 py-3 max-sm:in-[.is-list]:hidden">
        <button v-if="view === 'detail'" ref="back" class="back mb-2" type="button" @click="backToList">
          {{ t('detail.back') }}
        </button>
        <div class="summary flex flex-wrap items-center gap-2">
          <span class="badge rounded-[10px] px-2 py-px text-[12px]" :class="[`is-${selected.state}`, BADGE_COLOR[selected.state] ?? 'bg-hover']">{{
            t(STATE_LABEL[selected.state])
          }}</span>
          <code class="font-mono break-all">{{ selected.method }} {{ selected.url ?? selected.procedure }}</code>
          <span class="meta text-[12px] text-muted">
            {{ notSent ? t('call.notSent') : (selected.status ?? '') }}
            <template v-if="selected.duration !== undefined">· {{ selected.duration }}ms</template>
            · {{ selected.side === 'ssr' ? 'SSR' : t('call.client') }} ·
            {{ formatTime(selected.startedAt) }}
          </span>
          <ReportMenu
            v-if="selected.state !== 'pending'"
            class="copy ml-auto max-sm:order-3"
            :current="reportTemplates.lastId.value"
            :label="copyLabel('detail', t('panel.copyReport'))"
            :templates="reportTemplates.templates"
            @copy="copyReport('detail', $event)"
            @settings="settingsCategory = 'reports'"
          />
        </div>

        <div v-if="selected.issues?.length" class="issues mt-3 rounded-md border border-(--tone) bg-(--tone-bg) px-3 py-2 [--tone-bg:var(--bad-bg)] [--tone:var(--bad)]">
          <h3 class="mt-0 mb-1.5 text-[12px] text-(--tone)">
            {{ tc(serverRejected ? 'issues.serverHeading' : inputInvalid ? 'issues.inputHeading' : 'issues.responseHeading', selected.issues.length) }}
          </h3>
          <p v-if="serverRejected && selected.error" class="error-line mt-0 mb-1.5 text-muted">
            <code class="font-mono text-(--tone)">{{ selected.error.name }}{{ selected.error.code ? ` · ${selected.error.code}` : '' }}</code>
            {{ selected.error.message }}
          </p>
          <ul class="m-0 list-none p-0">
            <li
              v-for="(group, i) in issueGroups"
              :key="i"
              class="is-link -mx-1 flex cursor-pointer gap-2 rounded-[3px] px-1 py-0.5 hover:bg-hover hover:outline-none focus-visible:bg-hover focus-visible:outline-none"
              tabindex="0"
              :title="group.count > 1 ? t('issues.jumpNext') : t('issues.jump')"
              @click="jumpToIssue(group, i)"
              @keydown.enter.exact.prevent="!$event.repeat && jumpToIssue(group, i)"
              @keydown.space.exact.prevent
              @keyup.space.exact.prevent="jumpToIssue(group, i)"
            >
              <IssueGroupBody :group="group" />
            </li>
          </ul>
          <template v-if="outsideIssueGroups.length">
            <p class="not-in-input-label mt-1.5 mb-0 text-muted">
              {{ t('issues.notInInput') }}
            </p>
            <ul class="not-in-input m-0 list-none p-0">
              <li v-for="(group, i) in outsideIssueGroups" :key="i" class="flex gap-2 py-0.5">
                <IssueGroupBody :group="group" />
              </li>
            </ul>
          </template>
        </div>
        <div v-else-if="selected.error" class="issues mt-3 rounded-md border border-(--tone) bg-(--tone-bg) px-3 py-2 [--tone-bg:var(--bad-bg)] [--tone:var(--bad)]">
          <h3 class="mt-0 mb-1.5 text-[12px] text-(--tone)">
            {{ selected.error.name }}{{ selected.error.code ? ` · ${selected.error.code}` : '' }}
          </h3>
          <p class="m-0">
            {{ selected.error.message }}
          </p>
        </div>

        <h3 class="mt-4 mb-1.5 text-[12px] text-muted uppercase">
          {{ t('detail.request') }}
        </h3>
        <template v-if="panelSettings.showHeaders">
          <div class="part-row mt-2 mb-1 flex items-center gap-1.5">
            <span class="part text-[12px] font-semibold">{{ t('detail.headers') }}</span>
            <CopyToggle
              v-if="selected.state !== 'pending'"
              :model-value="isCopyPart('requestHeaders')"
              @update:model-value="setCopyPart('requestHeaders', $event)"
            />
          </div>
          <div class="tree rounded-md border border-border py-1.5 font-mono text-[12px] leading-[1.6]">
            <HeadersTable
              :key="selected.id"
              v-model:open="headersOpen.request"
              :headers="selected.requestHeaders"
              :mask-pattern="maskPattern"
            />
          </div>
          <p v-if="headersOpen.request && selected.side !== 'ssr'" class="note mt-1 mb-0 text-[11px] text-muted">
            {{ t('detail.headersNote') }}
          </p>
        </template>
        <div class="part-row mt-2 mb-1 flex items-center gap-1.5">
          <span class="part text-[12px] font-semibold">{{ t('detail.input') }}</span>
          <CopyToggle
            v-if="selected.state !== 'pending'"
            :model-value="isCopyPart('input')"
            @update:model-value="setCopyPart('input', $event)"
          />
        </div>
        <div ref="inputTree" class="tree rounded-md border border-border py-1.5 font-mono text-[12px] leading-[1.6]">
          <JsonNode
            v-if="selected.input !== undefined"
            :ctx="inputContext"
            :path="[]"
            :value="selected.input"
          />
          <span v-else class="muted text-[12px] text-muted">{{ t('detail.none') }}</span>
        </div>

        <h3 class="mt-4 mb-1.5 text-[12px] text-muted uppercase">
          {{ t('detail.response') }}
        </h3>
        <template v-if="panelSettings.showHeaders">
          <div class="part-row mt-2 mb-1 flex items-center gap-1.5">
            <span class="part text-[12px] font-semibold">{{ t('detail.headers') }}</span>
            <CopyToggle
              v-if="selected.state !== 'pending'"
              :model-value="isCopyPart('responseHeaders')"
              @update:model-value="setCopyPart('responseHeaders', $event)"
            />
          </div>
          <div class="tree rounded-md border border-border py-1.5 font-mono text-[12px] leading-[1.6]">
            <HeadersTable
              :key="selected.id"
              v-model:open="headersOpen.response"
              :headers="selected.responseHeaders"
              :mask-pattern="maskPattern"
            />
          </div>
        </template>
        <div class="part-row mt-2 mb-1 flex items-center gap-1.5">
          <span class="part text-[12px] font-semibold">{{ t('detail.body') }}</span>
          <CopyToggle
            v-if="selected.state !== 'pending'"
            :model-value="isCopyPart('output')"
            @update:model-value="setCopyPart('output', $event)"
          />
        </div>
        <div ref="responseTree" class="tree rounded-md border border-border py-1.5 font-mono text-[12px] leading-[1.6]">
          <JsonNode
            v-if="responseValue !== undefined"
            :ctx="responseContext"
            :path="[]"
            :value="responseValue"
          />
          <span v-else class="muted text-[12px] text-muted">{{ notSent ? t('detail.notSent') : t('detail.empty') }}</span>
        </div>
      </section>
      <section v-if="selected && !selectionShown && view === 'split'" class="detail empty overflow-auto p-6 text-center text-muted max-sm:in-[.is-list]:hidden">
        {{ t('panel.selectionHidden') }}
      </section>
      <section v-else-if="!selected && view === 'split'" class="detail empty overflow-auto p-6 text-center text-muted max-sm:in-[.is-list]:hidden">
        {{ t('panel.selectCall') }}
      </section>
    </div>
  </div>
</template>

<style scoped>
/* Narrow panel: the iframe's own width, see narrow-layout.ts. These reach into ReportMenu, so they stay here */
@media (max-width: 639.98px) {
  /* The template's format is still shown in its menu */
  .toolbar :deep(.format) {
    display: none;
  }

  /* The copy button starts the row, so open its menu rightwards */
  .toolbar :deep(.menu) {
    inset-inline: 0 auto;
  }
}
</style>

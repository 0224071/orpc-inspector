import type { getOrpcInspectorStore } from '../core/store'
import type { OrpcCall, OrpcCallBodyField, OrpcHeaders, OrpcPreserveLogState } from '../core/types'
import { maskDataHeaders, toHeaderRecord } from '../core/headers'

/** `"1"` while Preserve log is on; separate from the records so a failed write never turns the setting off */
export const PRESERVE_LOG_ENABLED_KEY = 'orpc-inspector:preserve-log:enabled'
export const PRESERVE_LOG_RECORDS_KEY = 'orpc-inspector:preserve-log:records'
/** Bumped only for incompatible changes; a copy with another version is discarded */
export const PRESERVE_LOG_VERSION = 1
/** A record whose saved JSON is longer is saved as a summary */
export const RECORD_LIMIT = 65_536
/** The whole saved copy; about 20 % of Chromium's per-origin quota, and `setItem` of it stays well under 30 ms */
export const TOTAL_LIMIT = 1_000_000
export const SAVE_INTERVAL_MS = 1000
/**
 * The browser cancels a page's requests as it leaves, and the call fails with a network error just before `pagehide`.
 * A call that fails this way this soon before the page is hidden is saved as it was before failing, so it comes back as unknown
 */
export const LEAVE_WINDOW_MS = 1000

const STARTED_KEY = Symbol.for('orpc-inspector:preserve-log')

export interface PreservedLog {
  v: typeof PRESERVE_LOG_VERSION
  /** Store order, newest first; masked copies, large ones as summaries */
  list: OrpcCall[]
  /** Records left out by the budget or a failed write, including ones carried over from earlier pages */
  dropped: number
  /** Time of the last clear, for pages returning from the back/forward cache */
  clearedAt?: number
}

type Store = ReturnType<typeof getOrpcInspectorStore>

const maskHeaders = (headers: OrpcHeaders | undefined) => headers && toHeaderRecord(headers, true)

/** The record as saved: sensitive headers replaced with `***` like SSR records; bodies kept as they are */
export function toSavedRecord(call: OrpcCall): OrpcCall {
  const saved: OrpcCall = { ...call }
  if (call.requestHeaders)
    saved.requestHeaders = maskHeaders(call.requestHeaders)
  if (call.responseHeaders)
    saved.responseHeaders = maskHeaders(call.responseHeaders)
  if (call.attempts) {
    saved.attempts = call.attempts.map((attempt) => {
      const copy = { ...attempt }
      if (attempt.requestHeaders)
        copy.requestHeaders = maskHeaders(attempt.requestHeaders)
      if (attempt.responseHeaders)
        copy.responseHeaders = maskHeaders(attempt.responseHeaders)
      return copy
    })
  }
  if (call.error && call.error.data !== undefined) {
    saved.error = {
      ...call.error,
      data: maskDataHeaders(call.error.data),
    }
  }
  return saved
}

/** Every field except the bodies, with a note of the left-out fields that held data and the full size */
export function toSummary(saved: OrpcCall, size: number): OrpcCall {
  const { input, output, events, error, ...rest } = saved
  const fields: OrpcCallBodyField[] = []
  if (input !== undefined)
    fields.push('input')
  if (output !== undefined)
    fields.push('output')
  if (events?.length)
    fields.push('events')
  if (error?.data !== undefined)
    fields.push('error.data')
  const summary: OrpcCall = {
    ...rest,
    notPreserved: { fields, size },
  }
  if (error) {
    const { data: _data, ...errorRest } = error
    summary.error = errorRest
  }
  return summary
}

interface SavedForm {
  /** Undefined when the record can't be serialized */
  full?: string
  summary?: string
  /** The full form is a summary already (restored from an earlier save) */
  partial: boolean
}

/** Saved forms by record object; the store replaces a record whenever it changes, so unchanged records are reused */
export type SavedFormCache = WeakMap<OrpcCall, SavedForm>

function savedForm(call: OrpcCall, cache: SavedFormCache): SavedForm {
  let form = cache.get(call)
  if (!form) {
    try {
      form = {
        full: JSON.stringify(toSavedRecord(call)),
        partial: !!call.notPreserved,
      }
    }
    catch {
      form = { partial: false }
    }
    cache.set(call, form)
  }
  return form
}

function summaryOf(call: OrpcCall, form: SavedForm): string | undefined {
  if (form.partial)
    return form.full
  if (form.summary === undefined && form.full !== undefined)
    form.summary = JSON.stringify(toSummary(toSavedRecord(call), form.full.length))
  return form.summary
}

export interface SerializedLog {
  json: string
  /** Records left out by this save */
  dropped: number
  /** Saved records without their bodies */
  summarized: number
}

/**
 * Builds the envelope newest first within the total limit: a record over the per-record limit, or one that doesn't fit, is tried
 * as a summary; once a summary doesn't fit either, it and every older record are left out. Records are joined as strings so
 * unchanged ones cost no serialization
 */
export function serializeLog(
  list: readonly OrpcCall[],
  options: { carried: number, clearedAt?: number, summariesOnly?: boolean, cache?: SavedFormCache },
): SerializedLog {
  const cache = options.cache ?? new WeakMap()
  const parts: string[] = []
  let used = 0
  let summarized = 0
  let dropped = 0
  // Room for the head with the largest possible count
  const budget = TOTAL_LIMIT - head(options.carried + list.length, options.clearedAt).length - 2
  for (let i = 0; i < list.length; i++) {
    const call = list[i]!
    const form = savedForm(call, cache)
    if (form.full === undefined) {
      dropped++
      continue
    }
    let text = options.summariesOnly || form.full.length > RECORD_LIMIT
      ? summaryOf(call, form)!
      : form.full
    const separator = parts.length ? 1 : 0
    if (used + separator + text.length > budget && text === form.full)
      text = summaryOf(call, form)!
    if (used + separator + text.length > budget) {
      dropped += list.length - i
      break
    }
    if (text !== form.full || form.partial)
      summarized++
    parts.push(text)
    used += separator + text.length
  }
  return {
    json: `${head(options.carried + dropped, options.clearedAt)}[${parts.join(',')}]}`,
    dropped,
    summarized,
  }
}

function head(dropped: number, clearedAt: number | undefined) {
  const cleared = clearedAt === undefined
    ? ''
    : `,"clearedAt":${clearedAt}`
  return `{"v":${PRESERVE_LOG_VERSION},"dropped":${dropped}${cleared},"list":`
}

/** Undefined for anything that isn't this version's envelope */
export function parseLog(raw: string | null): PreservedLog | undefined {
  if (raw === null)
    return
  let value: unknown
  try {
    value = JSON.parse(raw)
  }
  catch {
    return
  }
  if (!value || typeof value !== 'object')
    return
  const log = value as Partial<PreservedLog>
  if (log.v !== PRESERVE_LOG_VERSION || !Array.isArray(log.list))
    return
  return {
    v: PRESERVE_LOG_VERSION,
    list: log.list.filter((call): call is OrpcCall => !!call && typeof call === 'object' && typeof call.id === 'string'),
    dropped: typeof log.dropped === 'number' && log.dropped > 0
      ? log.dropped
      : 0,
    clearedAt: typeof log.clearedAt === 'number'
      ? log.clearedAt
      : undefined,
  }
}

/** A saved record as it comes back: marked, and an unfinished call's outcome is unknown */
export function toRestored(call: OrpcCall): OrpcCall {
  if (call.state !== 'pending' && call.state !== 'streaming')
    return { ...call, fromPreviousPage: true }
  const { duration: _duration, ...rest } = call
  return { ...rest, state: 'unknown', fromPreviousPage: true }
}

/** Failed in the transport with no response, as when the browser cancels the requests of a page being left */
function endedWithoutResponse(call: OrpcCall) {
  return call.state === 'error'
    && call.status === undefined
    && (call.error?.name === 'TypeError' || call.error?.name === 'AbortError')
}

const isUnfinished = (call: OrpcCall) => call.state === 'pending' || call.state === 'streaming'

function openStorage(): Storage | undefined {
  try {
    const storage = globalThis.sessionStorage
    storage.getItem(PRESERVE_LOG_ENABLED_KEY)
    return storage
  }
  catch {
    return undefined
  }
}

export interface PreserveLog {
  readonly state: OrpcPreserveLogState
  setEnabled: (enabled: boolean) => void
  /** Called after the store is cleared */
  cleared: () => void
  /** Status changes, for the panel */
  onState: (fn: (state: OrpcPreserveLogState) => void) => void
  /** Removes the listeners, as when the document is discarded; for tests */
  dispose: () => void
}

/**
 * Restores the saved records once, then keeps the saved copy in step with the store while Preserve log is on.
 * Installed once per document; starting again returns the same instance
 */
export function startPreserveLog(store: Store): PreserveLog {
  const g = globalThis as { [STARTED_KEY]?: PreserveLog }
  if (g[STARTED_KEY])
    return g[STARTED_KEY]

  const storage = openStorage()
  const state: OrpcPreserveLogState = {
    enabled: false,
    available: !!storage,
    dropped: 0,
    summarized: 0,
    failed: false,
  }
  const listeners = new Set<(state: OrpcPreserveLogState) => void>()
  const cache: SavedFormCache = new WeakMap()
  /** Records left out on earlier pages */
  let carried = 0
  let clearedAt: number | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let lastSave = -Infinity
  let dirty = false
  let hiddenAt = 0
  /** Latest version of each pending or streaming record */
  const unfinished = new Map<string, OrpcCall>()
  /** Records that just failed with no response, mapped to their version before failing */
  const cutShort = new Map<OrpcCall, { before: OrpcCall, at: number }>()

  function track(list: readonly OrpcCall[]) {
    const now = performance.now()
    for (const [after, entry] of cutShort) {
      if (now - entry.at > LEAVE_WINDOW_MS)
        cutShort.delete(after)
    }
    const present = new Set<string>()
    for (const call of list) {
      present.add(call.id)
      if (isUnfinished(call)) {
        unfinished.set(call.id, call)
        continue
      }
      const before = unfinished.get(call.id)
      if (!before)
        continue
      unfinished.delete(call.id)
      if (endedWithoutResponse(call))
        cutShort.set(call, { before, at: now })
    }
    for (const id of unfinished.keys()) {
      if (!present.has(id))
        unfinished.delete(id)
    }
  }

  /** The store as saved when the page is being left: calls cut short by leaving go back to unfinished */
  function leavingList() {
    const now = performance.now()
    return store.list.map((call) => {
      const entry = cutShort.get(call)
      return entry && now - entry.at <= LEAVE_WINDOW_MS
        ? entry.before
        : call
    })
  }

  const read = (key: string) => {
    try {
      return storage?.getItem(key) ?? null
    }
    catch {
      return null
    }
  }
  const write = (key: string, value: string) => {
    try {
      storage?.setItem(key, value)
      return !!storage
    }
    catch {
      return false
    }
  }
  const remove = (key: string) => {
    try {
      storage?.removeItem(key)
    }
    catch {}
  }

  function update(patch: Partial<OrpcPreserveLogState>) {
    const changed = (Object.keys(patch) as (keyof OrpcPreserveLogState)[]).some(key => state[key] !== patch[key])
    if (!changed)
      return
    Object.assign(state, patch)
    listeners.forEach(fn => fn({ ...state }))
  }

  function cancel() {
    clearTimeout(timer)
    timer = undefined
  }

  function save(leaving = false) {
    cancel()
    dirty = false
    lastSave = performance.now()
    if (!state.enabled || !storage)
      return
    const list = leaving
      ? leavingList()
      : store.list
    const options = { carried, clearedAt, cache }
    for (const summariesOnly of [false, true]) {
      const log = serializeLog(list, { ...options, summariesOnly })
      if (write(PRESERVE_LOG_RECORDS_KEY, log.json)) {
        update({ dropped: carried + log.dropped, summarized: log.summarized, failed: false })
        return
      }
    }
    // A refused write leaves the old value in place; remove it so a reload never shows an older list as current
    const dropped = carried + list.length
    remove(PRESERVE_LOG_RECORDS_KEY)
    write(PRESERVE_LOG_RECORDS_KEY, serializeLog([], { carried: dropped, clearedAt }).json)
    update({ dropped, summarized: 0, failed: true })
  }

  /** Trailing, at most once per interval, never inside the store's listener call */
  function schedule() {
    dirty = true
    if (!state.enabled || timer !== undefined)
      return
    timer = setTimeout(save, Math.max(0, lastSave + SAVE_INTERVAL_MS - performance.now()))
  }

  function flush() {
    hiddenAt = Date.now()
    if (state.enabled && (dirty || cutShort.size))
      save(true)
  }

  /** Back from the back/forward cache: the store is intact, so nothing is restored; only later changes to the setting or a clear apply */
  function returned() {
    const enabled = read(PRESERVE_LOG_ENABLED_KEY) === '1'
    if (!enabled) {
      cancel()
      carried = 0
      update({
        enabled: false,
        dropped: 0,
        summarized: 0,
        failed: false,
      })
      return
    }
    update({ enabled: true })
    const log = parseLog(read(PRESERVE_LOG_RECORDS_KEY))
    if (log?.clearedAt !== undefined && log.clearedAt > hiddenAt) {
      clearedAt = log.clearedAt
      carried = 0
      update({ dropped: 0, summarized: 0, failed: false })
      store.clear()
    }
  }

  function restore() {
    const raw = read(PRESERVE_LOG_RECORDS_KEY)
    const log = parseLog(raw)
    if (!log) {
      if (raw !== null)
        remove(PRESERVE_LOG_RECORDS_KEY)
      return
    }
    carried = log.dropped
    clearedAt = log.clearedAt
    store.appendOlder(log.list.map(toRestored))
  }

  let unsubscribe: () => unknown = () => {}

  const preserve: PreserveLog = {
    state,
    setEnabled(enabled) {
      if (!storage || enabled === state.enabled)
        return
      if (enabled) {
        if (!write(PRESERVE_LOG_ENABLED_KEY, '1')) {
          update({ failed: true })
          return
        }
        update({ enabled: true })
        save()
        return
      }
      cancel()
      remove(PRESERVE_LOG_ENABLED_KEY)
      remove(PRESERVE_LOG_RECORDS_KEY)
      carried = 0
      clearedAt = undefined
      update({
        enabled: false,
        dropped: 0,
        summarized: 0,
        failed: false,
      })
    },
    cleared() {
      carried = 0
      clearedAt = Date.now()
      update({ dropped: 0, summarized: 0, failed: false })
      if (state.enabled)
        save()
    },
    onState(fn) {
      listeners.add(fn)
    },
    dispose() {
      cancel()
      unsubscribe()
      removeEventListener('pagehide', flush)
      removeEventListener('pageshow', onShow)
      document.removeEventListener('visibilitychange', onVisibility)
      listeners.clear()
      if (g[STARTED_KEY] === preserve)
        delete g[STARTED_KEY]
    },
  }
  g[STARTED_KEY] = preserve

  if (storage && read(PRESERVE_LOG_ENABLED_KEY) === '1') {
    state.enabled = true
    restore()
    save()
  }
  track(store.list)
  unsubscribe = store.subscribe((list) => {
    track(list)
    schedule()
  })

  function onShow(event: Event) {
    if ((event as PageTransitionEvent).persisted)
      returned()
  }
  function onVisibility() {
    if (document.visibilityState === 'hidden')
      flush()
  }
  addEventListener('pagehide', flush)
  addEventListener('pageshow', onShow)
  document.addEventListener('visibilitychange', onVisibility)
  return preserve
}

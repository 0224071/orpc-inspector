import type { OrpcCall, OrpcCallsState, OrpcInspectorProtocol } from '../core/types'
import { createPageScriptChannel } from 'devframe/in-page-channel'
import { hydrateOrpcInspector } from '../core/ssr'
import { getOrpcInspectorStore } from '../core/store'
import { getIssueTranslator, translateCall } from '../core/translate-issues'
import { ORPC_INSPECTOR_CHANNEL, ORPC_INSPECTOR_SSR_GLOBAL } from '../core/types'
import { syncDockBadge } from './dock-badge'

const STARTED_KEY = Symbol.for('orpc-inspector:page-script')

type PageScriptChannel = ReturnType<typeof createPageScriptChannel<OrpcInspectorProtocol>>

/**
 * Copy of one record published to the panel: issues gain `translatedMessage` when a translator is registered.
 * Shared state freezes what it receives, so the store's own record stays untouched
 */
function toPublished(call: OrpcCall): OrpcCall {
  const translator = getIssueTranslator()
  return structuredClone(translator
    ? translateCall(call, translator)
    : call)
}

/** Bursts of store changes (stream events) reach the panel at most this often; the store itself updates at once */
const PUBLISH_INTERVAL_MS = 50

/** Runs at once when idle, otherwise once at the end of the interval */
function throttle(fn: () => void, ms: number) {
  let last = -Infinity
  let timer: ReturnType<typeof setTimeout> | undefined
  const run = () => {
    timer = undefined
    last = performance.now()
    fn()
  }
  return () => {
    if (timer !== undefined)
      return
    const wait = last + ms - performance.now()
    if (wait <= 0)
      run()
    else
      timer = setTimeout(run, wait)
  }
}

function sameOrder(a: readonly string[], b: readonly string[]) {
  return a.length === b.length && a.every((id, i) => id === b[i])
}

/**
 * Keeps the published state in step with the store. The store replaces a record object whenever it changes,
 * so only records whose object differs from the last published one are copied; the rest keep their frozen copies
 */
function createPublisher() {
  const sources = new Map<string, OrpcCall>()

  function initial(list: OrpcCall[]): OrpcCallsState {
    const calls: Record<string, OrpcCall> = {}
    for (const call of list) {
      calls[call.id] = toPublished(call)
      sources.set(call.id, call)
    }
    return {
      calls,
      order: list.map(call => call.id),
    }
  }

  function update(draft: OrpcCallsState, list: OrpcCall[]) {
    const ids = new Set<string>()
    for (const call of list) {
      ids.add(call.id)
      if (sources.get(call.id) !== call) {
        draft.calls[call.id] = toPublished(call)
        sources.set(call.id, call)
      }
    }
    for (const id of sources.keys()) {
      if (!ids.has(id)) {
        delete draft.calls[id]
        sources.delete(id)
      }
    }
    const order = list.map(call => call.id)
    if (!sameOrder(order, draft.order))
      draft.order = order
  }

  return { initial, update }
}

/**
 * Page script for the in-page channel: runs inside the app page and the panel handshakes with it directly,
 * bypassing the devframe server, so no authorization is needed. Returns the same channel when loaded again.
 */
export function startPageScript(): PageScriptChannel {
  const g = globalThis as { [STARTED_KEY]?: PageScriptChannel, [ORPC_INSPECTOR_SSR_GLOBAL]?: OrpcCall[] }
  if (g[STARTED_KEY])
    return g[STARTED_KEY]

  const store = getOrpcInspectorStore()
  hydrateOrpcInspector(g[ORPC_INSPECTOR_SSR_GLOBAL])

  const channel = createPageScriptChannel<OrpcInspectorProtocol>({
    name: ORPC_INSPECTOR_CHANNEL,
    functions: {
      'calls:clear': {
        type: 'action',
        handler: () => store.clear(),
      },
    },
  })
  g[STARTED_KEY] = channel

  // Subscribe before awaiting shared state so calls in between aren't missed; not awaited so app startup isn't blocked.
  // Each update sends the panel a patch with only the changed records, so its cost doesn't grow with the store
  const publisher = createPublisher()
  const state = channel.sharedState.get('calls', {
    initialValue: publisher.initial(store.list),
  })
  syncDockBadge(() => store.list, store.subscribe)

  store.subscribe(throttle(() => {
    void state.then(s => s.mutate((draft) => {
      publisher.update(draft, store.list)
    }))
  }, PUBLISH_INTERVAL_MS))

  return channel
}

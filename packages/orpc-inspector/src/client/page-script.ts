import type { OrpcCall, OrpcInspectorProtocol } from '../core/types'
import { createPageScriptChannel } from 'devframe/in-page-channel'
import { hydrateOrpcInspector } from '../core/ssr'
import { getOrpcInspectorStore } from '../core/store'
import { getIssueTranslator, translateCall } from '../core/translate-issues'
import { ORPC_INSPECTOR_CHANNEL, ORPC_INSPECTOR_SSR_GLOBAL } from '../core/types'
import { syncDockBadge } from './dock-badge'

const STARTED_KEY = Symbol.for('orpc-inspector:page-script')

type PageScriptChannel = ReturnType<typeof createPageScriptChannel<OrpcInspectorProtocol>>

/** Store replaces a call object whenever it changes, so caching by object only re-translates changed calls */
const translated = new WeakMap<OrpcCall, OrpcCall>()

/** Copy published to the panel: issues gain `translatedMessage` when a translator is registered; the store is untouched */
function toPublished(list: OrpcCall[]): OrpcCall[] {
  const translator = getIssueTranslator()
  if (!translator)
    return structuredClone(list)
  return structuredClone(list.map((call) => {
    let result = translated.get(call)
    if (!result) {
      result = translateCall(call, translator)
      translated.set(call, result)
    }
    return result
  }))
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
  // Shared state freezes objects passed in, so always pass copies to keep the store's own records mutable
  const state = channel.sharedState.get('calls', {
    initialValue: {
      list: toPublished(store.list),
    },
  })
  syncDockBadge(() => store.list, store.subscribe)

  store.subscribe((list) => {
    void state.then(s => s.mutate((draft) => {
      draft.list = toPublished(list)
    }))
  })

  return channel
}

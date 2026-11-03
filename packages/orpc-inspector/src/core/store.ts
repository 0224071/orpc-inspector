import type { OrpcCall } from './types'

const MAX_CALLS = 300
const STORE_KEY = Symbol.for('orpc-inspector:store')

type Listener = (list: OrpcCall[]) => void

interface OrpcInspectorStore {
  list: OrpcCall[]
  listeners: Set<Listener>
}

/** Global browser-side records; stored on globalThis so multiple clients and module reloads share one instance */
export function getOrpcInspectorStore() {
  const g = globalThis as { [STORE_KEY]?: OrpcInspectorStore }
  g[STORE_KEY] ??= {
    list: [],
    listeners: new Set(),
  }
  const store = g[STORE_KEY]

  const emit = () => store.listeners.forEach(fn => fn(store.list))

  return {
    get list() {
      return store.list
    },
    upsert(call: OrpcCall) {
      const index = store.list.findIndex(item => item.id === call.id)
      store.list = index < 0
        ? [call, ...store.list].slice(0, MAX_CALLS)
        : store.list.map((item, i) => (i === index
            ? call
            : item))
      emit()
    },
    clear() {
      store.list = []
      emit()
    },
    subscribe(fn: Listener) {
      store.listeners.add(fn)
      return () => store.listeners.delete(fn)
    },
  }
}

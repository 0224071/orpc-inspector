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
    /** Adds records older than every current one after them, in one update; ids already present are skipped. Returns the records added */
    appendOlder(calls: readonly OrpcCall[]): OrpcCall[] {
      const known = new Set(store.list.map(call => call.id))
      const added = calls.filter((call) => {
        if (known.has(call.id))
          return false
        known.add(call.id)
        return true
      }).slice(0, Math.max(0, MAX_CALLS - store.list.length))
      if (added.length) {
        store.list = [
          ...store.list,
          ...added,
        ]
        emit()
      }
      return added
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

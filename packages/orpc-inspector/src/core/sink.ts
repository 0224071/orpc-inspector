import type { CallSink } from './recorder'
import { getOrpcInspectorStore } from './store'

export type CollectorResolver = () => CallSink | undefined

const RESOLVER_KEY = Symbol.for('orpc-inspector:collector-resolver')

/**
 * When no collector is passed on the server, this is used per call to find the current request's collector (e.g. via AsyncLocalStorage).
 * Stored on globalThis so it survives module reloads; pass undefined to clear.
 */
export function setCollectorResolver(resolver: CollectorResolver | undefined): void {
  (globalThis as { [RESOLVER_KEY]?: CollectorResolver })[RESOLVER_KEY] = resolver
}

/** Order: explicit collector -> global store in the browser -> resolver on the server; otherwise nothing is recorded */
export function resolveSink(collector?: CallSink): CallSink | undefined {
  if (collector)
    return collector
  if (typeof window !== 'undefined') {
    const store = getOrpcInspectorStore()
    return {
      commit: call => store.upsert(call),
    }
  }
  return (globalThis as { [RESOLVER_KEY]?: CollectorResolver })[RESOLVER_KEY]?.()
}

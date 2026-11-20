import type { OrpcCall } from './types'
import { getOrpcInspectorStore } from './store'
import { ORPC_INSPECTOR_SSR_GLOBAL } from './types'

const UNSAFE_CHARS = /[<>&\u2028\u2029]/g

/** JSON safe to embed in <script>: `</script>`, `<!--` etc. are escaped as \uXXXX */
function toScriptJson(value: unknown): string {
  return JSON.stringify(value).replace(UNSAFE_CHARS, char => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`)
}

/** Builds the `<script>` that hands SSR records to the browser; insert it in the HTML before the page script */
export function renderOrpcInspectorScript(collector: { serialize: () => OrpcCall[] }): string {
  return `<script>window.${ORPC_INSPECTOR_SSR_GLOBAL}=${toScriptJson(collector.serialize())}</script>`
}

/**
 * Merges SSR records into the browser store in original order; existing ids are skipped so repeated hydration is idempotent.
 * A record with the same id restored by Preserve log is replaced, so this document's version wins (Nuxt hydrates after the restore)
 */
export function hydrateOrpcInspector(calls: readonly OrpcCall[] | undefined): void {
  if (!calls?.length)
    return
  const store = getOrpcInspectorStore()
  const known = new Map(store.list.map(call => [call.id, call]))
  for (const call of calls) {
    const existing = known.get(call.id)
    if (existing && !existing.fromPreviousPage)
      continue
    known.set(call.id, call)
    store.upsert(call)
  }
}

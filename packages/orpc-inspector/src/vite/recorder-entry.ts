import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { RECORD_MASK_KEY } from '../core/record-mask'

export const PACKAGE_NAME = 'orpc-inspector'

/** Specifiers that resolve to the no-op outside development, mapped to the dist file of their real recorder */
const RECORDER_ENTRIES: Record<string, RecorderEntry> = {
  [PACKAGE_NAME]: 'index',
  [`${PACKAGE_NAME}/v2`]: 'v2',
}

/** `index`: oRPC 1.x entry; `v2`: oRPC v2 entry */
export type RecorderEntry = 'index' | 'v2'

/** Which real recorder a bare import stands for; undefined for every other id */
export function recorderEntryOf(id: string): RecorderEntry | undefined {
  return Object.hasOwn(RECORDER_ENTRIES, id)
    ? RECORDER_ENTRIES[id]
    : undefined
}

/** Real recorder entry; after build it sits next to vite.js, from source (tests) in ../../dist */
function realRecorderEntry(entry: RecorderEntry) {
  const built = fileURLToPath(new URL(`./${entry}.js`, import.meta.url))
  const file = existsSync(built)
    ? built
    : fileURLToPath(new URL(`../../dist/${entry}.js`, import.meta.url))
  return file.replaceAll('\\', '/')
}

/** The user kept the package external (`ssr.external: true` or listing it); the SSR entry takeover then stays out */
export function keptExternal(external: true | string[] | undefined) {
  return external === true || (external?.includes(PACKAGE_NAME) ?? false)
}

/** Source of the module standing in for the bare package id */
export function recorderModule(ssr: boolean, entry: RecorderEntry = 'index') {
  const file = JSON.stringify(realRecorderEntry(entry))
  // Server records are always masked; the browser bundle is public, so mask client records too
  return ssr
    ? `export * from ${file}\n`
    : `globalThis[Symbol.for('${RECORD_MASK_KEY.description}')] = true\nexport * from ${file}\n`
}

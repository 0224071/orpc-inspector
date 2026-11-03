import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { RECORD_MASK_KEY } from '../core/record-mask'

export const PACKAGE_NAME = 'orpc-inspector'

/** Real recorder entry; after build it sits next to vite.js, from source (tests) in ../../dist */
function realRecorderEntry() {
  const built = fileURLToPath(new URL('./index.js', import.meta.url))
  const file = existsSync(built)
    ? built
    : fileURLToPath(new URL('../../dist/index.js', import.meta.url))
  return file.replaceAll('\\', '/')
}

/** The user kept the package external (`ssr.external: true` or listing it); the SSR entry takeover then stays out */
export function keptExternal(external: true | string[] | undefined) {
  return external === true || (external?.includes(PACKAGE_NAME) ?? false)
}

/** Source of the module standing in for the bare package id */
export function recorderModule(ssr: boolean) {
  const entry = JSON.stringify(realRecorderEntry())
  // Server records are always masked; the browser bundle is public, so mask client records too
  return ssr
    ? `export * from ${entry}\n`
    : `globalThis[Symbol.for('${RECORD_MASK_KEY.description}')] = true\nexport * from ${entry}\n`
}

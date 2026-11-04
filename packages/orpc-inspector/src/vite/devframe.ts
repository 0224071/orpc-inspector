import { createPluginFromDevframe } from '@vitejs/devtools-kit/node'
import { defineDevframe } from 'devframe'
import { description, homepage, name, version } from '../../package.json'
import { ORPC_INSPECTOR_DOCK_ID } from '../core/types'

const icon = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 8l-4 4 4 4"/><path d="M17 8l4 4-4 4"/><path d="M14 4l-4 16"/></svg>',
)}`

/** Internal definition; call data stays on the page's in-page channel. */
export function inspectorDevtools(route: string, panelDir: string | undefined) {
  const definition = defineDevframe({
    id: ORPC_INSPECTOR_DOCK_ID,
    name: 'oRPC',
    version,
    packageName: name,
    homepage,
    description,
    importMetaUrl: import.meta.url,
    icon,
    duplicationStrategy: 'silent',
    dock: { category: 'app', defaultOrder: 100 },
    // Builds use copyPanel / Nitro: hostStatic adds an unwanted base directory on disk.
    clientAssets: panelDir,
    setup() {},
  })
  return createPluginFromDevframe(definition, { base: route }).devtools!
}

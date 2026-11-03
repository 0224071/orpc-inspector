// Dev entry: real recorder implementation; production uses index.prod.ts (no-op with the same API)
export { OrpcInspectorCollector } from './core/collector'
export type { CallSink } from './core/recorder'
export type { CollectorResolver } from './core/sink'
export { setCollectorResolver } from './core/sink'
export { hydrateOrpcInspector, renderOrpcInspectorScript } from './core/ssr'
export type * from './core/types'
export { createOrpcInspectorInterceptors, OrpcInspectorPlugin } from './orpc-v1'
export type { OrpcInspectorInterceptors, OrpcInspectorOptions } from './orpc-v1/types'

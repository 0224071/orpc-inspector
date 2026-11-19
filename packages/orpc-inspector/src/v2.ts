// oRPC v2 dev entry: same API as index.ts with the v2 link plugin; production uses v2.prod.ts
export { OrpcInspectorCollector } from './core/collector'
export type { CallSink } from './core/recorder'
export type { CollectorResolver, OrpcInspectorOptions } from './core/sink'
export { setCollectorResolver } from './core/sink'
export { hydrateOrpcInspector, renderOrpcInspectorScript } from './core/ssr'
export type * from './core/types'
export { createOrpcInspectorInterceptors, OrpcInspectorPlugin } from './orpc-v2'
export type { OrpcInspectorInterceptors } from './orpc-v2/types'

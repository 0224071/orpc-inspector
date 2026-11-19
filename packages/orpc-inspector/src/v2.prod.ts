// oRPC v2 production entry: no-op with the same API as v2.ts; does not import the recorder, store or error classification
import type { OrpcInspectorOptions } from './core/sink'
import type { LinkOptionsLike, OrpcInspectorInterceptors } from './orpc-v2/types'
import { ORPC_INSPECTOR_PLUGIN_NAME } from './orpc-v2/types'

export type { CallSink } from './core/recorder'
export type { CollectorResolver, OrpcInspectorOptions } from './core/sink'
export type * from './core/types'
export { hydrateOrpcInspector, OrpcInspectorCollector, renderOrpcInspectorScript, setCollectorResolver } from './index.prod'
export type { OrpcInspectorInterceptors } from './orpc-v2/types'

export function createOrpcInspectorInterceptors(_options: OrpcInspectorOptions = {}): OrpcInspectorInterceptors {
  return {
    interceptor: ({ next }) => next(),
    transportInterceptor: ({ next }) => next(),
  }
}

export class OrpcInspectorPlugin {
  readonly name = ORPC_INSPECTOR_PLUGIN_NAME

  constructor(_options: OrpcInspectorOptions = {}) {}

  init<TOptions extends LinkOptionsLike>(options: TOptions): TOptions {
    return options
  }
}

// Production entry: no-op with the same API as index.ts; does not import the recorder, store or error classification
import type { ClientContext } from '@orpc/client'
import type { StandardLinkOptions, StandardLinkPlugin } from '@orpc/client/standard'
import type { CallSink } from './core/recorder'
import type { CollectorResolver } from './core/sink'
import type { OrpcCall } from './core/types'
import type { OrpcInspectorInterceptors, OrpcInspectorOptions } from './orpc-v1/types'
import { ORPC_INSPECTOR_PLUGIN_ORDER } from './orpc-v1/types'

export type { CallSink } from './core/recorder'
export type { CollectorResolver } from './core/sink'
export type * from './core/types'
export type { OrpcInspectorInterceptors, OrpcInspectorOptions } from './orpc-v1/types'

export class OrpcInspectorCollector implements CallSink {
  readonly side = 'ssr'

  commit(_call: OrpcCall, _done: boolean): void {}

  serialize(): OrpcCall[] {
    return []
  }
}

export function setCollectorResolver(_resolver: CollectorResolver | undefined): void {}

export function renderOrpcInspectorScript(_collector: { serialize: () => OrpcCall[] }): string {
  return ''
}

export function hydrateOrpcInspector(_calls: readonly OrpcCall[] | undefined): void {}

export function createOrpcInspectorInterceptors<T extends ClientContext>(
  _options: OrpcInspectorOptions = {},
): OrpcInspectorInterceptors<T> {
  return {
    interceptor: ({ next }) => next(),
    clientInterceptor: ({ next }) => next(),
  }
}

export class OrpcInspectorPlugin<T extends ClientContext> implements StandardLinkPlugin<T> {
  order = ORPC_INSPECTOR_PLUGIN_ORDER

  constructor(_options: OrpcInspectorOptions = {}) {}

  init(_options: StandardLinkOptions<T>): void {}
}

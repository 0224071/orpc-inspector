import type { ClientContext } from '@orpc/client'
import type { StandardLinkOptions, StandardLinkPlugin } from '@orpc/client/standard'
import type { OrpcInspectorInterceptors, OrpcInspectorOptions } from './types'
import { createCallRecorder } from '../core/recorder'
import { resolveSink } from '../core/sink'
import { ORPC_INSPECTOR_PLUGIN_ORDER } from './types'

/** For manual setup when the plugin cannot be used: both interceptors must go first in their arrays to wrap the validation plugins */
export function createOrpcInspectorInterceptors<T extends ClientContext>(
  { collector }: OrpcInspectorOptions = {},
): OrpcInspectorInterceptors<T> {
  const { record, recordTransport } = createCallRecorder(() => resolveSink(collector))
  return {
    interceptor: options => record(options),
    clientInterceptor: options => recordTransport(options),
  }
}

/** Add to the link's `plugins`; wraps validation, retry and other plugins regardless of array position */
export class OrpcInspectorPlugin<T extends ClientContext> implements StandardLinkPlugin<T> {
  order = ORPC_INSPECTOR_PLUGIN_ORDER
  private readonly inspectorOptions: OrpcInspectorOptions

  constructor(options: OrpcInspectorOptions = {}) {
    this.inspectorOptions = options
  }

  init(options: StandardLinkOptions<T>): void {
    const { interceptor, clientInterceptor } = createOrpcInspectorInterceptors<T>(this.inspectorOptions)
    options.interceptors ??= []
    options.clientInterceptors ??= []
    options.interceptors.unshift(interceptor)
    options.clientInterceptors.unshift(clientInterceptor)
  }
}

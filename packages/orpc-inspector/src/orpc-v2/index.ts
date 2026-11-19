import type { OrpcInspectorOptions } from '../core/sink'
import type { LinkOptionsLike, OrpcInspectorInterceptors } from './types'
import { createCallRecorder } from '../core/recorder'
import { resolveSink } from '../core/sink'
import { ORPC_INSPECTOR_PLUGIN_NAME, ORPC_V2_BUILT_IN_PLUGINS } from './types'

/** For manual setup when the plugin cannot be used: put both interceptors first in their arrays */
export function createOrpcInspectorInterceptors(
  { collector }: OrpcInspectorOptions = {},
): OrpcInspectorInterceptors {
  const { record, recordTransport } = createCallRecorder(() => resolveSink(collector))
  return {
    interceptor: record,
    transportInterceptor: recordTransport,
  }
}

/**
 * Add to an oRPC v2 link's `plugins`. Wraps oRPC's built-in plugins regardless of array position;
 * put it last to wrap your own plugins too. Returns new options and leaves the caller's object untouched.
 */
export class OrpcInspectorPlugin {
  readonly name = ORPC_INSPECTOR_PLUGIN_NAME
  after = [...ORPC_V2_BUILT_IN_PLUGINS]
  private readonly inspectorOptions: OrpcInspectorOptions

  constructor(options: OrpcInspectorOptions = {}) {
    this.inspectorOptions = options
  }

  init<TOptions extends LinkOptionsLike>(options: TOptions): TOptions {
    const { interceptor, transportInterceptor } = createOrpcInspectorInterceptors(this.inspectorOptions)
    return {
      ...options,
      interceptors: [
        interceptor,
        ...(options.interceptors ?? []),
      ],
      transportInterceptors: [
        transportInterceptor,
        ...(options.transportInterceptors ?? []),
      ],
    }
  }
}

import type { ClientContext } from '@orpc/client'
import type { StandardLinkOptions } from '@orpc/client/standard'

export type { OrpcInspectorOptions } from '../core/sink'

export type LinkInterceptor<T extends ClientContext> = NonNullable<StandardLinkOptions<T>['interceptors']>[number]

export type LinkClientInterceptor<T extends ClientContext> = NonNullable<StandardLinkOptions<T>['clientInterceptors']>[number]

export interface OrpcInspectorInterceptors<T extends ClientContext> {
  /** Put first in the link's `interceptors` */
  interceptor: LinkInterceptor<T>
  /** Put first in the link's `clientInterceptors` */
  clientInterceptor: LinkClientInterceptor<T>
}

/** Built-in plugins add interceptors with push, so unshifting in init keeps devtools outermost */
export const ORPC_INSPECTOR_PLUGIN_ORDER = 999_999

// oRPC v2 is in beta, so this entry declares the shapes it relies on instead of importing oRPC's types;
// test/orpc-v2/types.test.ts checks them against the real v2 link options

/** Name oRPC v2 uses to order link plugins */
export const ORPC_INSPECTOR_PLUGIN_NAME = 'orpc-inspector'

/** oRPC v2's built-in link plugins (as of 2.0.0-beta.51); the inspector inits after them so its interceptors end up outermost */
export const ORPC_V2_BUILT_IN_PLUGINS = [
  '~batch',
  '~cookie-jar',
  '~dedupe',
  '~request-compression',
  '~response-compression',
  '~retry',
  '~retry-after',
  '~timeout',
  '~request-validation',
  '~response-validation',
]

/** The part of v2's `StandardLinkOptions` the plugin touches */
export interface LinkOptionsLike {
  interceptors?: unknown[] | undefined
  transportInterceptors?: unknown[] | undefined
}

type StandardHeaders = Record<string, string | string[] | undefined>

/** Same shape as oRPC's InterceptorOptions */
type WithNext<TOptions, TResult> = Omit<TOptions, 'next'> & {
  next: (options?: TOptions) => TResult
}

export interface CallInterceptorOptions {
  path: readonly string[]
  input: unknown
  context: object
}

export interface TransportInterceptorOptions {
  context: object
  request: { method: string, url: string, headers: StandardHeaders }
}

export interface TransportResponse {
  status: number
  headers: StandardHeaders
}

export interface OrpcInspectorInterceptors {
  /** Put first in the link's `interceptors` */
  interceptor: <TOptions extends CallInterceptorOptions, TResult>(
    options: WithNext<TOptions, Promise<TResult>>,
  ) => Promise<TResult>
  /** Put first in the link's `transportInterceptors` */
  transportInterceptor: <TOptions extends TransportInterceptorOptions, TResponse extends TransportResponse>(
    options: WithNext<TOptions, Promise<TResponse>>,
  ) => Promise<TResponse>
}

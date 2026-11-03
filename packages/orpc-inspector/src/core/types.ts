/** Channel name shared by the page and the panel */
export const ORPC_INSPECTOR_CHANNEL = 'orpc-inspector'

/** Entry id of the Vite DevTools dock */
export const ORPC_INSPECTOR_DOCK_ID = 'orpc-inspector'

/** Panel page path; the actual URL is prefixed with the Vite base */
export const ORPC_INSPECTOR_PANEL_ROUTE = '/__orpc-inspector/'

/** Window variable holding SSR records, read when the page script starts */
export const ORPC_INSPECTOR_SSR_GLOBAL = '__ORPC_INSPECTOR_SSR__'

/** streaming: event iterator is being consumed; cancelled: the consumer stopped early */
export type OrpcCallState = 'pending' | 'streaming' | 'success' | 'error' | 'invalid' | 'cancelled'

/** zod issue parameters kept so zod locales can rebuild the message; flat, mirroring zod issue fields */
export const ISSUE_PARAM_KEYS = [
  'expected',
  'minimum',
  'maximum',
  'origin',
  'format',
  'values',
  'keys',
  'divisor',
  'inclusive',
  'exact',
  'prefix',
  'suffix',
  'includes',
  'pattern',
] as const

export interface OrpcCallIssue {
  path: (string | number)[]
  message: string
  code?: string
  expected?: string
  /** Bigint bounds are kept as `"<n>n"` strings */
  minimum?: number | string
  maximum?: number | string
  origin?: string
  format?: string
  values?: unknown[]
  keys?: string[]
  divisor?: number | string
  inclusive?: boolean
  exact?: boolean
  prefix?: string
  suffix?: string
  includes?: string
  pattern?: string
  /** Set only on records published to the panel when zodLocale applies; never recorded or serialized */
  translatedMessage?: string
}

export interface OrpcCallError {
  name: string
  message: string
  code?: string
  status?: number
  data?: unknown
}

export type OrpcHeaders = Record<string, string | string[]>

/** A single HTTP transport attempt; a call has several when retried */
export interface OrpcCallAttempt {
  method: string
  url: string
  requestHeaders?: OrpcHeaders
  /** Absent when the transport failed (e.g. network down) */
  status?: number
  responseHeaders?: OrpcHeaders
}

export interface OrpcCall {
  id: string
  /** Procedure path, e.g. `profile.get` */
  procedure: string
  method?: string
  url?: string
  /** HTTP status */
  status?: number
  side: 'client' | 'ssr'
  state: OrpcCallState
  startedAt: number
  duration?: number
  /** Request headers encoded by oRPC; excludes those added by the browser or at send time (cookie, content-type) */
  requestHeaders?: OrpcHeaders
  /** In the browser, set-cookie and headers not exposed via CORS are unavailable */
  responseHeaders?: OrpcHeaders
  input?: unknown
  /** What the backend actually returned; on validation failure, the raw data that failed the schema */
  output?: unknown
  error?: OrpcCallError
  /** Schema validation issues */
  issues?: OrpcCallIssue[]
  /** Whether issues relate to input or output; treated as output when absent (legacy records) */
  issuesOf?: 'input' | 'output'
  /** Who reported the input issues: the client's RequestValidationPlugin, or the server (oRPC `BAD_REQUEST` with `data.issues`); treated as client when absent */
  issuesSource?: 'client' | 'server'
  /** Transport attempts in order; top-level method, url, status and headers come from the last one; empty if no request was sent */
  attempts?: OrpcCallAttempt[]
  /** Events received by the event iterator; only the last 100 are kept */
  events?: unknown[]
  /** Total number of events received by the event iterator */
  eventCount?: number
}

export interface OrpcCallsState {
  list: OrpcCall[]
}

// InPageChannelProtocol requires a Record index signature, which interfaces can't implicitly satisfy, so use a type
// eslint-disable-next-line ts/consistent-type-definitions
export type OrpcInspectorProtocol = {
  functions: {
    pageScript: {
      'calls:clear': () => void
    }
  }
  sharedStates: {
    calls: OrpcCallsState
  }
}

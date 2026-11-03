import type { OrpcCall, OrpcCallAttempt } from './types'
import { classifyError, toPlain } from './classify-error'
import { toHeaderRecord } from './headers'
import { isRecordMaskEnabled } from './record-mask'

/**
 * Links the two interceptor layers: record() writes the record into the shallow-copied context passed down.
 * Stays correct when an inner layer swaps context via next({ context: newObject }) or when multiple calls share one context.
 */
export const CALL: unique symbol = Symbol('orpc-inspector:call')

export interface CallSink {
  /** done is false while the call is in flight; the sink receives a snapshot of the current state */
  commit: (call: OrpcCall, done: boolean) => void
  /** Side of the record; inferred from the runtime if omitted. Always `ssr` for the SSR collector */
  side?: OrpcCall['side']
}

/** Resolves the target per call; returning undefined skips recording */
export type CallSinkSource = CallSink | (() => CallSink | undefined)

type StandardHeaders = Record<string, string | string[] | undefined>

interface RecordableOptions {
  path: readonly string[]
  input: unknown
  context: object
}

interface TransportableOptions {
  context: object
  request: { method: string, url: URL, headers: StandardHeaders }
}

/** Same shape as oRPC's InterceptorOptions so the core doesn't import oRPC plugin types */
type WithNext<TOptions, TResult> = Omit<TOptions, 'next'> & {
  next: (options?: TOptions) => TResult
}

type CallContext = object & { [CALL]?: OrpcCall }

export function getSide(): OrpcCall['side'] {
  return typeof window === 'undefined'
    ? 'ssr'
    : 'client'
}

function createId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/** Only the last few stream events are kept per record */
export const MAX_EVENTS = 100

/** Snapshots passed to the sink must not share arrays with later updates */
function snapshot(call: OrpcCall): OrpcCall {
  return {
    ...call,
    attempts: call.attempts?.map(attempt => ({ ...attempt })),
    events: call.events?.slice(),
  }
}

function isEventIterator(value: unknown): value is AsyncIterator<unknown> & AsyncIterable<unknown> {
  // ReadableStream also has Symbol.asyncIterator, but no next
  return typeof value === 'object'
    && value !== null
    && typeof (value as AsyncIterable<unknown>)[Symbol.asyncIterator] === 'function'
    && typeof (value as AsyncIterator<unknown>).next === 'function'
}

export function createCallRecorder(sink: CallSinkSource) {
  const resolveSink = typeof sink === 'function'
    ? sink
    : () => sink

  /** Wraps the outermost layer of the link's interceptors: one record per call */
  async function record<TOptions extends RecordableOptions, TResult>(
    options: WithNext<TOptions, Promise<TResult>>,
  ): Promise<TResult> {
    const target = resolveSink()
    if (!target)
      return options.next()

    const { next, ...rest } = options
    const side = target.side ?? getSide()
    // SSR records go into the HTML, and opted-in production builds are public, so mask at record time
    const mask = side === 'ssr' || isRecordMaskEnabled()
    const call: OrpcCall = {
      id: createId(),
      procedure: rest.path.join('.'),
      side,
      state: 'pending',
      startedAt: Date.now(),
      input: toPlain(rest.input),
      attempts: [],
    }
    const commit = (done: boolean) => target.commit(snapshot(call), done)
    const fail = (error: unknown) => {
      Object.assign(call, classifyError(error, mask))
    }
    const finish = () => {
      call.duration = Date.now() - call.startedAt
      commit(true)
    }
    commit(false)

    let output: TResult
    try {
      output = await next({
        ...rest,
        context: { ...rest.context, [CALL]: call },
      } as unknown as TOptions)
    }
    catch (error) {
      fail(error)
      finish()
      throw error
    }

    if (isEventIterator(output)) {
      call.state = 'streaming'
      call.events = []
      call.eventCount = 0
      commit(false)
      return wrapEventIterator(output, {
        onEvent(value) {
          call.events!.push(toPlain(value))
          if (call.events!.length > MAX_EVENTS)
            call.events!.shift()
          call.eventCount! += 1
          commit(false)
        },
        onEnd(state, error) {
          if (state === 'error')
            fail(error)
          else
            call.state = state
          finish()
        },
      }) as TResult
    }

    call.state = 'success'
    call.output = toPlain(output)
    finish()
    return output
  }

  /** Wraps the outermost layer of the link's clientInterceptors: records HTTP method, url, headers and status per transport attempt */
  async function recordTransport<
    TOptions extends TransportableOptions,
    TResponse extends { status: number, headers: StandardHeaders },
  >(options: WithNext<TOptions, Promise<TResponse>>): Promise<TResponse> {
    const call = (options.context as CallContext)[CALL]
    const mask = call?.side === 'ssr' || isRecordMaskEnabled()
    const attempt: OrpcCallAttempt = {
      method: options.request.method,
      url: options.request.url.toString(),
      requestHeaders: toHeaderRecord(options.request.headers, mask),
    }
    // Top-level fields reflect the last attempt; a previous status must not linger
    const syncTop = () => {
      if (!call)
        return
      call.method = attempt.method
      call.url = attempt.url
      call.requestHeaders = attempt.requestHeaders
      call.status = attempt.status
      call.responseHeaders = attempt.responseHeaders
    }
    call?.attempts?.push(attempt)
    syncTop()
    const response = await options.next()
    attempt.status = response.status
    attempt.responseHeaders = toHeaderRecord(response.headers, mask)
    syncTop()
    return response
  }

  return { record, recordTransport }
}

interface EventIteratorHooks {
  onEvent: (value: unknown) => void
  onEnd: (state: 'success' | 'error' | 'cancelled', error?: unknown) => void
}

/** Observes without changing behavior: values and errors pass through as-is; return()/throw() are forwarded upstream */
function wrapEventIterator<T>(
  source: AsyncIterator<T> & AsyncIterable<T>,
  hooks: EventIteratorHooks,
): AsyncIterableIterator<T> {
  let ended = false
  const end = (state: 'success' | 'error' | 'cancelled', error?: unknown) => {
    if (ended)
      return
    ended = true
    hooks.onEnd(state, error)
  }

  const observe = async (step: () => Promise<IteratorResult<T>>) => {
    try {
      const result = await step()
      if (result.done)
        end('success')
      else if (!ended)
        hooks.onEvent(result.value)
      return result
    }
    catch (error) {
      end('error', error)
      throw error
    }
  }

  const wrapped: AsyncIterableIterator<T> & { [Symbol.asyncDispose]?: () => Promise<void> } = {
    next: (...args: [] | [unknown]) => observe(() => source.next(...args)),
    async return(value?: unknown) {
      end('cancelled')
      return source.return
        ? source.return(value)
        : { done: true, value: value as T }
    },
    throw(error?: unknown) {
      if (!source.throw) {
        end('error', error)
        return Promise.reject(error)
      }
      return observe(() => source.throw!(error))
    },
    [Symbol.asyncIterator]() {
      return wrapped
    },
  }
  if (Symbol.asyncDispose && Symbol.asyncDispose in source) {
    wrapped[Symbol.asyncDispose] = async () => {
      await wrapped.return!()
    }
  }
  return wrapped
}

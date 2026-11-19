// Adapted from the recorder-hook spike that validated the interceptor approach on real oRPC
import type { ClientContext } from '@orpc/client'
import type { StandardLinkOptions, StandardLinkPlugin } from '@orpc/client/standard'
import type { LinkKind } from './fixtures'
import { BatchLinkPlugin, ClientRetryPlugin } from '@orpc/client/plugins'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MAX_EVENTS } from '../../src/core/recorder'
import { getOrpcInspectorStore } from '../../src/core/store'
import { OrpcInspectorPlugin } from '../../src/index'
import { createClient, createServer, validationPlugins } from './fixtures'

beforeEach(() => {
  vi.stubGlobal('window', globalThis)
  getOrpcInspectorStore().clear()
})
afterEach(() => {
  vi.unstubAllGlobals()
})

/** The store is newest-first; convert to call order here */
const calls = () => getOrpcInspectorStore().list.slice().reverse()

/** Inner interceptor that swaps context (higher order than devtools, pushed after it) */
const replaceContextPlugin: StandardLinkPlugin<ClientContext> = {
  order: 2_000_000,
  init(options) {
    options.interceptors ??= []
    options.interceptors.push(({ next, ...rest }) => next({
      ...rest,
      context: { ...rest.context, extra: 1 },
    }))
  },
}

/** The original WeakMap<context> linking, kept as a regression baseline */
function createWeakMapPlugin(sink: { attempts: number }[]): StandardLinkPlugin<ClientContext> {
  const byContext = new WeakMap<object, { attempts: number }>()
  return {
    order: 999_999,
    init(options: StandardLinkOptions<ClientContext>) {
      options.interceptors ??= []
      options.clientInterceptors ??= []
      options.interceptors.unshift(({ context, next }) => {
        const call = { attempts: 0 }
        sink.push(call)
        byContext.set(context, call)
        return next()
      })
      options.clientInterceptors.unshift(({ context, next }) => {
        const call = byContext.get(context)
        if (call)
          call.attempts += 1
        return next()
      })
    },
  }
}

describe('concurrent calls sharing a context object', () => {
  it('each record has only its own attempt', async () => {
    const client = createClient('rpc', createServer(), {
      plugins: [
        new OrpcInspectorPlugin(),
      ],
    })
    const shared = {}
    await Promise.all([
      client.slow({ ms: 30, tag: 'a' }, { context: shared }),
      client.slow({ ms: 10, tag: 'b' }, { context: shared }),
    ])

    expect(calls().map(call => call.attempts?.length)).toEqual([1, 1])
    expect(calls().map(call => call.input)).toEqual([
      { ms: 30, tag: 'a' },
      { ms: 10, tag: 'b' },
    ])
  })

  it('regression: the WeakMap version mismatches', async () => {
    const sink: { attempts: number }[] = []
    const client = createClient('rpc', createServer(), {
      plugins: [
        createWeakMapPlugin(sink),
      ],
    })
    const shared = {}
    await Promise.all([
      client.slow({ ms: 30, tag: 'a' }, { context: shared }),
      client.slow({ ms: 10, tag: 'b' }, { context: shared }),
    ])
    expect(sink.map(call => call.attempts)).not.toEqual([1, 1])
  })
})

describe('inner interceptor swaps context', () => {
  it('still captures method, url and status', async () => {
    const client = createClient('rpc', createServer(), {
      plugins: [
        new OrpcInspectorPlugin(),
        replaceContextPlugin,
      ],
    })
    await client.ping({ n: 2 })

    expect(calls()[0]).toMatchObject({
      method: 'POST',
      url: 'http://local/rpc/ping',
      status: 200,
    })
    expect(calls()[0]!.attempts).toHaveLength(1)
  })

  it('regression: the WeakMap version fails to match', async () => {
    const sink: { attempts: number }[] = []
    const client = createClient('rpc', createServer(), {
      plugins: [
        createWeakMapPlugin(sink),
        replaceContextPlugin,
      ],
    })
    await client.ping({ n: 2 })
    expect(sink[0]!.attempts).toBe(0)
  })
})

describe('retry', () => {
  it('one record with attempts 500, 500, 200 in order; top level uses the last', async () => {
    const client = createClient('rpc', createServer(), {
      plugins: [
        new OrpcInspectorPlugin(),
        new ClientRetryPlugin({
          default: { retry: 3, retryDelay: 0 },
        }),
      ],
    })
    await expect(client.flaky()).resolves.toBe('ok')

    expect(calls()).toHaveLength(1)
    const [call] = calls()
    expect(call!.attempts!.map(attempt => attempt.status)).toEqual([500, 500, 200])
    expect(call).toMatchObject({ state: 'success', status: 200 })
  })
})

describe('batch', () => {
  it('each call records only the request for its own procedure', async () => {
    const client = createClient('rpc', createServer(), {
      plugins: [
        new OrpcInspectorPlugin(),
        new BatchLinkPlugin({
          groups: [
            {
              condition: () => true,
              context: {},
            },
          ],
        }),
      ],
    })
    await Promise.all([
      client.ping({ n: 1 }),
      client.ping({ n: 2 }),
    ])

    expect(calls()).toHaveLength(2)
    for (const call of calls()) {
      expect(call.attempts).toHaveLength(1)
      expect(call.url).toBe('http://local/rpc/ping')
      expect(call.state).toBe('success')
    }
  })
})

describe.each<LinkKind>(['rpc', 'openapi'])('event iterator (%s)', (kind) => {
  const setup = () => createClient(kind, createServer(), {
    plugins: [
      new OrpcInspectorPlugin(),
      ...validationPlugins(),
    ],
  })

  it('full consumption: events in order, state success', async () => {
    const values: number[] = []
    for await (const value of await setup().stream({ count: 3 }))
      values.push(value)

    expect(values).toEqual([1, 2, 3])
    expect(calls()[0]).toMatchObject({
      state: 'success',
      events: [1, 2, 3],
      eventCount: 3,
    })
  })

  it('is streaming while being consumed', async () => {
    const iterator = await setup().stream({ count: 3 })
    await iterator.next()
    expect(calls()[0]).toMatchObject({
      state: 'streaming',
      events: [1],
      eventCount: 1,
    })
    await iterator.return?.()
  })

  it('early break: cancelled', async () => {
    for await (const value of await setup().stream({ count: 3 })) {
      if (value === 1)
        break
    }
    expect(calls()[0]).toMatchObject({
      state: 'cancelled',
      events: [1],
    })
  })

  it(`over ${MAX_EVENTS} events: keeps the last ${MAX_EVENTS} with a correct total`, async () => {
    for await (const _ of await setup().stream({ count: 150 })) {
      // Read everything
    }
    const [call] = calls()
    expect(call!.eventCount).toBe(150)
    expect(call!.events).toEqual(Array.from({ length: 100 }, (_, i) => i + 51))
  })
})

/** The fixture server ignores the request signal; abort the request and the body the way fetch does */
function abortable(server: ReturnType<typeof createServer>): ReturnType<typeof createServer> {
  const wrap = (handle: (request: Request) => Promise<Response>) => (request: Request) => new Promise<Response>((resolve, reject) => {
    const { signal } = request
    if (signal.aborted)
      return reject(signal.reason)
    signal.addEventListener('abort', () => reject(signal.reason))
    handle(request).then(response => resolve(response.body
      ? new Response(response.body.pipeThrough(new TransformStream(), { signal }), response)
      : response), reject)
  })
  return {
    rpcFetch: wrap(server.rpcFetch),
    openapiFetch: wrap(server.openapiFetch),
  }
}

describe('abort', () => {
  const setup = () => createClient('rpc', abortable(createServer()), {
    plugins: [
      new OrpcInspectorPlugin(),
    ],
  })

  it('a call aborted in flight is cancelled with no error, and the caller still gets the abort error', async () => {
    const controller = new AbortController()
    const reason = new Error('user left')
    const pending = setup().slow({ ms: 50, tag: 'a' }, { signal: controller.signal })
    controller.abort(reason)

    await expect(pending).rejects.toBe(reason)
    const [call] = calls()
    expect(call!.state).toBe('cancelled')
    expect(call!.error).toBeUndefined()
  })

  it('a stream aborted after two events is cancelled with no error and keeps the events', async () => {
    const controller = new AbortController()
    const iterator = await setup().drip({ count: 5, ms: 5 }, { signal: controller.signal })
    const values: number[] = []
    await expect((async () => {
      for await (const value of iterator) {
        values.push(value)
        if (values.length === 2)
          controller.abort()
      }
    })()).rejects.toThrow()

    expect(values).toEqual([1, 2])
    const [call] = calls()
    expect(call).toMatchObject({
      state: 'cancelled',
      events: [1, 2],
      eventCount: 2,
    })
    expect(call!.error).toBeUndefined()
  })

  it('a stream that fails without an abort stays an error and keeps its events', async () => {
    await expect((async () => {
      for await (const _ of await setup().streamFail({ count: 2 })) {
        // Read until it fails
      }
    })()).rejects.toThrow()

    const [call] = calls()
    expect(call).toMatchObject({
      state: 'error',
      events: [0, 1],
      eventCount: 2,
    })
    expect(call!.error).toBeDefined()
  })
})

describe('stream reconnect', () => {
  it('marks how many events came before each reconnect attempt', async () => {
    const client = createClient('rpc', createServer(), {
      plugins: [
        new OrpcInspectorPlugin(),
        new ClientRetryPlugin({
          default: { retry: 2, retryDelay: 0 },
        }),
      ],
    })
    const values: number[] = []
    await expect((async () => {
      for await (const value of await client.streamFail({ count: 2 }))
        values.push(value)
    })()).rejects.toThrow()

    expect(values).toEqual([0, 1, 0, 1, 0, 1])
    const [call] = calls()
    expect(call!.events).toEqual([0, 1, 0, 1, 0, 1])
    expect(call!.attempts!.map(attempt => attempt.eventsBefore)).toEqual([undefined, 2, 4])
  })

  it('a retried plain call has no marker', async () => {
    const client = createClient('rpc', createServer(), {
      plugins: [
        new OrpcInspectorPlugin(),
        new ClientRetryPlugin({
          default: { retry: 3, retryDelay: 0 },
        }),
      ],
    })
    await client.flaky()
    const [call] = calls()
    expect(call!.attempts).toHaveLength(3)
    for (const attempt of call!.attempts!)
      expect(attempt).not.toHaveProperty('eventsBefore')
  })
})

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

import type { ClientContext } from '@orpc/client-v2'
import type { StandardLinkOptions } from '@orpc/client-v2/standard'
import type { OrpcCall } from '../../src/core/types'
import type { LinkKind } from './fixtures'
import { createORPCClient } from '@orpc/client-v2'
import { RPCLink } from '@orpc/client-v2/fetch'
import { RetryLinkPlugin } from '@orpc/client-v2/plugins'
import { ResponseValidationLinkPlugin } from '@orpc/contract-v2/plugins'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getOrpcInspectorStore } from '../../src/core/store'
import { createOrpcInspectorInterceptors, OrpcInspectorCollector, OrpcInspectorPlugin } from '../../src/v2'
import { contract, createClient, createServer, validationPlugins } from './fixtures'

const kinds: LinkKind[] = ['rpc', 'openapi']

// Simulate the browser in node: without a collector, records go to the global store
beforeEach(() => {
  vi.stubGlobal('window', globalThis)
  getOrpcInspectorStore().clear()
})
afterEach(() => {
  vi.unstubAllGlobals()
})

const calls = () => getOrpcInspectorStore().list

describe.each(kinds)('v2 OrpcInspectorPlugin (%s)', (kind) => {
  it('successful call returns the original value and records success', async () => {
    const client = createClient(kind, createServer(), {
      plugins: [
        new OrpcInspectorPlugin(),
        ...validationPlugins(),
      ],
    })
    await expect(client.ping({ n: 1 })).resolves.toEqual({ n: 1 })
    expect(calls()).toHaveLength(1)
    expect(calls()[0]).toMatchObject({
      procedure: 'ping',
      side: 'client',
      state: 'success',
      input: { n: 1 },
      output: { n: 1 },
      status: 200,
    })
  })

  it.each([
    [
      'inspector first',
      () => [
        new OrpcInspectorPlugin(),
        new ResponseValidationLinkPlugin(contract),
      ],
    ],
    [
      'inspector last',
      () => [
        new ResponseValidationLinkPlugin(contract),
        new OrpcInspectorPlugin(),
      ],
    ],
  ])('%s: output validation failure is recorded as invalid/output', async (_, plugins) => {
    const client = createClient(kind, createServer(), {
      plugins: plugins(),
    })
    await expect(client.bad()).rejects.toThrow()

    expect(calls()).toHaveLength(1)
    expect(calls()[0]).toMatchObject({
      procedure: 'bad',
      state: 'invalid',
      issuesOf: 'output',
      output: { ok: 'not-boolean' },
      issues: [
        {
          path: ['ok'],
          message: 'Expected boolean',
        },
      ],
      status: 200,
      error: { code: 'INTERNAL_SERVER_ERROR' },
    })
  })

  it('client input validation failure: invalid/input, request not sent, no status', async () => {
    const client = createClient(kind, createServer(), {
      plugins: [
        ...validationPlugins(),
        new OrpcInspectorPlugin(),
      ],
    })
    // @ts-expect-error intentionally wrong type
    await expect(client.ping({ n: 'x' })).rejects.toThrow()

    const [call] = calls()
    expect(call).toMatchObject({
      state: 'invalid',
      issuesOf: 'input',
      attempts: [],
      error: { code: 'BAD_REQUEST' },
    })
    expect(call).not.toHaveProperty('status')
    expect(call!.error!.status).toBeUndefined()
  })

  it('server input validation failure: invalid/input from the server with status 400', async () => {
    const client = createClient(kind, createServer(), {
      plugins: [
        new OrpcInspectorPlugin(),
      ],
    })
    // @ts-expect-error intentionally wrong type
    await expect(client.ping({ n: 'x' })).rejects.toThrow()

    expect(calls()[0]).toMatchObject({
      state: 'invalid',
      issuesOf: 'input',
      issuesSource: 'server',
      issues: [
        {
          path: ['n'],
          message: 'Expected number',
        },
      ],
      status: 400,
      error: { code: 'BAD_REQUEST', status: 400 },
    })
  })

  it('backend 403: error status comes from the response', async () => {
    const client = createClient(kind, createServer(), {
      plugins: [
        new OrpcInspectorPlugin(),
      ],
    })
    await expect(client.fail()).rejects.toThrow()

    expect(calls()[0]).toMatchObject({
      state: 'error',
      status: 403,
      error: {
        name: 'ORPCError',
        code: 'FORBIDDEN',
        status: 403,
        message: 'nope',
      },
    })
  })

  it('retry: one record with every attempt, regardless of plugin order', async () => {
    const client = createClient(kind, createServer(), {
      plugins: [
        new OrpcInspectorPlugin(),
        new RetryLinkPlugin({
          default: { retry: 2, retryDelay: 0 },
        }),
      ],
    })
    await expect(client.flaky()).resolves.toBe('ok')

    expect(calls()).toHaveLength(1)
    expect(calls()[0]).toMatchObject({ state: 'success', status: 200 })
    expect(calls()[0]!.attempts!.map(attempt => attempt.status)).toEqual([500, 500, 200])
  })

  it('stream: events recorded, success on completion', async () => {
    const client = createClient(kind, createServer(), {
      plugins: [
        new OrpcInspectorPlugin(),
      ],
    })
    const iterator = await client.stream({ count: 3 })
    const received: number[] = []
    for await (const value of iterator)
      received.push(value)

    expect(received).toEqual([1, 2, 3])
    expect(calls()[0]).toMatchObject({
      state: 'success',
      events: [1, 2, 3],
      eventCount: 3,
    })
  })

  it('stream: early stop is recorded as cancelled', async () => {
    const client = createClient(kind, createServer(), {
      plugins: [
        new OrpcInspectorPlugin(),
      ],
    })
    const iterator = await client.stream({ count: 3 })
    for await (const value of iterator) {
      if (value === 1)
        break
    }

    expect(calls()[0]).toMatchObject({
      state: 'cancelled',
      events: [1],
    })
  })
})

describe('v2 transport info', () => {
  it('rPCLink: method, url, request/response headers, status', async () => {
    const client = createClient('rpc', createServer(), {
      plugins: [
        new OrpcInspectorPlugin(),
      ],
      headers: { 'x-trace': 'abc' },
    })
    await client.ping({ n: 1 })

    const [call] = calls()
    expect(call).toMatchObject({
      method: 'POST',
      url: '/rpc/ping',
      status: 200,
      requestHeaders: { 'x-trace': 'abc' },
    })
    expect(call!.responseHeaders).toHaveProperty('content-type')
  })

  it('rPCLink with GET: url keeps the query', async () => {
    const client = createClient('rpc', createServer(), {
      plugins: [
        new OrpcInspectorPlugin(),
      ],
      method: 'GET',
    })
    // Only the recorded request matters here, not whether the handler accepts GET
    await client.find({ q: 'x' }).catch(() => {})

    const [call] = calls()
    expect(call).toMatchObject({ method: 'GET' })
    expect(call!.url).toMatch(/^\/rpc\/find\?data=.*%22q%22%3A%22x%22/)
  })

  it('openAPILink with a separate origin: url is the path oRPC passes to transport interceptors', async () => {
    const client = createClient('openapi', createServer(), {
      plugins: [
        new OrpcInspectorPlugin(),
      ],
    })
    await client.find({ q: 'hello' })

    const [call] = calls()
    expect(call).toMatchObject({ method: 'GET', status: 200 })
    expect(call!.url).toMatch(/^\/api\/find\?.*q=hello/)
  })

  it('non-oRPC error response: MalformedResponseError with status and masked data', async () => {
    const collector = new OrpcInspectorCollector()
    const gateway = async () => new Response('{"message":"Bad gateway"}', {
      status: 502,
      headers: { 'content-type': 'application/json', 'set-cookie': 'sid=1' },
    })
    const client = createORPCClient<{ ping: (input: { n: number }) => Promise<unknown> }>(
      new RPCLink({
        origin: 'http://local',
        url: '/rpc',
        fetch: gateway,
        plugins: [
          new OrpcInspectorPlugin({ collector }),
        ],
      }),
    )
    await expect(client.ping({ n: 1 })).rejects.toThrow()

    const [call] = collector.serialize()
    expect(call).toMatchObject({
      state: 'error',
      status: 502,
      error: {
        name: 'MalformedResponseError',
        status: 502,
        data: {
          status: 502,
          body: { message: 'Bad gateway' },
          headers: { 'set-cookie': '***' },
        },
      },
    })
  })

  it('non-oRPC HTML response: the unread body is not consumed', async () => {
    const collector = new OrpcInspectorCollector()
    const gateway = async () => new Response('<html>Bad gateway</html>', {
      status: 502,
      headers: { 'content-type': 'text/html' },
    })
    const client = createORPCClient<{ ping: (input: { n: number }) => Promise<unknown> }>(
      new RPCLink({
        origin: 'http://local',
        url: '/rpc',
        fetch: gateway,
        plugins: [
          new OrpcInspectorPlugin({ collector }),
        ],
      }),
    )
    const error = await client.ping({ n: 1 }).then(
      () => undefined,
      (error: unknown) => error as { response: { body: ReadableStream } },
    )

    expect(collector.serialize()[0]!.error).toMatchObject({
      name: 'MalformedResponseError',
      status: 502,
      data: { status: 502, body: '[ReadableStream]' },
    })
    expect(error!.response.body.locked).toBe(false)
  })
})

describe('v2 link options', () => {
  it('plugin init returns new options and leaves the caller\'s object untouched', () => {
    const interceptor = async ({ next }: { next: () => Promise<unknown> }) => next()
    const options: StandardLinkOptions<ClientContext> = {
      interceptors: [interceptor],
    }
    const result = new OrpcInspectorPlugin().init(options)

    expect(options).toEqual({
      interceptors: [interceptor],
    })
    expect(result.interceptors).toHaveLength(2)
    expect(result.interceptors![1]).toBe(interceptor)
    expect(result.transportInterceptors).toHaveLength(1)
  })

  it('two links built from one options object record each call once', async () => {
    const server = createServer()
    const options = {
      plugins: [
        new OrpcInspectorPlugin(),
      ],
    }
    const first = createClient('rpc', server, options)
    const second = createClient('rpc', server, options)
    await first.ping({ n: 1 })
    await second.ping({ n: 2 })

    expect(calls()).toHaveLength(2)
    expect(calls().every(call => call.attempts!.length === 1)).toBe(true)
    expect(options).toEqual({
      plugins: [
        expect.any(OrpcInspectorPlugin),
      ],
    })
  })
})

describe('v2 createOrpcInspectorInterceptors', () => {
  it('placed first in interceptors/transportInterceptors, yields the same fields as the plugin', async () => {
    const server = createServer()
    const viaPlugin = createClient('rpc', server, {
      plugins: [
        new OrpcInspectorPlugin(),
        ...validationPlugins(),
      ],
    })
    const { interceptor, transportInterceptor } = createOrpcInspectorInterceptors()
    const viaInterceptors = createClient('rpc', server, {
      plugins: validationPlugins(),
      interceptors: [interceptor],
      transportInterceptors: [transportInterceptor],
    })

    await viaPlugin.bad().catch(() => {})
    await viaInterceptors.bad().catch(() => {})

    const strip = ({ id: _id, startedAt: _s, duration: _d, ...rest }: OrpcCall) => rest
    const [second, first] = calls()
    expect(strip(second!)).toEqual(strip(first!))
    expect(first).toMatchObject({ state: 'invalid', issuesOf: 'output' })
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

describe.each(kinds)('v2 abort (%s)', (kind) => {
  const setup = () => createClient(kind, abortable(createServer()), {
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

describe('v2 stream reconnect', () => {
  it('marks how many events came before each reconnect attempt', async () => {
    const client = createClient('rpc', createServer(), {
      plugins: [
        new OrpcInspectorPlugin(),
        new RetryLinkPlugin({
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
        new RetryLinkPlugin({
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

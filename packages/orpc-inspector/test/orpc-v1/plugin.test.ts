import type { OrpcCall } from '../../src/core/types'
import type { LinkKind } from './fixtures'
import { ResponseValidationPlugin } from '@orpc/contract/plugins'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getOrpcInspectorStore } from '../../src/core/store'
import { createOrpcInspectorInterceptors, OrpcInspectorPlugin } from '../../src/index'
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

describe.each(kinds)('orpcInspectorPlugin (%s)', (kind) => {
  it.each([
    [
      'devtools first',
      () => [
        new OrpcInspectorPlugin(),
        new ResponseValidationPlugin(contract),
      ],
    ],
    [
      'devtools last',
      () => [
        new ResponseValidationPlugin(contract),
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
      side: 'client',
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
    })
  })

  it('input validation failure: invalid/input, request not sent', async () => {
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
    })
    expect(call).not.toHaveProperty('method')
    expect(call).not.toHaveProperty('url')
    expect(call).not.toHaveProperty('status')
  })

  it('backend 404: error with code and status', async () => {
    const client = createClient(kind, createServer(), {
      plugins: [
        new OrpcInspectorPlugin(),
      ],
    })
    await expect(client.fail()).rejects.toThrow()

    expect(calls()[0]).toMatchObject({
      state: 'error',
      status: 404,
      error: { code: 'NOT_FOUND', status: 404, message: 'nope' },
    })
  })

  it('successful call returns the original value and records success', async () => {
    const client = createClient(kind, createServer(), {
      plugins: [
        new OrpcInspectorPlugin(),
        ...validationPlugins(),
      ],
    })
    await expect(client.ping({ n: 1 })).resolves.toEqual({ n: 1 })
    expect(calls()[0]).toMatchObject({
      procedure: 'ping',
      state: 'success',
      input: { n: 1 },
      output: { n: 1 },
    })
  })
})

describe('transport info', () => {
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
      url: 'http://local/rpc/ping',
      status: 200,
      requestHeaders: { 'x-trace': 'abc' },
    })
    expect(call!.responseHeaders).toHaveProperty('content-type')
    expect(call!.attempts).toEqual([
      {
        method: call!.method,
        url: call!.url,
        requestHeaders: call!.requestHeaders,
        status: call!.status,
        responseHeaders: call!.responseHeaders,
      },
    ])
  })

  it('openAPILink: GET url includes the query', async () => {
    const client = createClient('openapi', createServer(), {
      plugins: [
        new OrpcInspectorPlugin(),
      ],
      headers: { 'x-trace': 'abc' },
    })
    await client.find({ q: 'hello' })

    const [call] = calls()
    expect(call).toMatchObject({
      method: 'GET',
      status: 200,
      requestHeaders: { 'x-trace': 'abc' },
    })
    expect(call!.url).toMatch(/^http:\/\/local\/api\/find\?.*q=hello/)
    expect(call!.responseHeaders).toHaveProperty('content-type')
  })
})

describe('createOrpcInspectorInterceptors', () => {
  it('placing manually first in interceptors/clientInterceptors yields the same fields as the plugin', async () => {
    const server = createServer()
    const viaPlugin = createClient('rpc', server, {
      plugins: [
        new OrpcInspectorPlugin(),
        ...validationPlugins(),
      ],
    })
    const { interceptor, clientInterceptor } = createOrpcInspectorInterceptors()
    const viaInterceptors = createClient('rpc', server, {
      plugins: validationPlugins(),
      interceptors: [interceptor],
      clientInterceptors: [clientInterceptor],
    })

    await viaPlugin.bad().catch(() => {})
    await viaInterceptors.bad().catch(() => {})

    const strip = ({ id: _id, startedAt: _s, duration: _d, ...rest }: OrpcCall) => rest
    const [second, first] = calls()
    expect(strip(second!)).toEqual(strip(first!))
    expect(first).toMatchObject({ state: 'invalid', issuesOf: 'output' })
  })
})

describe('server side', () => {
  it('records nothing without window or collector, and the call proceeds normally', async () => {
    vi.unstubAllGlobals()
    const client = createClient('rpc', createServer(), {
      plugins: [
        new OrpcInspectorPlugin(),
      ],
    })
    await expect(client.ping({ n: 1 })).resolves.toEqual({ n: 1 })
    expect(calls()).toHaveLength(0)
  })
})

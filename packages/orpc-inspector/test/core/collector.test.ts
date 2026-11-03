import type { OrpcInspectorCollector as CollectorType } from '../../src/index'
import { AsyncLocalStorage } from 'node:async_hooks'
import { ORPCError } from '@orpc/client'
import { ValidationError } from '@orpc/contract'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createCallRecorder } from '../../src/core/recorder'
import { getOrpcInspectorStore } from '../../src/core/store'
import { hydrateOrpcInspector, OrpcInspectorCollector, OrpcInspectorPlugin, renderOrpcInspectorScript, setCollectorResolver } from '../../src/index'
import { createClient, createServer } from '../orpc-v1/fixtures'

afterEach(() => {
  setCollectorResolver(undefined)
  vi.unstubAllGlobals()
  getOrpcInspectorStore().clear()
})

describe('orpcInspectorCollector', () => {
  it('collects only completed calls and excludes in-flight ones when serializing', async () => {
    const collector = new OrpcInspectorCollector()
    const { record } = createCallRecorder(collector)
    let resolve!: () => void
    const pending = record({
      path: ['slow'],
      input: undefined,
      context: {},
      next: () => new Promise<void>((r) => {
        resolve = r
      }),
    })
    // Make the two startedAt values differ
    await new Promise(r => setTimeout(r, 5))
    await record({
      path: ['fast'],
      input: undefined,
      context: {},
      next: async () => 'ok',
    })

    expect(collector.serialize().map(call => call.procedure)).toEqual(['fast'])
    resolve()
    await pending
    // Sorted by start time
    expect(collector.serialize().map(call => call.procedure)).toEqual(['slow', 'fast'])
  })

  it('uses side ssr and masks authorization on write', async () => {
    const collector = new OrpcInspectorCollector()
    const client = createClient('rpc', createServer(), {
      plugins: [
        new OrpcInspectorPlugin({ collector }),
      ],
      headers: { authorization: 'Bearer abc' },
    })
    await client.ping({ n: 1 })

    const [call] = collector.serialize()
    expect(call).toMatchObject({
      side: 'ssr',
      state: 'success',
      requestHeaders: { authorization: '***' },
    })
    expect(call!.attempts![0]!.requestHeaders).toEqual({ authorization: '***' })
    expect(JSON.stringify(collector.serialize())).not.toContain('Bearer abc')
  })

  it('writes to the given collector instead of the global store, even in the browser', async () => {
    vi.stubGlobal('window', globalThis)
    const collector = new OrpcInspectorCollector()
    const client = createClient('rpc', createServer(), {
      plugins: [
        new OrpcInspectorPlugin({ collector }),
      ],
    })
    await client.ping({ n: 1 })

    expect(collector.serialize()).toHaveLength(1)
    expect(getOrpcInspectorStore().list).toHaveLength(0)
  })

  it('serializes kept issue parameters and no translated message', async () => {
    const collector = new OrpcInspectorCollector()
    const { record } = createCallRecorder(collector)
    await record({
      path: ['profile', 'get'],
      input: undefined,
      context: {},
      next: async () => {
        throw new ValidationError({
          message: 'output',
          issues: [
            {
              path: ['name'],
              message: 'Too small: expected string to have >=3 characters',
              code: 'too_small',
              origin: 'string',
              minimum: 3,
              inclusive: true,
              input: 'ab',
            } as never,
          ],
          data: { name: 'ab' },
        })
      },
    }).catch(() => {})

    const html = renderOrpcInspectorScript(collector)
    const payload = JSON.parse(html.slice(html.indexOf('=') + 1, -'</script>'.length))
    const [issue] = payload[0].issues
    expect(issue).toEqual({
      path: ['name'],
      message: 'Too small: expected string to have >=3 characters',
      code: 'too_small',
      origin: 'string',
      minimum: 3,
      inclusive: true,
    })
    expect(issue).not.toHaveProperty('translatedMessage')
  })

  it('keeps the server issues source through serialization and hydration', async () => {
    const collector = new OrpcInspectorCollector()
    const { record } = createCallRecorder(collector)
    await record({
      path: ['profile', 'update'],
      input: { name: 'A' },
      context: {},
      next: async () => {
        throw new ORPCError('BAD_REQUEST', {
          message: 'Input validation failed',
          data: {
            issues: [
              {
                code: 'too_small',
                origin: 'string',
                minimum: 2,
                inclusive: true,
                path: ['name'],
                message: 'Too small: expected string to have >=2 characters',
              },
            ],
          },
        })
      },
    }).catch(() => {})

    const html = renderOrpcInspectorScript(collector)
    const payload = JSON.parse(html.slice(html.indexOf('=') + 1, -'</script>'.length))
    expect(payload[0]).toMatchObject({ state: 'invalid', issuesOf: 'input', issuesSource: 'server' })

    hydrateOrpcInspector(payload)
    expect(getOrpcInspectorStore().list[0]).toMatchObject({
      side: 'ssr',
      state: 'invalid',
      issuesOf: 'input',
      issuesSource: 'server',
      issues: [
        {
          path: ['name'],
          code: 'too_small',
          minimum: 2,
        },
      ],
    })
  })
})

describe('setCollectorResolver', () => {
  it('keeps records separate across concurrent requests', async () => {
    const als = new AsyncLocalStorage<CollectorType>()
    setCollectorResolver(() => als.getStore())
    // Singleton client; the resolver finds the current request's collector
    const client = createClient('rpc', createServer(), {
      plugins: [
        new OrpcInspectorPlugin(),
      ],
    })
    const a = new OrpcInspectorCollector()
    const b = new OrpcInspectorCollector()

    await Promise.all([
      als.run(a, async () => {
        await client.slow({ ms: 20, tag: 'A1' })
        await client.ping({ n: 1 })
      }),
      als.run(b, () => client.slow({ ms: 5, tag: 'B1' })),
    ])

    expect(a.serialize().map(call => call.input)).toEqual([
      { ms: 20, tag: 'A1' },
      { n: 1 },
    ])
    expect(b.serialize().map(call => call.input)).toEqual([
      { ms: 5, tag: 'B1' },
    ])
  })

  it('records nothing and does not throw when the resolver finds no collector', async () => {
    setCollectorResolver(() => undefined)
    const client = createClient('rpc', createServer(), {
      plugins: [
        new OrpcInspectorPlugin(),
      ],
    })
    await expect(client.ping({ n: 1 })).resolves.toEqual({ n: 1 })
  })
})

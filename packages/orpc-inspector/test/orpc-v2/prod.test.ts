import type { ClientContext } from '@orpc/client-v2'
import type { StandardLinkOptions } from '@orpc/client-v2/standard'
import { describe, expect, it } from 'vitest'
import { createOrpcInspectorInterceptors, OrpcInspectorCollector, OrpcInspectorPlugin, renderOrpcInspectorScript } from '../../src/v2.prod'
import { createClient, createServer } from './fixtures'

describe('v2 production no-op', () => {
  it('plugin init returns the options it got', () => {
    const interceptor = async ({ next }: { next: () => Promise<unknown> }) => next()
    const options: StandardLinkOptions<ClientContext> = {
      interceptors: [interceptor],
    }
    expect(new OrpcInspectorPlugin().init(options)).toBe(options)
    expect(options).toEqual({
      interceptors: [interceptor],
    })
  })

  it('a link with the no-op plugin works', async () => {
    const client = createClient('rpc', createServer(), {
      plugins: [
        new OrpcInspectorPlugin(),
      ],
    })
    await expect(client.ping({ n: 1 })).resolves.toEqual({ n: 1 })
  })

  it('interceptors call next as-is', async () => {
    const { interceptor, transportInterceptor } = createOrpcInspectorInterceptors()
    const output = { ok: true }
    const response = { status: 200, headers: {} }
    await expect((interceptor as (o: unknown) => Promise<unknown>)({
      next: async () => output,
    })).resolves.toBe(output)
    await expect((transportInterceptor as (o: unknown) => Promise<unknown>)({
      next: async () => response,
    })).resolves.toBe(response)
  })

  it('collector records nothing and the script is empty', () => {
    const collector = new OrpcInspectorCollector()
    collector.commit({
      id: 'a',
      procedure: 'p',
      side: 'ssr',
      state: 'success',
      startedAt: 0,
    }, true)
    expect(collector.serialize()).toEqual([])
    expect(renderOrpcInspectorScript(collector)).toBe('')
  })
})

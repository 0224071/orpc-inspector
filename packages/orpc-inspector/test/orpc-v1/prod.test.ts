import type { StandardLinkOptions } from '@orpc/client/standard'
import { describe, expect, it } from 'vitest'
import { createOrpcInspectorInterceptors, hydrateOrpcInspector, OrpcInspectorCollector, OrpcInspectorPlugin, renderOrpcInspectorScript } from '../../src/index.prod'

describe('production no-op', () => {
  it('plugin init does not modify options', () => {
    const interceptor = async ({ next }: { next: () => Promise<unknown> }) => next()
    const options: StandardLinkOptions<Record<never, never>> = {
      interceptors: [interceptor],
    }
    new OrpcInspectorPlugin().init(options)
    expect(options).toEqual({
      interceptors: [interceptor],
    })
  })

  it('interceptors call next as-is', async () => {
    const { interceptor, clientInterceptor } = createOrpcInspectorInterceptors()
    const output = { ok: true }
    const response = {
      status: 200,
      headers: {},
      body: () => Promise.resolve(undefined),
    }
    await expect((interceptor as (o: unknown) => Promise<unknown>)({
      next: async () => output,
    })).resolves.toBe(output)
    await expect((clientInterceptor as (o: unknown) => Promise<unknown>)({
      next: async () => response,
    })).resolves.toBe(response)
  })

  it('collector records nothing, script is an empty string, hydrate is a no-op', () => {
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
    expect(() => hydrateOrpcInspector([])).not.toThrow()
  })
})

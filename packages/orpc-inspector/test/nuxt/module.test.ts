import type { ClientContext } from '@orpc/client'
import type { StandardLinkPlugin as StandardLinkPluginV2 } from '@orpc/client-v2/standard'
import type { StandardLinkPlugin } from '@orpc/client/standard'
import type { OrpcInspectorModuleOptions } from '../../src/nuxt/module'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createORPCClient } from '@orpc/client'
import { createORPCClient as createORPCClientV2 } from '@orpc/client-v2'
import { RPCLink as RPCLinkV2 } from '@orpc/client-v2/fetch'
import { RPCLink } from '@orpc/client/fetch'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The kit helpers only record what the module asks for; defineNuxtModule returns the definition so setup can be called directly
const kit = vi.hoisted(() => ({
  addImports: vi.fn(),
  addPlugin: vi.fn(),
  addTemplate: vi.fn((template: { filename: string }) => ({ dst: `/build/${template.filename}` })),
  addVitePlugin: vi.fn(),
  extendViteConfig: vi.fn(),
  tryResolveModule: vi.fn<(id: string, from: URL) => Promise<string | undefined>>(),
  warn: vi.fn(),
}))

vi.mock('@nuxt/kit', () => ({
  addImports: kit.addImports,
  addPlugin: kit.addPlugin,
  addTemplate: kit.addTemplate,
  addVitePlugin: kit.addVitePlugin,
  extendViteConfig: kit.extendViteConfig,
  tryResolveModule: kit.tryResolveModule,
  useLogger: () => ({
    warn: kit.warn,
    info: vi.fn(),
  }),
  createResolver: () => ({
    resolve: (path: string) => `/pkg/${path.replace(/^\.\//, '')}`,
  }),
  defineNuxtModule: (definition: unknown) => definition,
}))

const { default: module } = await import('../../src/nuxt/module')
const { setup } = module as unknown as { setup: (options: OrpcInspectorModuleOptions, nuxt: unknown) => Promise<void> }

const devtoolsEntry = fileURLToPath(import.meta.resolve('@vitejs/devtools'))

type Hook = (...args: any[]) => unknown

function createNuxt({ dev = false, baseURL = '/', rootDir = '/project' } = {}) {
  const hooks = new Map<string, Hook[]>()
  return {
    options: {
      dev,
      rootDir,
      buildDir: `${rootDir}/.nuxt`,
      app: { baseURL, buildAssetsDir: '/_nuxt/' },
      build: { transpile: [] as string[] },
    },
    hook(name: string, fn: Hook) {
      hooks.set(name, [
        ...hooks.get(name) ?? [],
        fn,
      ])
    },
    async callHook(name: string, ...args: unknown[]) {
      for (const fn of hooks.get(name) ?? [])
        await fn(...args)
    },
  }
}

const pluginNames = (plugins: unknown) => (plugins as { name: string }[]).flat().map(plugin => plugin.name)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('nuxt build', () => {
  it('keeps the no-op template by default', async () => {
    await setup({}, createNuxt())

    expect(kit.tryResolveModule).not.toHaveBeenCalled()
    expect(kit.addImports).toHaveBeenCalledWith({ name: 'useOrpcInspectorPlugin', from: '/build/orpc-link-noop' })
    expect(kit.addPlugin).not.toHaveBeenCalled()
    expect(kit.addVitePlugin).not.toHaveBeenCalled()
  })

  it('warns once and keeps the no-op when @vitejs/devtools does not resolve', async () => {
    kit.tryResolveModule.mockResolvedValue(undefined)
    await setup({ production: true }, createNuxt())

    expect(kit.tryResolveModule.mock.calls[0]![0]).toBe('@vitejs/devtools')
    expect(fileURLToPath(kit.tryResolveModule.mock.calls[0]![1])).toMatch(/project[\\/]$/)
    expect(kit.warn).toHaveBeenCalledOnce()
    expect(kit.warn.mock.calls[0]![0]).toContain('needs @vitejs/devtools')
    expect(kit.addImports).toHaveBeenCalledWith({ name: 'useOrpcInspectorPlugin', from: '/build/orpc-link-noop' })
    expect(kit.addPlugin).not.toHaveBeenCalled()
  })

  describe('with production and @vitejs/devtools', () => {
    beforeEach(() => {
      kit.tryResolveModule.mockResolvedValue(devtoolsEntry)
    })

    it('registers the dev runtime, the dock loader and the Vite plugin for both builds', async () => {
      const nuxt = createNuxt()
      await setup({ production: true, zodLocale: 'zh-TW' }, nuxt)

      expect(kit.warn).not.toHaveBeenCalled()
      expect(kit.addImports).toHaveBeenCalledWith({ name: 'useOrpcInspectorPlugin', from: '/pkg/runtime/composables' })
      expect(kit.addPlugin.mock.calls.map(([plugin]) => plugin)).toEqual([
        { src: '/pkg/runtime/plugin.server', mode: 'server' },
        { src: '/pkg/runtime/plugin.client', mode: 'client' },
        { src: '/pkg/runtime/plugin.devtools.client', mode: 'client' },
      ])
      expect(nuxt.options.build.transpile).toEqual(['/pkg/runtime'])

      // Inspector plugin: no environment option, so it runs in the client and server builds
      const [inspector, inspectorOptions] = kit.addVitePlugin.mock.calls[0]!
      expect(inspector.name).toBe('orpc-inspector')
      expect(inspectorOptions).toBeUndefined()
      expect(inspector.apply({}, { command: 'build', mode: 'production' })).toBe(true)
    })

    it('adds Vite DevTools with withApp to the client build only', async () => {
      const nuxt = createNuxt()
      await setup({ production: true }, nuxt)

      const [getter, options] = kit.addVitePlugin.mock.calls[1]!
      expect(options).toEqual({ server: false })
      await nuxt.callHook('vite:extend', {
        config: { plugins: [] },
      })
      const names = pluginNames(await getter())
      expect(names).toContain('vite:devtools:build')
      expect(names).not.toContain('vite:devtools:builtin')
    })

    it('does not add a second Vite DevTools build when one is already there', async () => {
      const nuxt = createNuxt()
      await setup({ production: true }, nuxt)

      const [getter] = kit.addVitePlugin.mock.calls[1]!
      await nuxt.callHook('vite:extend', {
        config: {
          plugins: [
            [
              Promise.resolve({ name: 'vite:devtools:build' }),
            ],
          ],
        },
      })
      expect(await getter()).toEqual([])
    })

    it('serves the hub and the panel through Nitro', async () => {
      const nuxt = createNuxt()
      await setup({ production: true }, nuxt)

      const config: { publicAssets?: { dir: string, baseURL: string }[] } = {}
      await nuxt.callHook('nitro:config', config)
      const assets = config.publicAssets!.map(({ dir, baseURL }) => ({
        dir: dir.replaceAll('\\', '/'),
        baseURL,
      }))
      expect(assets).toContainEqual({ dir: '/project/.nuxt/dist/client/__devtools', baseURL: '/_nuxt/__devtools' })
      expect(assets).toContainEqual({ dir: '/project/.nuxt/dist/client/__devtools-assets', baseURL: '/__devtools-assets' })
      expect(assets).toContainEqual({
        dir: expect.stringMatching(/\/dist\/panel$/),
        baseURL: '/__orpc-inspector',
      })
    })
  })

  it('ignores production in dev', async () => {
    await setup({ production: true }, createNuxt({ dev: true }))

    expect(kit.tryResolveModule).not.toHaveBeenCalled()
    expect(kit.addVitePlugin).toHaveBeenCalledOnce()
    expect(kit.addVitePlugin.mock.calls[0]![1]).toEqual({ server: false })
  })

  it('leaves the dev SSR resolution to Nuxt', async () => {
    await setup({}, createNuxt({ dev: true }))

    const [inspector] = kit.addVitePlugin.mock.calls[0]! as [{ config: (config: object, env: object) => { ssr?: unknown } }]
    expect(inspector.config({}, { command: 'serve', mode: 'development' }).ssr).toBeUndefined()
  })
})

describe('oRPC major', () => {
  /** A project root whose node_modules holds only @orpc/client at this version */
  function projectWithOrpc(version: string) {
    const root = mkdtempSync(join(tmpdir(), 'orpc-inspector-nuxt-'))
    mkdirSync(join(root, 'node_modules', '@orpc', 'client'), { recursive: true })
    writeFileSync(join(root, 'node_modules', '@orpc', 'client', 'package.json'), JSON.stringify({ version }))
    return root
  }

  const templates = () => Object.fromEntries(kit.addTemplate.mock.calls.map(([template]) => [
    template.filename,
    (template as unknown as { getContents: () => string }).getContents(),
  ]))

  it.each([
    ['2.0.0-beta.51', '/pkg/runtime/composables.v2'],
    ['1.16.4', '/pkg/runtime/composables'],
  ])('dev: @orpc/client %s gets %s', async (version, from) => {
    await setup({}, createNuxt({
      dev: true,
      rootDir: projectWithOrpc(version),
    }))
    expect(kit.addImports).toHaveBeenCalledWith({ name: 'useOrpcInspectorPlugin', from })
  })

  it('dev: falls back to the v1 composable when @orpc/client is not found', async () => {
    await setup({}, createNuxt({
      dev: true,
      rootDir: mkdtempSync(join(tmpdir(), 'orpc-inspector-nuxt-')),
    }))
    expect(kit.addImports).toHaveBeenCalledWith({ name: 'useOrpcInspectorPlugin', from: '/pkg/runtime/composables' })
  })

  it('nuxt build: the no-op types follow the major', async () => {
    await setup({}, createNuxt({
      rootDir: projectWithOrpc('2.0.0-beta.51'),
    }))
    expect(templates()['orpc-link-noop.d.ts']).toContain('/pkg/runtime/noop.v2')
  })

  it('nuxt build: the no-op plugin works on oRPC v1 and v2 links', async () => {
    await setup({}, createNuxt())
    const source = templates()['orpc-link-noop.mjs']!
    const { useOrpcInspectorPlugin } = await import(/* @vite-ignore */ `data:text/javascript,${encodeURIComponent(source)}`) as {
      useOrpcInspectorPlugin: () => StandardLinkPlugin<ClientContext> & StandardLinkPluginV2<ClientContext>
    }
    const reply = async () => new Response(JSON.stringify({
      json: { ok: true },
    }), {
      headers: { 'content-type': 'application/json' },
    })

    const v2 = createORPCClientV2<{ ping: () => Promise<unknown> }>(new RPCLinkV2({
      url: '/rpc',
      origin: 'http://local',
      fetch: reply,
      plugins: [
        useOrpcInspectorPlugin(),
      ],
    }))
    await expect(v2.ping()).resolves.toEqual({ ok: true })
    const v1 = createORPCClient<{ ping: () => Promise<unknown> }>(new RPCLink({
      url: 'http://local/rpc',
      fetch: reply,
      plugins: [
        useOrpcInspectorPlugin(),
      ],
    }))
    await expect(v1.ping()).resolves.toEqual({ ok: true })
  })
})

import type { ViteDevServer } from 'vite'
import type { OrpcInspectorVitePlugin } from '../../src/vite/plugin'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { createLogger, createServer, resolveConfig } from 'vite'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { orpcInspector } from '../../src/vite'
import { CLIENT_MODULE_ID, createOrpcInspectorPlugin, TRANSLATOR_MODULE_ID } from '../../src/vite/plugin'

const root = fileURLToPath(new URL('./fixture', import.meta.url))
const panelDir = fileURLToPath(new URL('./fixture/panel', import.meta.url))

describe('build mode', () => {
  it('does not apply the plugin on vite build', async () => {
    const config = await resolveConfig({
      root,
      logLevel: 'silent',
      plugins: [
        orpcInspector(),
      ],
    }, 'build')
    expect(config.plugins.map(p => p.name)).not.toContain('orpc-inspector')
  })

  it.each([
    ['client', {}],
    [
      'SSR',
      {
        build: { ssr: true },
      },
    ],
  ])('applies the plugin on the %s vite build with production: true', async (_case, extra) => {
    const config = await resolveConfig({
      root,
      logLevel: 'silent',
      ...extra,
      plugins: [
        orpcInspector({ production: true }),
      ],
    }, 'build')
    expect(config.plugins.map(p => p.name)).toContain('orpc-inspector')
  })

  it('applies the plugin on vite serve and pre-bundles the devframe in-page channel', async () => {
    const config = await resolveConfig({
      root,
      logLevel: 'silent',
      plugins: [
        orpcInspector(),
      ],
    }, 'serve')
    expect(config.plugins.map(p => p.name)).toContain('orpc-inspector')
    expect(config.optimizeDeps.include).toContain('orpc-inspector > devframe/in-page-channel')
  })
})

function captureLogger() {
  const logger = createLogger('silent')
  const warn = vi.fn()
  const info = vi.fn()
  logger.warn = warn
  logger.info = info
  const lines = (fn: typeof warn) => fn.mock.calls.map(call => String(call[0])).filter(line => line.startsWith('[orpc-inspector]'))
  return {
    logger,
    warns: () => lines(warn),
    infos: () => lines(info),
  }
}

describe('missing Vite DevTools', () => {
  it('warns once on serve without DevTools and still applies the plugin', async () => {
    const { logger, warns, infos } = captureLogger()
    const plugin = createOrpcInspectorPlugin({ panelDir })
    const resolve = () => resolveConfig({
      root,
      configFile: false,
      customLogger: logger,
      plugins: [plugin],
    }, 'serve')
    const config = await resolve()
    expect(config.plugins.map(p => p.name)).toContain('orpc-inspector')
    await resolve()
    expect(warns()).toHaveLength(1)
    expect(warns()[0]).toContain('Vite DevTools is not enabled')
    expect(warns()[0]).toContain('`devtools: true`')
    expect(infos()).toEqual([])
  })

  it('does not warn when Vite DevTools adds its server plugin', async () => {
    const { logger, warns } = captureLogger()
    const config = await resolveConfig({
      root,
      configFile: false,
      customLogger: logger,
      devtools: true,
      plugins: [
        createOrpcInspectorPlugin({ panelDir }),
      ],
    }, 'serve')
    expect(config.plugins.map(p => p.name)).toContain('vite:devtools:server')
    expect(warns()).toEqual([])
  })

  it('says DevTools failed to load when the option is on but the server plugin is absent', () => {
    const warn = vi.fn()
    const plugin = createOrpcInspectorPlugin({ panelDir })
    ;(plugin.config as (c: object, env: object) => void).call({}, { devtools: true }, { command: 'serve', mode: 'development' })
    ;(plugin.configResolved as (c: object) => void).call({}, {
      base: '/',
      plugins: [],
      logger: { warn },
    })
    expect(warn).toHaveBeenCalledOnce()
    expect(warn.mock.calls[0]![0]).toContain('Vite DevTools failed to load')
  })

  it('skips the warning when Nuxt already warned', async () => {
    const { logger, warns } = captureLogger()
    await resolveConfig({
      root,
      configFile: false,
      customLogger: logger,
      plugins: [
        createOrpcInspectorPlugin({ panelDir, skipDevToolsWarning: true }),
      ],
    }, 'serve')
    expect(warns()).toEqual([])
  })

  it('logs neither the warning nor the startup line on vite build', async () => {
    const { logger, warns, infos } = captureLogger()
    await resolveConfig({
      root,
      configFile: false,
      customLogger: logger,
      plugins: [
        orpcInspector(),
      ],
    }, 'build')
    expect(warns()).toEqual([])
    expect(infos()).toEqual([])
  })
})

describe('startup line', () => {
  async function start(options: Parameters<typeof createOrpcInspectorPlugin>[0]) {
    const { logger, infos } = captureLogger()
    const server = await createServer({
      root,
      base: '/app/',
      configFile: false,
      customLogger: logger,
      optimizeDeps: { noDiscovery: true },
      server: { port: 0, ws: false },
      plugins: [
        createOrpcInspectorPlugin({ panelDir, skipDevToolsWarning: true, ...options }),
      ],
    })
    await server.listen()
    return { server, infos }
  }

  it('logs one dock line with the absolute panel URL once the server listens', async () => {
    const { server, infos } = await start({})
    try {
      await vi.waitFor(() => expect(infos()).toHaveLength(1))
      const address = server.httpServer!.address()
      const port = typeof address === 'object' && address
        ? address.port
        : 0
      expect(infos()[0]).toBe(`[orpc-inspector] Open the oRPC panel from the DevTools dock. Panel URL: http://localhost:${port}/app/__orpc-inspector/`)
      server.printUrls()
      server.printUrls()
      expect(infos()).toHaveLength(1)
    }
    finally {
      await server.close()
    }
  })

  it('logs after printUrls when the CLI calls it', async () => {
    const { server, infos } = await start({})
    try {
      server.printUrls()
      expect(infos()).toHaveLength(1)
      expect(infos()[0]).toContain('/app/__orpc-inspector/')
      await new Promise(resolve => setTimeout(resolve, 20))
      expect(infos()).toHaveLength(1)
    }
    finally {
      await server.close()
    }
  })

  it('skips the line when Nuxt prints its own', async () => {
    const { server, infos } = await start({ skipStartupLine: true })
    try {
      server.printUrls()
      await new Promise(resolve => setTimeout(resolve, 20))
      expect(infos()).toEqual([])
    }
    finally {
      await server.close()
    }
  })
})

describe('dev server (base = /app/)', () => {
  let server: ViteDevServer
  let origin: string
  let plugin: OrpcInspectorVitePlugin

  beforeAll(async () => {
    plugin = createOrpcInspectorPlugin({ panelDir })
    server = await createServer({
      root,
      base: '/app/',
      logLevel: 'silent',
      configFile: false,
      optimizeDeps: { noDiscovery: true },
      server: { port: 0, ws: false },
      plugins: [plugin],
    })
    await server.listen()
    const address = server.httpServer!.address()
    origin = `http://localhost:${typeof address === 'object' && address
      ? address.port
      : 0}`
  })

  afterAll(async () => {
    await server?.close()
  })

  it('injects the page script path into index.html with base', async () => {
    const html = await server.transformIndexHtml('/', '<html><head></head><body></body></html>')
    expect(html).toContain(`<script type="module" src="/app/@id/${CLIENT_MODULE_ID}"></script>`)
  })

  it('virtual module loads orpc-inspector/client', async () => {
    const resolved = await server.pluginContainer.resolveId(CLIENT_MODULE_ID)
    const loaded = await server.pluginContainer.load(resolved!.id)
    expect(loaded).toBe(`import 'orpc-inspector/client'`)
  })

  it('serves the prebuilt panel at /app/__orpc-inspector/', async () => {
    const page = await fetch(`${origin}/app/__orpc-inspector/`)
    expect(page.status).toBe(200)
    expect(page.headers.get('content-type')).toContain('text/html')
    expect(await page.text()).toContain('./assets/panel.js')

    const asset = await fetch(`${origin}/app/__orpc-inspector/assets/panel.js`)
    expect(asset.status).toBe(200)
    expect(asset.headers.get('content-type')).toContain('text/javascript')
  })

  it('redirects when the trailing slash is missing', async () => {
    const res = await fetch(`${origin}/app/__orpc-inspector`, { redirect: 'manual' })
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('/app/__orpc-inspector/')
  })

  it('does not serve files outside the panel directory', async () => {
    const res = await fetch(`${origin}/app/__orpc-inspector/..%2Fsecret.txt`)
    expect(await res.text()).not.toBe('secret\n')
  })

  it('registers the dock pointing to the panel page with base, only once', () => {
    const register = vi.fn()
    const views = new Set<string>()
    const ctx = {
      docks: {
        views: {
          has: (id: string) => views.has(id),
        },
        register: (entry: { id: string }) => {
          register(entry)
          views.add(entry.id)
        },
      },
    }
    plugin.devtools.setup(ctx)
    plugin.devtools.setup(ctx)

    expect(register).toHaveBeenCalledOnce()
    expect(register).toHaveBeenCalledWith(expect.objectContaining({
      id: 'orpc-inspector',
      title: 'oRPC',
      type: 'iframe',
      url: '/app/__orpc-inspector/',
    }))
  })
})

describe('panelBase (Nuxt: Vite base is /_nuxt/)', () => {
  let server: ViteDevServer
  let origin: string

  beforeAll(async () => {
    server = await createServer({
      root,
      base: '/_nuxt/',
      logLevel: 'silent',
      configFile: false,
      optimizeDeps: { noDiscovery: true },
      server: { port: 0, ws: false },
      plugins: [
        createOrpcInspectorPlugin({ panelDir, panelBase: '/' }),
      ],
    })
    await server.listen()
    const address = server.httpServer!.address()
    origin = `http://localhost:${typeof address === 'object' && address
      ? address.port
      : 0}`
  })

  afterAll(async () => {
    await server?.close()
  })

  it('mounts the panel page at panelBase while the page script still uses Vite base', async () => {
    const page = await fetch(`${origin}/__orpc-inspector/`)
    expect(page.status).toBe(200)
    expect(await page.text()).toContain('./assets/panel.js')

    const html = await server.transformIndexHtml('/', '<html><head></head><body></body></html>')
    expect(html).toContain(`src="/_nuxt/@id/${CLIENT_MODULE_ID}"`)
  })
})

describe('zodLocale', () => {
  const playgroundRoot = fileURLToPath(new URL('../../../../playgrounds/vite-vue', import.meta.url))

  async function setup(zodLocale: string | undefined, projectRoot: string) {
    const warn = vi.fn()
    const logger = createLogger('silent')
    logger.warn = warn
    const plugin = createOrpcInspectorPlugin({ panelDir, zodLocale, skipDevToolsWarning: true })
    const config = await resolveConfig({
      root: projectRoot,
      configFile: false,
      customLogger: logger,
      plugins: [plugin],
    }, 'serve')
    const hook = <T>(name: 'resolveId' | 'load') => (id: string) => {
      const h = plugin[name] as ((id: string) => T) | { handler: (id: string) => T }
      return (typeof h === 'function'
        ? h
        : h.handler).call({}, id)
    }
    return {
      config,
      warn,
      resolveId: hook<string | undefined>('resolveId'),
      load: hook<string | undefined>('load'),
    }
  }

  it('loads no zod module when unset', async () => {
    const { config, warn, resolveId, load } = await setup(undefined, playgroundRoot)
    expect(load(resolveId(CLIENT_MODULE_ID)!)).toBe(`import 'orpc-inspector/client'`)
    expect(resolveId(TRANSLATOR_MODULE_ID)).toBeUndefined()
    expect(config.optimizeDeps.include).not.toContain('zod/v4/core')
    expect(warn).not.toHaveBeenCalled()
  })

  it('serves the issue translator when the locale resolves', async () => {
    const { config, warn, resolveId, load } = await setup('zh-TW', playgroundRoot)
    expect(load(resolveId(CLIENT_MODULE_ID)!)).toBe(`import '${TRANSLATOR_MODULE_ID}'\nimport 'orpc-inspector/client'`)
    const translator = load(resolveId(TRANSLATOR_MODULE_ID)!)
    expect(translator).toContain(`import locale from 'zod/v4/locales/zh-TW.js'`)
    expect(translator).toContain(`import english from 'zod/v4/locales/en.js'`)
    expect(translator).toContain(`import { globalConfig } from 'zod/v4/core'`)
    expect(translator).toContain(`Symbol.for('orpc-inspector:issue-translator')`)
    expect(translator).not.toContain('config(')
    expect(config.optimizeDeps.include).toEqual(expect.arrayContaining(['zod/v4/locales/zh-TW.js', 'zod/v4/core', 'zod/v4/locales/en.js']))
    expect(warn).not.toHaveBeenCalled()
  })

  it.each([
    ['an invalid name', '../zh-TW', playgroundRoot],
    ['an unknown locale', 'xx-YY', playgroundRoot],
    // The package itself has zod (for build tests), so use a directory outside the repo
    [
      'a project without zod',
      'zh-TW',
      tmpdir(),
    ],
  ])('warns once and stays untranslated for %s', async (_case, zodLocale, projectRoot) => {
    const { config, warn, resolveId, load } = await setup(zodLocale, projectRoot)
    expect(warn).toHaveBeenCalledOnce()
    expect(warn.mock.calls[0]![0]).toContain(`zodLocale "${zodLocale}"`)
    expect(load(resolveId(CLIENT_MODULE_ID)!)).toBe(`import 'orpc-inspector/client'`)
    expect(resolveId(TRANSLATOR_MODULE_ID)).toBeUndefined()
    expect(config.optimizeDeps.include).not.toContain('zod/v4/core')
  })
})

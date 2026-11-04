import type { Plugin } from 'vite'
import { fileURLToPath } from 'node:url'
import { DevTools } from '@vitejs/devtools'
import { createLogger, createServer } from 'vite'
import { describe, expect, it, vi } from 'vitest'
import { createOrpcInspectorPlugin } from '../../src/vite/plugin'

const root = fileURLToPath(new URL('./fixture', import.meta.url))
const panelDir = fileURLToPath(new URL('./fixture/panel', import.meta.url))

describe('devframe adapter with a real host', () => {
  it.each([
    ['/', undefined, '/__orpc-inspector/'],
    ['/app/', undefined, '/app/__orpc-inspector/'],
    ['/_nuxt/', '/app/', '/app/__orpc-inspector/'],
  ])('hosts assets and installs one dock (base %s, panelBase %s)', async (base, panelBase, route) => {
    const logger = createLogger('silent')
    const warn = vi.spyOn(logger, 'warn')
    const infos = vi.spyOn(logger, 'info')
    let context: Parameters<NonNullable<Plugin['devtools']>['setup']>[0] | undefined
    const server = await createServer({
      root,
      base,
      configFile: false,
      customLogger: logger,
      optimizeDeps: { noDiscovery: true },
      server: { port: 0 },
      plugins: [
        DevTools({ builtinDevTools: false }),
        createOrpcInspectorPlugin({ panelDir, panelBase }),
        createOrpcInspectorPlugin({ panelDir, panelBase }),
        {
          name: 'capture-host',
          devtools: {
            setup(ctx) { context = ctx },
          },
        },
      ],
    })
    try {
      await server.listen()
      const address = server.httpServer!.address()
      if (typeof address !== 'object' || !address)
        throw new Error('Missing HTTP listener')
      const origin = `http://localhost:${address.port}`
      const page = await fetch(`${origin}${route}`)
      expect(page.status).toBe(200)
      expect(await page.text()).toContain('./assets/panel.js')
      const asset = await fetch(`${origin}${route}assets/panel.js`)
      expect(asset.status).toBe(200)
      expect(asset.headers.get('content-type')).toContain('javascript')
      expect(await asset.text()).toContain('panel')
      const bare = await fetch(`${origin}${route.slice(0, -1)}?test=1`, { redirect: 'manual' })
      expect(bare.status).toBe(302)
      expect(bare.headers.get('location')).toBe(route)
      const traversal = await fetch(`${origin}${route}..%2Fsecret.txt`)
      expect(await traversal.text()).not.toBe('secret\n')

      expect(context!.docks.values().filter(dock => dock.id === 'orpc-inspector')).toEqual([
        expect.objectContaining({
          id: 'orpc-inspector',
          title: 'oRPC',
          type: 'iframe',
          url: route,
          category: 'app',
          defaultOrder: 100,
          icon: expect.stringContaining('data:image/svg+xml,'),
        }),
      ])
      // A duplicate definition must skip mounting assets as well as registering the dock.
      expect(context!.frames.filter(frame => frame.id === 'orpc-inspector')).toHaveLength(1)
      expect(warn).not.toHaveBeenCalled()
      server.printUrls()
      expect(infos.mock.calls.some(([message]) => message.includes(`${origin}${route}`))).toBe(true)
    }
    finally {
      await server.close()
    }
  })
})

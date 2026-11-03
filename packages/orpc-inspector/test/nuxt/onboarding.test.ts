import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { appendOrpcClientDeps, checkNuxtDevTools, isNuxtDevToolsEnabled, nuxtPanelUrl, readNuxtDevToolsVersion } from '../../src/nuxt/onboarding'

const nuxtPlayground = fileURLToPath(new URL('../../../../playgrounds/nuxt', import.meta.url))

describe('nuxt DevTools check', () => {
  it('warns about v3 and tells the Vite plugin it already warned', () => {
    const result = checkNuxtDevTools(true, '3.4.4')
    expect(result.warned).toBe(true)
    expect(result.warning).toContain('Nuxt DevTools 3.4.4 has no Vite DevTools dock')
    expect(result.warning).toContain('@nuxt/devtools@4')
  })

  it('adds no Nuxt warning for v4', () => {
    expect(checkNuxtDevTools(true, '4.0.0')).toEqual({ warned: false })
  })

  it('leaves an unknown version to the Vite plugin', () => {
    expect(checkNuxtDevTools(true, undefined)).toEqual({ warned: false })
  })

  it('warns when Nuxt DevTools is disabled', () => {
    const result = checkNuxtDevTools(false, '4.0.0')
    expect(result.warned).toBe(true)
    expect(result.warning).toContain('Nuxt DevTools is disabled')
  })

  it('reads the devtools option like Nuxt does', () => {
    expect(isNuxtDevToolsEnabled(undefined)).toBe(true)
    expect(isNuxtDevToolsEnabled({})).toBe(true)
    expect(isNuxtDevToolsEnabled(true)).toBe(true)
    expect(isNuxtDevToolsEnabled(false)).toBe(false)
    expect(isNuxtDevToolsEnabled({ enabled: false })).toBe(false)
  })

  it('reads the project copy of @nuxt/devtools', () => {
    expect(readNuxtDevToolsVersion(nuxtPlayground)).toMatch(/^4\./)
  })
})

describe('nuxt startup URL', () => {
  it('uses the listener origin and app.baseURL', () => {
    expect(nuxtPanelUrl('http://localhost:3103/', '/')).toBe('http://localhost:3103/__orpc-inspector/')
    expect(nuxtPanelUrl('http://localhost:3103/', '/app/')).toBe('http://localhost:3103/app/__orpc-inspector/')
    expect(nuxtPanelUrl('https://127.0.0.1:3000', '/app')).toBe('https://127.0.0.1:3000/app/__orpc-inspector/')
  })
})

describe('optimizeDeps append', () => {
  it('appends the inspector ids beside an existing include entry', () => {
    const config = {
      optimizeDeps: {
        include: ['msw/browser'],
      },
    }
    expect(appendOrpcClientDeps(config)).toBeUndefined()
    expect(config.optimizeDeps.include).toEqual([
      'msw/browser',
      '@orpc/client',
      '@orpc/client/fetch',
      '@orpc/contract',
    ])
  })

  it('creates the list when there is none', () => {
    const config: { optimizeDeps?: { include?: unknown } } = {}
    appendOrpcClientDeps(config)
    expect(config.optimizeDeps?.include).toEqual(['@orpc/client', '@orpc/client/fetch', '@orpc/contract'])
  })

  it('does not duplicate an id already listed', () => {
    const config = {
      optimizeDeps: {
        include: ['@orpc/client'],
      },
    }
    appendOrpcClientDeps(config)
    expect(config.optimizeDeps.include).toEqual(['@orpc/client', '@orpc/client/fetch', '@orpc/contract'])
  })

  it('skips an id the project excluded and keeps the exclude entry', () => {
    const config = {
      optimizeDeps: {
        include: [] as string[],
        exclude: ['@orpc/client/fetch'],
      },
    }
    appendOrpcClientDeps(config)
    expect(config.optimizeDeps.include).toEqual(['@orpc/client', '@orpc/contract'])
    expect(config.optimizeDeps.exclude).toEqual(['@orpc/client/fetch'])
  })

  it('leaves a non-array include unchanged and returns a warning', () => {
    const include = 'msw/browser'
    const config = {
      optimizeDeps: { include },
    }
    expect(appendOrpcClientDeps(config)).toContain('not an array')
    expect(config.optimizeDeps.include).toBe(include)
  })
})

describe('nuxt module wiring', () => {
  const source = readFileSync(fileURLToPath(new URL('../../src/nuxt/module.ts', import.meta.url)), 'utf8')

  it('runs the onboarding hooks only after the production early return', () => {
    const earlyReturn = source.indexOf('if (!nuxt.options.dev)')
    expect(earlyReturn).toBeGreaterThan(-1)
    const returned = source.indexOf('return\n', earlyReturn)
    for (const call of ['checkNuxtDevTools(', 'extendViteConfig(', `nuxt.hook('listen'`])
      expect(source.indexOf(call)).toBeGreaterThan(returned)
  })

  it('passes the Nuxt flags to the Vite plugin', () => {
    expect(source).toContain('skipDevToolsWarning: devtools.warned')
    expect(source).toContain('skipStartupLine: true')
  })
})

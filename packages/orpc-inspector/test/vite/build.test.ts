import type { InlineConfig, PluginOption } from 'vite'
import type { OrpcCall } from '../../src/core/types'
import type { InternalPluginOptions } from '../../src/vite/plugin'
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { DevTools } from '@vitejs/devtools'
import { build, createLogger } from 'vite'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { createOrpcInspectorPlugin } from '../../src/vite/plugin'

// Real `vite build` runs of a small app; output goes to build-fixture/dist (gitignored) so the SSR bundle resolves its deps
const root = fileURLToPath(new URL('./build-fixture', import.meta.url))
const outRoot = join(root, 'dist')
const TIMEOUT = 120_000
/** The client-only line virtual:orpc-inspector/recorder adds before re-exporting the recorder */
const SETS_MASK_FLAG = /\[Symbol\.for\(["']orpc-inspector:record-mask["']\)\]\s*=\s*true/

interface BuildCase {
  out: string
  inspector?: InternalPluginOptions | false
  devtools?: { withApp?: boolean, injection?: boolean } | false
  config?: InlineConfig
}

async function buildFixture({ out, inspector = { production: true }, devtools = { withApp: true, injection: true }, config }: BuildCase) {
  const logger = createLogger('silent')
  const warn = vi.spyOn(logger, 'warn')
  const plugins: PluginOption[] = []
  if (devtools)
    plugins.push(DevTools({ build: devtools }))
  if (inspector)
    plugins.push(createOrpcInspectorPlugin(inspector))
  const outDir = join(outRoot, out)
  // buildStaticDevTools logs to the console directly
  const log = vi.spyOn(console, 'log').mockImplementation(() => {})
  // Vitest sets NODE_ENV=test, which makes Vite resolve the `development` export condition; a real build runs as production
  vi.stubEnv('NODE_ENV', 'production')
  try {
    await build({
      root,
      configFile: false,
      customLogger: logger,
      plugins,
      ...config,
      build: {
        outDir,
        emptyOutDir: true,
        minify: false,
        ...config?.build,
      },
    })
  }
  finally {
    log.mockRestore()
    vi.unstubAllEnvs()
  }
  const warnings = warn.mock.calls.map(([message]) => message).filter(message => message.includes('[orpc-inspector]'))
  return { outDir, warnings }
}

/** Every file under dir with its content, keyed by relative path */
function readTree(dir: string) {
  const files: Record<string, string> = {}
  for (const entry of readdirSync(dir, { recursive: true, withFileTypes: true })) {
    if (entry.isFile()) {
      const file = join(entry.parentPath, entry.name)
      files[file.slice(dir.length + 1).replaceAll('\\', '/')] = readFileSync(file, 'utf8')
    }
  }
  return files
}

function appJs(outDir: string) {
  return Object.entries(readTree(outDir))
    .filter(([file]) => file.startsWith('assets/') && file.endsWith('.js'))
    .map(([, content]) => content)
    .join('\n')
}

/** The static hub's RPC dump, where the docks are baked in */
function hubDump(outDir: string) {
  return Object.values(readTree(join(outDir, '__devtools', '__rpc-dump'))).join('\n')
}

afterAll(() => {
  rmSync(outRoot, { recursive: true, force: true })
})

describe('client build with production: true', () => {
  it('bundles the recorder, the page script, the panel and the dock', async () => {
    const { outDir, warnings } = await buildFixture({ out: 'client' })
    const js = appJs(outDir)
    const html = readFileSync(join(outDir, 'index.html'), 'utf8')

    expect(warnings).toEqual([])
    // Recorder with the record-time mask flag, not the no-op
    expect(js).toMatch(SETS_MASK_FLAG)
    expect(js).toContain('orpc-inspector:store')
    // Page script bundled from the inline module; no unresolved virtual import left in the HTML
    expect(js).toContain('__ORPC_INSPECTOR_SSR__')
    expect(html).not.toContain('virtual:orpc-inspector')
    // Vite DevTools injection loads the dock
    expect(js).toContain('/__devtools/embedded.js')
    // Panel copied next to the app
    expect(existsSync(join(outDir, '__orpc-inspector', 'index.html'))).toBe(true)
    expect(readdirSync(join(outDir, '__orpc-inspector', 'assets')).length).toBeGreaterThan(0)
    // Dock baked into the static hub
    expect(hubDump(outDir)).toContain('"/__orpc-inspector/"')
  }, TIMEOUT)

  it('puts the panel under base and points the dock there', async () => {
    const { outDir } = await buildFixture({
      out: 'client-base',
      config: { base: '/app/' },
    })

    // The output root is served at base, so <base>__orpc-inspector/ is <outDir>/__orpc-inspector/
    expect(existsSync(join(outDir, '__orpc-inspector', 'index.html'))).toBe(true)
    expect(hubDump(outDir)).toContain('"/app/__orpc-inspector/"')
    expect(appJs(outDir)).toContain('/app/__devtools/embedded.js')
  }, TIMEOUT)

  it('bundles the zod locale translator with zodLocale', async () => {
    const { outDir, warnings } = await buildFixture({
      out: 'client-locale',
      inspector: { production: true, zodLocale: 'zh-TW' },
    })

    expect(warnings).toEqual([])
    expect(appJs(outDir)).toContain('orpc-inspector:issue-translator')
  }, TIMEOUT)

  it('warns once that the dock is not injected when build.injection is off', async () => {
    const { outDir, warnings } = await buildFixture({
      out: 'client-no-injection',
      devtools: { withApp: true },
    })

    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('build.injection is off')
    expect(warnings[0]).toContain('/__devtools/embedded.js')
    // Still built normally
    expect(appJs(outDir)).toMatch(SETS_MASK_FLAG)
    expect(existsSync(join(outDir, '__orpc-inspector', 'index.html'))).toBe(true)
  }, TIMEOUT)
})

describe('client build without the opt-in', () => {
  it('leaves no inspector code or panel by default', async () => {
    const { outDir, warnings } = await buildFixture({ out: 'default', inspector: {} })
    const js = appJs(outDir)

    expect(warnings).toEqual([])
    expect(js).not.toContain('orpc-inspector:')
    expect(js).not.toContain('__ORPC_INSPECTOR_SSR__')
    expect(existsSync(join(outDir, '__orpc-inspector'))).toBe(false)
    expect(hubDump(outDir)).not.toContain('__orpc-inspector')
  }, TIMEOUT)

  it('warns once and outputs the same as the default without Vite DevTools withApp', async () => {
    const off = await buildFixture({ out: 'no-devtools-off', inspector: {}, devtools: false })
    const on = await buildFixture({ out: 'no-devtools-on', devtools: false })

    expect(off.warnings).toEqual([])
    expect(on.warnings).toHaveLength(1)
    expect(on.warnings[0]).toContain('needs Vite DevTools with build.withApp')
    expect(readTree(on.outDir)).toEqual(readTree(off.outDir))
  }, TIMEOUT)
})

describe('sSR server build with production: true', () => {
  async function buildServer(out: string, devtools: BuildCase['devtools'] = { withApp: true, injection: true }) {
    const { outDir, warnings } = await buildFixture({
      out,
      devtools,
      config: {
        build: { ssr: 'entry-server.ts' },
      },
    })
    const files = readTree(outDir)
    const server = await import(/* @vite-ignore */ pathToFileURL(join(outDir, 'entry-server.js')).href) as { render: () => Promise<string> }
    return { files, server, warnings }
  }

  it('bundles the real recorder and renders masked SSR records into the page', async () => {
    const { files, server, warnings } = await buildServer('server')

    expect(warnings).toEqual([])
    const bundle = files['entry-server.js']
    expect(bundle).not.toMatch(/from ['"]orpc-inspector['"]/)
    // The server does not set the flag (server records are always masked) and gets no panel
    expect(bundle).toContain('orpc-inspector:store')
    expect(bundle).not.toMatch(SETS_MASK_FLAG)
    expect(Object.keys(files).some(file => file.startsWith('__orpc-inspector/'))).toBe(false)

    const head = await server.render()
    expect(head).toMatch(/^<script>window\.__ORPC_INSPECTOR_SSR__=\[/)
    const calls = JSON.parse(head.slice(head.indexOf('=') + 1, -'</script>'.length)) as OrpcCall[]
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ side: 'ssr', procedure: 'ping' })
    expect(calls[0]!.requestHeaders?.authorization).toBe('***')
  }, TIMEOUT)

  it('keeps the no-op recorder without production, despite the dev server SSR takeover', async () => {
    const { outDir, warnings } = await buildFixture({
      out: 'server-default',
      inspector: {},
      config: {
        build: { ssr: 'entry-server.ts' },
      },
    })
    const server = await import(/* @vite-ignore */ pathToFileURL(join(outDir, 'entry-server.js')).href) as { render: () => Promise<string> }

    expect(warnings).toEqual([])
    expect(await server.render()).toBe('')
  }, TIMEOUT)

  it('keeps the no-op recorder without Vite DevTools withApp', async () => {
    const { server, warnings } = await buildServer('server-no-devtools', false)

    // Only the client build warns
    expect(warnings).toEqual([])
    expect(await server.render()).toBe('')
  }, TIMEOUT)
})

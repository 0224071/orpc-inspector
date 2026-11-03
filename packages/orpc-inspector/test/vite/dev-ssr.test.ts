import type { OrpcCall } from '../../src/core/types'
import { execFile } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// Vite middleware-mode SSR against a copy of the built package in node_modules, which Vite externalizes like an npm install
// (the workspace package is linked, so Vite would inline it and hide the problem). Each scenario runs in a plain `node`
// child process: Vitest workers resolve the `development` condition natively, which would also hide it.
// ssr-fixture has its own package.json, otherwise `orpc-inspector` self-references this package instead of the copy.
// Uses dist (both the recorder and the plugin); run `pnpm build` after changing src.
const root = fileURLToPath(new URL('./ssr-fixture', import.meta.url))
const packageRoot = fileURLToPath(new URL('../..', import.meta.url))
const installed = join(root, 'node_modules', 'orpc-inspector')
const TIMEOUT = 60_000

interface Report {
  single: string
  concurrent: [string, string]
  afterInvalidate: string
  externalConditions: string[]
  execArgv: string[]
  nodeOptions: string | null
  ssrClient?: string
  browserRoot?: string
}

const run = promisify(execFile)

/** Plain Node environment: no NODE_OPTIONS, no flags */
function plainEnv() {
  const env = { ...process.env }
  delete env.NODE_OPTIONS
  return env
}

async function runScenario(scenario: string) {
  const { stdout } = await run(process.execPath, ['run.mjs', scenario], {
    cwd: root,
    env: plainEnv(),
  })
  return JSON.parse(stdout) as Report
}

function posix(path: string | undefined) {
  return path?.replaceAll('\\', '/')
}

function expectOneMaskedCall(head: string, marker: string) {
  expect(head).toMatch(/^<script>window\.__ORPC_INSPECTOR_SSR__=\[/)
  const calls = JSON.parse(head.slice(head.indexOf('=') + 1, -'</script>'.length)) as OrpcCall[]
  expect(calls).toHaveLength(1)
  expect(calls[0]).toMatchObject({
    side: 'ssr',
    procedure: 'ping',
    input: { marker },
  })
  expect(calls[0]!.requestHeaders?.authorization).toBe('***')
  expect(head).not.toContain('fixture-secret')
}

function expectRecords(report: Report) {
  expectOneMaskedCall(report.single, 'a')
  expectOneMaskedCall(report.concurrent[0], 'b')
  expectOneMaskedCall(report.concurrent[1], 'c')
  expectOneMaskedCall(report.afterInvalidate, 'd')
}

function expectNoOp(report: Report) {
  expect([report.single, ...report.concurrent, report.afterInvalidate]).toEqual(['', '', '', ''])
}

/** Newest mtime among files under `dir` that pass `filter` */
function newestMtime(dir: string, filter: (file: string) => boolean) {
  return Math.max(0, ...readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter(filter)
    .map(file => statSync(join(dir, file)).mtimeMs))
}

/** Fails fast when src is newer than dist: a stale plugin injects nothing and every check sees an empty head */
function assertDistIsFresh() {
  const dist = join(packageRoot, 'dist')
  const built = existsSync(dist)
    ? newestMtime(dist, file => file.endsWith('.js'))
    : 0
  const source = Math.max(
    newestMtime(join(packageRoot, 'src'), file => file.endsWith('.ts')),
    statSync(join(packageRoot, 'tsdown.config.ts')).mtimeMs,
  )
  if (built < source)
    throw new Error('dist is older than src. Run `pnpm build` before this test.')
}

beforeAll(() => {
  assertDistIsFresh()
  rmSync(installed, { recursive: true, force: true })
  mkdirSync(join(installed, 'dist'), { recursive: true })
  cpSync(join(packageRoot, 'package.json'), join(installed, 'package.json'))
  for (const file of readdirSync(join(packageRoot, 'dist'))) {
    if (file.endsWith('.js'))
      cpSync(join(packageRoot, 'dist', file), join(installed, 'dist', file))
  }
})

afterAll(() => {
  rmSync(join(root, 'node_modules'), { recursive: true, force: true })
})

describe('vite dev server SSR entry', () => {
  it('gets the no-op from the installed package without the plugin', async () => {
    expectNoOp(await runScenario('no-plugin'))
  }, TIMEOUT)

  it('records per request with the plugin, leaving conditions and Node flags alone', async () => {
    const report = await runScenario('default')
    // One masked call per request, concurrent requests kept apart, still recording after invalidation
    expectRecords(report)
    expect(report.externalConditions).toEqual(['node', 'module-sync'])
    expect(report.execArgv).toEqual([])
    expect(report.nodeOptions).toBeNull()
    // Only the root import in SSR is taken over
    expect(posix(report.ssrClient)).toBe(posix(join(installed, 'dist', 'client.js')))
    // The browser keeps Vite's normal resolution (the pre-bundled dependency)
    expect(report.browserRoot).not.toContain('virtual:orpc-inspector')
    expect(posix(report.browserRoot)).toContain('/.vite/deps/orpc-inspector.js')
  }, TIMEOUT)

  it.each([
    ['noExternal: true', 'no-external-true'],
    ['noExternal regex list', 'no-external-regex'],
  ])('merges with the user\'s %s', async (_case, scenario) => {
    expectRecords(await runScenario(scenario))
  }, TIMEOUT)

  it.each([
    ['ssr.external list', 'external-list'],
    ['ssr.external: true', 'external-true'],
  ])('keeps the package external with the user\'s %s', async (_case, scenario) => {
    expectNoOp(await runScenario(scenario))
  }, TIMEOUT)
})

describe('vitest', () => {
  /** Runs ssr-fixture/vt with one config in a child Vitest; returns whether the test's head had records */
  async function runVitest(config: 'with' | 'without') {
    const out = join(root, 'node_modules', `vt-${config}.out`)
    const vitest = createRequire(import.meta.url).resolve('vitest/package.json').replace(/package\.json$/, 'vitest.mjs')
    await run(process.execPath, [
      vitest,
      'run',
      '--root',
      '.',
      '--config',
      `vt/${config}.config.mjs`,
    ], {
      cwd: root,
      env: {
        ...plainEnv(),
        VT_OUT: out,
      },
    })
    return readFileSync(out, 'utf8')
  }

  it('gets the same recorder with or without the plugin', async () => {
    // Vitest already resolves the real recorder on its own, so the takeover changes nothing there
    expect(await runVitest('without')).toBe('records')
    expect(await runVitest('with')).toBe('records')
  }, TIMEOUT)
})

describe('plain Node server', () => {
  it('gets the no-op when importing the package natively without the flag', async () => {
    const { stdout } = await run(process.execPath, [
      '--input-type=module',
      '-e',
      `const { render } = await import('./entry-server.ts'); console.log(JSON.stringify(await render('plain')))`,
    ], {
      cwd: root,
      env: plainEnv(),
    })
    expect(JSON.parse(stdout)).toBe('')
  }, TIMEOUT)
})

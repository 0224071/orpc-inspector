// Fresh-install smoke test: packs orpc-inspector, installs the tarball into a new Vite or Nuxt app outside the repo
// with no lockfile (so the latest published dependencies), starts the dev server and opens the oRPC panel from the dock.
// --version installs that version from the npm registry instead of a tarball, waiting until the registry serves it.
// usage: node scripts/smoke/run.mjs --pm <pnpm|npm> --app <vite|nuxt> [--tarball <file> | --version <x.y.z>] [--dir <work dir>] [--keep]
import { spawn, spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const repoRoot = fileURLToPath(new URL('../../', import.meta.url))
const { values: args } = parseArgs({
  options: {
    pm: { type: 'string' },
    app: { type: 'string' },
    tarball: { type: 'string' },
    version: { type: 'string' },
    dir: { type: 'string' },
    keep: { type: 'boolean', default: false },
  },
})
if (!['pnpm', 'npm'].includes(args.pm) || !['vite', 'nuxt'].includes(args.app) || (args.tarball && args.version)) {
  console.error('usage: node scripts/smoke/run.mjs --pm <pnpm|npm> --app <vite|nuxt> [--tarball <file> | --version <x.y.z>] [--dir <work dir>] [--keep]')
  process.exit(2)
}
const isWindows = process.platform === 'win32'
const t0 = Date.now()
const log = msg => console.log(`[smoke ${((Date.now() - t0) / 1000).toFixed(1)}s] ${msg}`)

/** Packages that must resolve to a single version, or the dock breaks (@devframes/hub pins devframe exactly) */
const SINGLE_VERSION = ['devframe', '@devframes/hub']

// README ranges; no lockfile, so each resolves to the latest matching release
const ORPC = { '@orpc/client': '^1.16.0', '@orpc/contract': '^1.16.0', '@orpc/server': '^1.16.0' }
const MANIFESTS = {
  vite: tarball => ({
    dependencies: ORPC,
    devDependencies: { 'orpc-inspector': tarball, '@vitejs/devtools': '^0.8.0', 'vite': '^8.3.0' },
  }),
  nuxt: tarball => ({
    dependencies: { ...ORPC, nuxt: '^4.6.0', vue: '^3.5.0' },
    devDependencies: { 'orpc-inspector': tarball, '@nuxt/devtools': '^4.0.0', '@nuxt/kit': '^4.6.0' },
  }),
}

// Settings from a parent `pnpm run` (npm_config_*) must not leak into the fresh project
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(?:npm_config_|npm_package_|npm_lifecycle_|pnpm_config_)/i.test(k)))
Object.assign(env, { NO_COLOR: '1', NUXT_TELEMETRY_DISABLED: '1', BROWSER: 'none' })

function run(cmd, cmdArgs, cwd) {
  const line = [
    cmd,
    ...cmdArgs.map(a => /\s/.test(a)
      ? `"${a}"`
      : a),
  ].join(' ')
  log(`$ ${line}`)
  // pnpm and npm are .cmd shims on Windows, which need a shell
  const result = isWindows
    ? spawnSync(line, {
        cwd,
        env,
        stdio: 'inherit',
        shell: true,
      })
    : spawnSync(cmd, cmdArgs, { cwd, env, stdio: 'inherit' })
  if (result.status !== 0)
    throw new Error(`${cmd} ${cmdArgs.join(' ')} exited with ${result.status}`)
}

function isInside(child, parent) {
  const rel = relative(parent, child)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

function packTarball(dest) {
  if (!existsSync(join(repoRoot, 'packages/orpc-inspector/dist/index.js')))
    throw new Error('packages/orpc-inspector/dist is missing; run `pnpm build` first')
  run('pnpm', [
    '-F',
    'orpc-inspector',
    'pack',
    '--pack-destination',
    dest,
  ], repoRoot)
  const file = readdirSync(dest).find(f => /^orpc-inspector-.*\.tgz$/.test(f))
  if (!file)
    throw new Error(`pnpm pack wrote no tarball to ${dest}`)
  return join(dest, file)
}

const REGISTRY = 'https://registry.npmjs.org'

/** Polls the metadata installers read until it lists `version`; right after a publish, the CDN may still serve the old document */
async function waitForRegistry(version, timeoutMs) {
  const url = `${REGISTRY}/orpc-inspector`
  const deadline = Date.now() + timeoutMs
  while (true) {
    try {
      const res = await fetch(url, {
        headers: { accept: 'application/vnd.npm.install-v1+json' },
        signal: AbortSignal.timeout(15_000),
      })
      if (res.ok && (await res.json()).versions?.[version])
        return
    }
    catch {}
    if (Date.now() > deadline)
      throw new Error(`${url} did not list ${version} within ${timeoutMs / 1000}s`)
    log(`waiting for the registry to list orpc-inspector@${version}`)
    await new Promise(r => setTimeout(r, 15_000))
  }
}

/** Retries the install; a mirror or cache can lag behind the registry document */
async function install(appDir, attempts) {
  for (let attempt = 1; ; attempt++) {
    try {
      if (args.pm === 'pnpm')
        run('pnpm', ['install', '--ignore-workspace'], appDir)
      else
        run('npm', ['install', '--no-audit', '--no-fund'], appDir)
      return
    }
    catch (error) {
      if (attempt >= attempts)
        throw error
      log(`install failed (attempt ${attempt} of ${attempts}); retrying in 30s`)
      rmSync(join(appDir, 'node_modules'), { recursive: true, force: true })
      await new Promise(r => setTimeout(r, 30_000))
    }
  }
}

/** Versions of each named package found anywhere under node_modules (npm nesting and pnpm's .pnpm store) */
function scanVersions(appDir, names) {
  const found = new Map(names.map(n => [
    n,
    new Map(),
  ]))
  const readJson = file => JSON.parse(readFileSync(file, 'utf8'))
  function visitPackage(dir) {
    const manifest = join(dir, 'package.json')
    if (existsSync(manifest)) {
      const { name, version } = readJson(manifest)
      const versions = found.get(name)
      if (versions)
        versions.set(version, (versions.get(version) ?? 0) + 1)
    }
    visitNodeModules(join(dir, 'node_modules'))
  }
  function visitNodeModules(dir) {
    if (!existsSync(dir))
      return
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.name === '.pnpm') {
        for (const id of readdirSync(path))
          visitNodeModules(join(path, id, 'node_modules'))
        continue
      }
      // pnpm links (symlinks or junctions) point into .pnpm, which is visited directly
      if (entry.name.startsWith('.') || entry.isSymbolicLink() || !entry.isDirectory())
        continue
      if (entry.name.startsWith('@')) {
        for (const scoped of readdirSync(path, { withFileTypes: true })) {
          if (scoped.isDirectory() && !scoped.isSymbolicLink())
            visitPackage(join(path, scoped.name))
        }
      }
      else {
        visitPackage(path)
      }
    }
  }
  visitNodeModules(join(appDir, 'node_modules'))
  return found
}

/** Real directory of `name` as Node resolves it from `fromDir` (walks up through node_modules folders) */
function packageDir(fromDir, name) {
  let dir = realpathSync(fromDir)
  while (true) {
    const candidate = join(dir, 'node_modules', name)
    if (existsSync(join(candidate, 'package.json')))
      return realpathSync(candidate)
    const parent = dirname(dir)
    if (parent === dir)
      throw new Error(`cannot resolve ${name} from ${fromDir}`)
    dir = parent
  }
}

function packageVersion(dir) {
  return JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).version
}

function freePort() {
  return new Promise((res, rej) => {
    const server = createServer()
    server.once('error', rej)
    server.listen(0, () => {
      const { port } = server.address()
      server.close(() => res(port))
    })
  })
}

function binOf(appDir, pkg, binName) {
  const dir = join(appDir, 'node_modules', pkg)
  const { bin } = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
  return join(dir, typeof bin === 'string'
    ? bin
    : bin[binName])
}

function startDev(appDir, port, logFile) {
  const command = args.app === 'vite'
    ? [
        binOf(appDir, 'vite', 'vite'),
        '--port',
        String(port),
        '--strictPort',
      ]
    : [
        binOf(appDir, 'nuxt', 'nuxt'),
        'dev',
        '--port',
        String(port),
      ]
  log(`$ node ${command.join(' ')}`)
  const child = spawn(process.execPath, command, {
    cwd: appDir,
    env,
    detached: !isWindows,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const output = []
  for (const stream of [child.stdout, child.stderr]) {
    stream.setEncoding('utf8')
    stream.on('data', (chunk) => {
      output.push(chunk)
      writeFileSync(logFile, chunk, { flag: 'a' })
    })
  }
  let exited = null
  child.on('exit', code => exited = code ?? 'signal')
  return {
    text: () => output.join(''),
    exited: () => exited,
    stop() {
      if (exited !== null)
        return
      if (isWindows) {
        spawnSync('taskkill', [
          '/pid',
          String(child.pid),
          '/T',
          '/F',
        ], { stdio: 'ignore' })
      }
      else {
        process.kill(-child.pid, 'SIGKILL')
      }
    },
  }
}

/** Polls until the app itself renders (Nuxt serves a loading page while it bundles, so a 200 alone is not enough) */
async function waitForApp(url, dev, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (dev.exited() !== null)
      throw new Error(`dev server exited with ${dev.exited()}`)
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(10_000),
      })
      if (res.ok && (await res.text()).includes('id="out"'))
        return
    }
    catch {}
    await new Promise(r => setTimeout(r, 1000))
  }
  throw new Error(`the app at ${url} did not render within ${timeoutMs / 1000}s`)
}

/** Expands the collapsed dock and clicks the oRPC entry (Nuxt may put it behind the overflow button), then returns the panel frame */
async function openPanel(page) {
  const anchor = page.locator('#devframes-anchor')
  await anchor.waitFor({ state: 'attached', timeout: 60_000 })
  for (let attempt = 0; attempt < 10; attempt++) {
    const box = await anchor.evaluate((el) => {
      const r = el.getBoundingClientRect()
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
    })
    await page.mouse.move(640, 300)
    await page.mouse.move(box.x, box.y, { steps: 5 })
    await page.waitForTimeout(800)
    let entry = page.getByRole('button', { name: /orpc/i })
    if (!await entry.count()) {
      const overflow = anchor.getByRole('button', { name: /^(?:overflow|more)$/i }).first()
      if (await overflow.count()) {
        await overflow.click()
        await page.waitForTimeout(500)
        entry = page.getByRole('button', { name: /orpc/i })
      }
    }
    if (await entry.count()) {
      await entry.first().click()
      for (let i = 0; i < 30; i++) {
        const frame = page.frames().find(f => f.url().includes('/__orpc-inspector/'))
        if (frame)
          return frame
        await page.waitForTimeout(500)
      }
      throw new Error('clicked the oRPC dock entry, but no panel frame appeared')
    }
    await page.waitForTimeout(1000)
  }
  throw new Error('no oRPC entry in the DevTools dock')
}

async function checkInBrowser(url, workDir) {
  const { chromium } = await import('playwright-core')
  const executablePath = process.env.SMOKE_CHROME_PATH
  const browser = await chromium.launch(executablePath
    ? { executablePath }
    : { channel: 'chrome' })
  // Dock labels follow the browser language; the overflow button is matched by its English name
  const page = await browser.newPage({
    viewport: { width: 1280, height: 800 },
    locale: 'en-US',
  })
  const pageErrors = []
  page.on('pageerror', e => pageErrors.push(String(e)))
  try {
    await page.goto(url)
    await page.waitForFunction(() => document.querySelector('#out')?.textContent?.includes('pong'), null, { timeout: 60_000 })
    log('app call succeeded; opening the oRPC panel from the dock')
    const panel = await openPanel(page)
    // Nuxt also records the SSR call
    const expected = args.app === 'nuxt'
      ? ['ping', 'SSR']
      : ['ping']
    // innerText: rendered text only, not the contents of <script> or <style>
    // eslint-disable-next-line unicorn/prefer-dom-node-text-content
    await panel.waitForFunction(words => words.every(w => document.body.innerText.includes(w)), expected, { timeout: 30_000 })
    // eslint-disable-next-line unicorn/prefer-dom-node-text-content -- Playwright's innerText(), same reason
    log(`panel lists the call: ${(await panel.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 160)}`)
  }
  catch (error) {
    await page.screenshot({
      path: join(workDir, 'failure.png'),
    }).catch(() => {})
    if (pageErrors.length)
      console.error(`page errors:\n${pageErrors.join('\n')}`)
    throw error
  }
  finally {
    await browser.close()
  }
}

async function main() {
  const workRoot = resolve(args.dir ?? tmpdir())
  // An install in a folder inside the repo would climb to the repo's package.json and change it
  if (isInside(workRoot, repoRoot))
    throw new Error(`${workRoot} is inside the repo; pass --dir outside it`)
  mkdirSync(workRoot, { recursive: true })
  const workDir = mkdtempSync(join(workRoot, `orpc-inspector-smoke-${args.pm}-${args.app}-`))
  log(`work dir ${workDir}`)
  let dev
  let ok = false
  try {
    let spec
    if (args.version) {
      await waitForRegistry(args.version, 600_000)
      spec = args.version
    }
    else {
      const tarball = args.tarball
        ? resolve(args.tarball)
        : packTarball(workDir)
      spec = `file:${tarball.replaceAll('\\', '/')}`
    }
    const appDir = join(workDir, 'app')
    cpSync(fileURLToPath(new URL(`fixtures/${args.app}/`, import.meta.url)), appDir, { recursive: true })
    writeFileSync(join(appDir, 'package.json'), `${JSON.stringify({
      name: 'orpc-inspector-smoke',
      private: true,
      type: 'module',
      ...MANIFESTS[args.app](spec),
    }, null, 2)}\n`)

    await install(appDir, args.version ? 3 : 1)

    const versions = scanVersions(appDir, [
      'orpc-inspector',
      ...SINGLE_VERSION,
      '@vitejs/devtools-kit',
      '@vitejs/devtools',
      '@nuxt/devtools',
      'vite',
      'nuxt',
    ])
    for (const [name, found] of versions) {
      if (found.size) {
        log(`${name}: ${[...found].map(([v, n]) => n > 1
          ? `${v} (${n} copies)`
          : v).join(', ')}`)
      }
    }
    if (args.version && packageVersion(packageDir(appDir, 'orpc-inspector')) !== args.version)
      throw new Error(`installed orpc-inspector ${packageVersion(packageDir(appDir, 'orpc-inspector'))}, expected ${args.version}`)
    const duplicated = SINGLE_VERSION.filter(name => versions.get(name).size > 1)
    if (duplicated.length)
      throw new Error(`more than one version installed of ${duplicated.join(', ')}; the DevTools dock fails to start when they differ`)
    // Other packages (e.g. Nuxt's own unhead) may bring an older kit; only the inspector's must match the host's
    const hostDevtools = args.app === 'vite'
      ? appDir
      : packageDir(appDir, '@nuxt/devtools')
    const hostKit = packageVersion(packageDir(packageDir(hostDevtools, '@vitejs/devtools'), '@vitejs/devtools-kit'))
    const inspectorKit = packageVersion(packageDir(packageDir(appDir, 'orpc-inspector'), '@vitejs/devtools-kit'))
    if (hostKit !== inspectorKit)
      throw new Error(`orpc-inspector uses @vitejs/devtools-kit ${inspectorKit}, but @vitejs/devtools uses ${hostKit}`)

    const port = await freePort()
    const url = `http://localhost:${port}/`
    dev = startDev(appDir, port, join(workDir, 'dev.log'))
    await waitForApp(url, dev, 240_000)
    log(`app renders at ${url}`)
    await checkInBrowser(url, workDir)
    const setupError = dev.text().split('\n').find(line => /Error setting up plugin/i.test(line))
    if (setupError)
      throw new Error(`DevTools reported a plugin setup error: ${setupError.trim()}`)
    ok = true
    log(`passed: ${args.pm} + ${args.app}`)
  }
  catch (error) {
    if (dev) {
      const tail = dev.text().split('\n').slice(-60).join('\n')
      console.error(`--- dev server output (last 60 lines) ---\n${tail}\n---`)
    }
    console.error(`[smoke] FAILED (${args.pm} + ${args.app}): ${error.message}`)
    console.error(`[smoke] kept ${workDir} for inspection`)
    process.exitCode = 1
  }
  finally {
    dev?.stop()
    if (ok && !args.keep) {
      rmSync(workDir, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 500,
      })
    }
  }
}

await main()

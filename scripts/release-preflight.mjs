// Runs before bumpp in `pnpm release`: a failure here stops the release before any version commit or tag exists.
// 1. main is clean and matches origin/main
// 2. CI and Smoke passed on GitHub for that commit (Smoke covers pnpm/npm × Vite/Nuxt)
// 3. `pnpm check` and a fresh-install smoke test pass here, with today's dependencies
// The tag's Release workflow runs the full smoke matrix again before publishing. SMOKE=all runs all four here too.
import { spawnSync } from 'node:child_process'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('../', import.meta.url))

function fail(message) {
  console.error(`[release] ${message}`)
  console.error('[release] nothing was bumped, committed or tagged')
  process.exit(1)
}

function capture(cmd, cmdArgs) {
  const result = spawnSync(cmd, cmdArgs, { cwd: repoRoot, encoding: 'utf8' })
  if (result.status !== 0)
    fail(`${cmd} ${cmdArgs.join(' ')} failed:\n${result.stderr || result.error}`)
  return result.stdout.trim()
}

/** All arguments are constants; one command line keeps pnpm's .cmd shim working on Windows */
function pnpm(line) {
  console.log(`[release] $ pnpm ${line}`)
  const result = spawnSync(`pnpm ${line}`, { cwd: repoRoot, stdio: 'inherit', shell: true })
  if (result.status !== 0)
    fail(`pnpm ${line} failed`)
}

const branch = capture('git', ['branch', '--show-current'])
if (branch !== 'main')
  fail(`releases are cut from main, but the current branch is ${branch || '(detached)'}`)
if (capture('git', ['status', '--porcelain']))
  fail('the working tree has uncommitted changes')
capture('git', ['fetch', '--quiet', 'origin', 'main'])
const head = capture('git', ['rev-parse', 'HEAD'])
const remote = capture('git', ['rev-parse', 'origin/main'])
if (head !== remote)
  fail(`main (${head.slice(0, 7)}) does not match origin/main (${remote.slice(0, 7)}); pull or push first`)

for (const workflow of ['ci.yml', 'smoke.yml']) {
  const runs = JSON.parse(capture('gh', [
    'run',
    'list',
    '--workflow',
    workflow,
    '--commit',
    head,
    '--event',
    'push',
    '--json',
    'status,conclusion,url',
  ]))
  const run = runs[0]
  if (!run)
    fail(`no ${workflow} run on GitHub for ${head.slice(0, 7)} yet`)
  if (run.status !== 'completed')
    fail(`${workflow} is still running for ${head.slice(0, 7)}: ${run.url}`)
  if (run.conclusion !== 'success')
    fail(`${workflow} ended with ${run.conclusion} for ${head.slice(0, 7)}: ${run.url}`)
  console.log(`[release] ${workflow} passed on GitHub for ${head.slice(0, 7)}`)
}

pnpm('check')
const combos = process.env.SMOKE === 'all'
  ? [
      'pnpm vite',
      'pnpm nuxt',
      'npm vite',
      'npm nuxt',
    ]
  : ['pnpm vite']
for (const combo of combos) {
  const [pm, app] = combo.split(' ')
  pnpm(`smoke --pm ${pm} --app ${app}`)
}
console.log('[release] preflight passed')

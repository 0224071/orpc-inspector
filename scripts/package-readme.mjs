// prepack: copy the root README into the published package, with relative links pointing at GitHub at this version's tag
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = new URL('../', import.meta.url)
const pkgDir = new URL('packages/orpc-inspector/', root)
const pkg = JSON.parse(readFileSync(new URL('package.json', pkgDir), 'utf8'))

const repo = pkg.repository.url.replace(/^git\+/, '').replace(/\.git$/, '')
const ref = `v${pkg.version}`
const blob = `${repo}/blob/${ref}/`
const raw = `${repo.replace('https://github.com/', 'https://raw.githubusercontent.com/')}/${ref}/`

const readme = readFileSync(new URL('README.md', root), 'utf8')
  .replace(/(src|srcset)="\.\/([^"]+)"/g, (_, attr, path) => `${attr}="${raw}${path}"`)
  .replace(/href="\.\/([^"]+)"/g, (_, path) => `href="${blob}${path}"`)
  .replace(/\]\(\.\/([^)]+)\)/g, (_, path) => `](${blob}${path})`)

writeFileSync(fileURLToPath(new URL('README.md', pkgDir)), readme)

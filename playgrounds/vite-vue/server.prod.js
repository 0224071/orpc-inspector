// Serves the SSR build (`pnpm build:inspector:ssr`): static files from dist/client, everything else rendered by dist/server
import { readFile, stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, join, normalize, sep } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
}

const port = Number(process.env.PORT ?? 4174)
const clientDir = fileURLToPath(new URL('./dist/client', import.meta.url))

/** File under dist/client for this path, with index.html for directories; undefined when there is none */
async function staticFile(pathname) {
  let file = normalize(join(clientDir, decodeURIComponent(pathname)))
  if (!file.startsWith(clientDir + sep))
    return undefined
  let info = await stat(file).catch(() => undefined)
  if (info?.isDirectory()) {
    file = join(file, 'index.html')
    info = await stat(file).catch(() => undefined)
  }
  return info?.isFile()
    ? file
    : undefined
}

async function start() {
  const template = await readFile(join(clientDir, 'index.html'), 'utf8')
  const { render } = await import('./dist/server/entry-server.js')

  createServer(async (req, res) => {
    try {
      const pathname = (req.url ?? '/').split('?')[0]
      const file = pathname === '/'
        ? undefined
        : await staticFile(pathname)
      if (file) {
        res.setHeader('Content-Type', MIME[extname(file)] ?? 'application/octet-stream')
        res.end(await readFile(file))
        return
      }
      const { appHtml, head } = await render()
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.end(template.replace('<!--app-head-->', head).replace('<!--app-html-->', appHtml))
    }
    catch (error) {
      res.statusCode = 500
      res.end(String(error?.stack ?? error))
    }
  }).listen(port, () => {
    console.warn(`SSR production playground: http://localhost:${port}/`)
  })
}

void start()

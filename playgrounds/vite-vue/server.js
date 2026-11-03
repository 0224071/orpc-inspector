// Minimal SSR entry: Vite middleware mode + src/entry-server.ts
import { readFile } from 'node:fs/promises'
import { createServer as createHttpServer } from 'node:http'
import process from 'node:process'
import { createServer } from 'vite'

async function start() {
  const port = Number(process.env.PORT ?? 5174)
  const template = await readFile(new URL('./index.html', import.meta.url), 'utf8')
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: 'custom',
  })

  createHttpServer((req, res) => {
    vite.middlewares(req, res, async () => {
      try {
        const html = await vite.transformIndexHtml(req.url ?? '/', template)
        const { render } = await vite.ssrLoadModule('/src/entry-server.ts')
        const { appHtml, head } = await render()
        res.setHeader('Content-Type', 'text/html; charset=utf-8')
        res.end(html.replace('<!--app-head-->', head).replace('<!--app-html-->', appHtml))
      }
      catch (error) {
        vite.ssrFixStacktrace(error)
        res.statusCode = 500
        res.end(String(error.stack ?? error))
      }
    })
  }).listen(port, () => {
    console.warn(`SSR playground: http://localhost:${port}/`)
  })
}

void start()

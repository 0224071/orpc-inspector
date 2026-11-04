import type { IncomingMessage, ServerResponse } from 'node:http'
import { existsSync } from 'node:fs'
import { cp, readFile, stat } from 'node:fs/promises'
import { extname, join, normalize, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ORPC_INSPECTOR_PANEL_ROUTE } from '../core/types'

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
}

/** After build, vite.js and panel/ both live in dist; when running from source (tests), fall back to ../../dist/panel */
export function defaultPanelDir() {
  const built = fileURLToPath(new URL('./panel', import.meta.url))
  return existsSync(built)
    ? built
    : fileURLToPath(new URL('../../dist/panel', import.meta.url))
}

/** Serves panelDir as static files; returns false when not found so the next middleware handles it */
async function serveFile(panelDir: string, relative: string, res: ServerResponse) {
  const file = normalize(join(panelDir, decodeURIComponent(relative || 'index.html')))
  if (file !== panelDir && !file.startsWith(panelDir + sep))
    return false
  const info = await stat(file).catch(() => undefined)
  if (!info?.isFile())
    return false
  res.setHeader('Content-Type', MIME[extname(file)] ?? 'application/octet-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.end(await readFile(file))
  return true
}

/** Dev server middleware serving the panel under route(); the bare route without its slash redirects to it */
export function panelMiddleware(panelDir: string, route: () => string, serve = () => true) {
  return (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const prefix = route()
    const pathname = req.url?.split('?')[0] ?? ''
    if (pathname === prefix.slice(0, -1)) {
      res.statusCode = 302
      res.setHeader('Location', prefix)
      res.end()
      return
    }
    // The adapter serves files with a host; keep the redirect and the no-host fallback.
    if (!pathname.startsWith(prefix) || !serve())
      return next()
    serveFile(panelDir, pathname.slice(prefix.length), res)
      .then(served => served || next())
      .catch(next)
  }
}

/** The output root is served at base, so the panel lands at <base>__orpc-inspector/ */
export function copyPanel(panelDir: string, outDir: string) {
  return cp(panelDir, join(outDir, ORPC_INSPECTOR_PANEL_ROUTE.slice(1)), { recursive: true })
}

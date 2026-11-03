import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { ORPC_INSPECTOR_PANEL_ROUTE } from '../core/types'

/** oRPC modules the inspector brings into the app at runtime; pre-bundled so the first load does not re-optimize and full-reload */
export const ORPC_CLIENT_DEPS = ['@orpc/client', '@orpc/client/fetch', '@orpc/contract']

/** Same check Nuxt 4.6 uses before adding `@nuxt/devtools` */
export function isNuxtDevToolsEnabled(devtools: unknown) {
  return typeof devtools === 'boolean'
    ? devtools
    : (devtools as { enabled?: unknown } | undefined)?.enabled !== false
}

/** Version of the project's `@nuxt/devtools`, found by walking node_modules up from rootDir (the copy Nuxt loads) */
export function readNuxtDevToolsVersion(rootDir: string): string | undefined {
  for (let dir = rootDir; ; dir = dirname(dir)) {
    const pkg = join(dir, 'node_modules', '@nuxt', 'devtools', 'package.json')
    if (existsSync(pkg)) {
      try {
        return (JSON.parse(readFileSync(pkg, 'utf8')) as { version?: string }).version
      }
      catch {
        return undefined
      }
    }
    if (dirname(dir) === dir)
      return undefined
  }
}

/**
 * Nuxt-specific DevTools warning; `warned` tells the Vite plugin to skip its generic one.
 * An unknown version leaves the check to the Vite plugin.
 */
export function checkNuxtDevTools(enabled: boolean, version: string | undefined): { warning?: string, warned: boolean } {
  if (!enabled) {
    return {
      warning: '[orpc-inspector] Nuxt DevTools is disabled, so the oRPC panel has no supported entry. Enable `devtools` in nuxt.config and install `@nuxt/devtools@4`. The panel URL opened on its own stays disconnected.',
      warned: true,
    }
  }
  const major = Number.parseInt(version ?? '', 10)
  if (Number.isNaN(major) || major >= 4)
    return { warned: false }
  return {
    warning: `[orpc-inspector] Nuxt DevTools ${version} has no Vite DevTools dock, so the oRPC panel is unsupported. Install \`@nuxt/devtools@4\` as a devDependency. The panel URL opened on its own stays disconnected.`,
    warned: true,
  }
}

/** Panel URL on the Nuxt server origin, under app.baseURL */
export function nuxtPanelUrl(listenerUrl: string, baseURL: string) {
  const base = baseURL.endsWith('/')
    ? baseURL
    : `${baseURL}/`
  return `${new URL(listenerUrl).origin}${base}${ORPC_INSPECTOR_PANEL_ROUTE.slice(1)}`
}

interface OptimizeDepsConfig {
  optimizeDeps?: { include?: unknown, exclude?: unknown }
}

/** Appends the oRPC client ids the project neither lists nor excludes; returns a warning when include is not an array */
export function appendOrpcClientDeps(config: OptimizeDepsConfig): string | undefined {
  const optimizeDeps = (config.optimizeDeps ??= {})
  if (optimizeDeps.include === undefined)
    optimizeDeps.include = []
  if (!Array.isArray(optimizeDeps.include))
    return '[orpc-inspector] vite.optimizeDeps.include is not an array, so @orpc/client, @orpc/client/fetch and @orpc/contract were not added; the first page load may reload once.'
  const include = optimizeDeps.include as unknown[]
  const exclude = Array.isArray(optimizeDeps.exclude)
    ? optimizeDeps.exclude as unknown[]
    : []
  for (const id of ORPC_CLIENT_DEPS) {
    if (!include.includes(id) && !exclude.includes(id))
      include.push(id)
  }
  return undefined
}

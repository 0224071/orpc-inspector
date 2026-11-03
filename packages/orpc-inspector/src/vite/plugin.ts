import type { Plugin } from 'vite'
import { normalize, resolve } from 'node:path'
import process from 'node:process'
import { ORPC_INSPECTOR_DOCK_ID, ORPC_INSPECTOR_PANEL_ROUTE } from '../core/types'
import { DEVTOOLS_SERVER_PLUGIN, devToolsMissingWarning, isDevToolsOptionEnabled, startupLine } from './onboarding'
import { copyPanel, defaultPanelDir, panelMiddleware } from './panel-files'
import { keptExternal, PACKAGE_NAME, recorderModule } from './recorder-entry'
import { resolveZodLocale, translatorModule, zodOptimizeDeps } from './zod-locale'

export const CLIENT_MODULE_ID = 'virtual:orpc-inspector/client'
const RESOLVED_CLIENT_MODULE_ID = `\0${CLIENT_MODULE_ID}`
export const TRANSLATOR_MODULE_ID = 'virtual:orpc-inspector/issue-translator'
const RESOLVED_TRANSLATOR_MODULE_ID = `\0${TRANSLATOR_MODULE_ID}`
export const RECORDER_MODULE_ID = 'virtual:orpc-inspector/recorder'
const RESOLVED_RECORDER_MODULE_ID = `\0${RECORDER_MODULE_ID}`
const RESOLVED_SSR_RECORDER_MODULE_ID = `\0${RECORDER_MODULE_ID}?ssr`

/** Plugins Vite DevTools (@vitejs/devtools 0.8) keeps in a build when `build.withApp` / `build.injection` are on */
export const DEVTOOLS_BUILD_PLUGIN = 'vite:devtools:build'
const DEVTOOLS_INJECTION_PLUGIN = 'vite:devtools:injection'

const ICON = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 8l-4 4 4 4"/><path d="M17 8l4 4-4 4"/><path d="M14 4l-4 16"/></svg>',
)}`

/** Only the parts we use; see DevToolsNodeContext in @vitejs/devtools-kit */
interface DevToolsSetupContext {
  docks: {
    views: { has: (id: string) => boolean }
    register: (entry: {
      id: string
      title: string
      icon: string
      category: string
      defaultOrder: number
      type: 'iframe'
      url: string
    }) => void
  }
}

export type OrpcInspectorVitePlugin = Plugin & {
  devtools: { setup: (ctx: DevToolsSetupContext) => void }
}

export interface InternalPluginOptions {
  /** Prebuilt panel directory; defaults to the package's dist/panel */
  panelDir?: string
  /** Prefix for the panel page and dock URL; defaults to Vite `base`. Nuxt's Vite base is /_nuxt/, so use app.baseURL there */
  panelBase?: string
  /** zod locale used to translate default issue messages shown in the panel, e.g. `zh-TW` */
  zodLocale?: string
  /** Nuxt already warned about its DevTools, so skip the generic missing-DevTools warning */
  skipDevToolsWarning?: boolean
  /** Nuxt prints the startup line with its public origin, so skip Vite's */
  skipStartupLine?: boolean
  /** Also apply to `vite build` (client and SSR); see README "Production builds" */
  production?: boolean
  /**
   * Nuxt: the module loads the page script from its client plugin, serves the panel through Nitro and adds Vite DevTools itself,
   * so the build skips HTML injection, the panel copy and the Vite DevTools check.
   * On the dev server Nuxt's SSR has its own path, so the SSR entry takeover is skipped
   */
  nuxt?: boolean
}

function withTrailingSlash(base: string) {
  return base.endsWith('/')
    ? base
    : `${base}/`
}

export function createOrpcInspectorPlugin(options: InternalPluginOptions = {}): OrpcInspectorVitePlugin {
  const panelDir = normalize(options.panelDir ?? defaultPanelDir())
  let base = '/'
  const panelRoute = () => `${withTrailingSlash(options.panelBase ?? base)}${ORPC_INSPECTOR_PANEL_ROUTE.slice(1)}`
  /** Set when zodLocale resolves */
  let localeSpecifier: string | undefined
  let warning: string | undefined
  let warned = false
  let devToolsEnabled = false
  let devToolsWarned = false
  let startupLogged = false
  /** Set in configResolved: running `vite build` with `production`, and Vite DevTools can show the panel */
  let building = false

  return {
    name: 'orpc-inspector',
    apply: (_config, env) => env.command === 'serve' || options.production === true,
    config(userConfig, env) {
      devToolsEnabled = isDevToolsOptionEnabled((userConfig as { devtools?: unknown }).devtools)
      // Imported by both page and panel; pre-bundle so first opening the panel does not trigger a re-optimize reload
      const include = ['orpc-inspector > devframe/in-page-channel']
      if (options.zodLocale !== undefined) {
        const result = resolveZodLocale(options.zodLocale, resolve(userConfig.root ?? process.cwd()))
        if ('specifier' in result) {
          localeSpecifier = result.specifier
          include.push(...zodOptimizeDeps(localeSpecifier))
        }
        else {
          warning = result.warning
        }
      }
      // Dev SSR: an installed package is externalized (resolved with externalConditions, so the no-op) before resolveId runs;
      // keeping it in Vite's graph lets resolveId give the SSR entry the real recorder. Vite merges this with the user's list.
      // A dev server lets a noExternal match win even over `external: true`, so leave the user's external choice alone
      const takeOverSsr = env.command === 'serve' && !options.nuxt
        && !keptExternal(userConfig.ssr?.external) && !keptExternal(userConfig.environments?.ssr?.resolve?.external)
      return {
        optimizeDeps: { include },
        ...(takeOverSsr && {
          ssr: {
            noExternal: [PACKAGE_NAME],
          },
        }),
      }
    },
    configResolved(config) {
      base = withTrailingSlash(config.base)
      if (warning && !warned) {
        warned = true
        config.logger.warn(`[orpc-inspector] ${warning}`)
      }
      if (config.command !== 'build') {
        if (!options.skipDevToolsWarning && !devToolsWarned && !config.plugins.some(p => p.name === DEVTOOLS_SERVER_PLUGIN)) {
          devToolsWarned = true
          config.logger.warn(devToolsMissingWarning(devToolsEnabled))
        }
        return
      }
      building = true
      if (options.nuxt)
        return
      const names = new Set(config.plugins.map(plugin => plugin.name))
      // A separate SSR build reads the same config, so only the client build warns
      const clientBuild = !config.build.ssr
      if (!names.has(DEVTOOLS_BUILD_PLUGIN)) {
        building = false
        if (clientBuild)
          config.logger.warn('[orpc-inspector] production: true needs Vite DevTools with build.withApp; the inspector is left out of this build')
        return
      }
      if (clientBuild && !names.has(DEVTOOLS_INJECTION_PLUGIN))
        config.logger.warn(`[orpc-inspector] Vite DevTools build.injection is off, so the dock is not injected into the app; load ${base}__devtools/embedded.js yourself`)
    },
    resolveId: {
      // Before Vite's resolver, so the bare package id (otherwise the no-op, or externalized in SSR) gets the real recorder:
      // in builds with production, and in the dev server's SSR entry
      order: 'pre',
      handler(id, _importer, resolveOptions) {
        if (id === CLIENT_MODULE_ID)
          return RESOLVED_CLIENT_MODULE_ID
        if (id === TRANSLATOR_MODULE_ID && localeSpecifier)
          return RESOLVED_TRANSLATOR_MODULE_ID
        if (id !== PACKAGE_NAME)
          return
        if (building) {
          return resolveOptions?.ssr
            ? RESOLVED_SSR_RECORDER_MODULE_ID
            : RESOLVED_RECORDER_MODULE_ID
        }
        const environment = this.environment
        if (environment?.config.command === 'serve' && environment.name === 'ssr' && !options.nuxt && !keptExternal(environment.config.resolve.external))
          return RESOLVED_SSR_RECORDER_MODULE_ID
      },
    },
    load(id) {
      if (id === RESOLVED_RECORDER_MODULE_ID || id === RESOLVED_SSR_RECORDER_MODULE_ID) {
        return recorderModule(id === RESOLVED_SSR_RECORDER_MODULE_ID)
      }
      if (id === RESOLVED_CLIENT_MODULE_ID) {
        return localeSpecifier
          ? `import '${TRANSLATOR_MODULE_ID}'\nimport 'orpc-inspector/client'`
          : `import 'orpc-inspector/client'`
      }
      if (id === RESOLVED_TRANSLATOR_MODULE_ID && localeSpecifier) {
        return translatorModule(localeSpecifier)
      }
    },
    transformIndexHtml: {
      // Pre, so in builds Vite still processes the inline module below and bundles the page script
      order: 'pre',
      handler(_html, ctx) {
        if (ctx.server) {
          // Pre-order tags still go through Vite's URL rewrite, which adds base
          return [
            {
              tag: 'script',
              attrs: { type: 'module', src: `/@id/${CLIENT_MODULE_ID}` },
              injectTo: 'head',
            },
          ]
        }
        if (!building || options.nuxt)
          return
        // Inline, so Vite bundles the page script into the app
        return [
          {
            tag: 'script',
            attrs: { type: 'module' },
            children: `import '${CLIENT_MODULE_ID}'`,
            injectTo: 'head',
          },
        ]
      },
    },
    async writeBundle(outputOptions) {
      if (!building || options.nuxt || this.environment?.config.consumer === 'server' || !outputOptions.dir)
        return
      await copyPanel(panelDir, outputOptions.dir)
    },
    configureServer(server) {
      if (!options.skipStartupLine) {
        const logStartup = () => {
          if (startupLogged)
            return
          const local = server.resolvedUrls?.local[0]
          const address = server.httpServer?.address()
          const origin = local
            ? new URL(local).origin
            : typeof address === 'object' && address
              ? `${server.config.server.https ? 'https' : 'http'}://localhost:${address.port}`
              : undefined
          if (!origin)
            return
          startupLogged = true
          server.config.logger.info(startupLine(`${origin}${panelRoute()}`))
        }
        // After Vite's own URL list; if nothing calls printUrls, fall back to once the server listens
        const printUrls = server.printUrls.bind(server)
        server.printUrls = () => {
          printUrls()
          logStartup()
        }
        server.httpServer?.once('listening', () => {
          setTimeout(logStartup, 0).unref?.()
        })
      }
      // No return, so it runs before Vite's built-in middleware (base, SPA fallback) and sees the full URL
      server.middlewares.use(panelMiddleware(panelDir, panelRoute))
    },
    devtools: {
      setup(ctx) {
        if (ctx.docks.views.has(ORPC_INSPECTOR_DOCK_ID))
          return
        ctx.docks.register({
          id: ORPC_INSPECTOR_DOCK_ID,
          title: 'oRPC',
          icon: ICON,
          category: 'app',
          // Order early so it isn't pushed into the dock's overflow menu
          defaultOrder: 100,
          type: 'iframe',
          url: panelRoute(),
        })
      },
    },
  }
}

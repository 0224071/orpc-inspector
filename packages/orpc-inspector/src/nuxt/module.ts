import type { Nuxt, NuxtModule } from '@nuxt/schema'
import type { PluginOption } from 'vite'
import { pathToFileURL } from 'node:url'
import { addImports, addPlugin, addTemplate, addVitePlugin, createResolver, defineNuxtModule, extendViteConfig, tryResolveModule, useLogger } from '@nuxt/kit'
import { startupLine } from '../vite/onboarding'
import { defaultPanelDir } from '../vite/panel-files'
import { createOrpcInspectorPlugin, DEVTOOLS_BUILD_PLUGIN } from '../vite/plugin'
import { appendOrpcClientDeps, checkNuxtDevTools, isNuxtDevToolsEnabled, nuxtPanelUrl, readNuxtDevToolsVersion } from './onboarding'

export interface OrpcInspectorModuleOptions {
  /** zod locale used to translate zod's default issue messages shown in the panel, e.g. `zh-TW`; resolved from the project's zod */
  zodLocale?: string
  /**
   * Include the inspector in `nuxt build`; exposes call data to anyone who can load the page, see README "Production builds".
   * Needs `@vitejs/devtools` installed in the project
   */
  production?: boolean
}

/** Where the hub lands in the client output and where it is served; `.nuxt/dist/client/__devtools` is what Vite DevTools 0.8 writes */
const HUB_DIRNAME = '__devtools'

type ResolvedModule = ReturnType<typeof createResolver>['resolve']

/** Same runtime as dev: real composable, SSR collector into the payload, page script and hydration */
function addRuntime(nuxt: Nuxt, resolve: ResolvedModule) {
  // Runtime files import #app, so Nuxt must compile them
  nuxt.options.build.transpile.push(resolve('./runtime'))
  addImports({
    name: 'useOrpcInspectorPlugin',
    from: resolve('./runtime/composables'),
  })
  addPlugin({
    src: resolve('./runtime/plugin.server'),
    mode: 'server',
  })
  addPlugin({
    src: resolve('./runtime/plugin.client'),
    mode: 'client',
  })
}

/** Production default: the no-op is generated into buildDir from a template so the output has no trace of the package path, not even in comments */
function addNoop(resolve: ResolvedModule) {
  const noop = addTemplate({
    filename: 'orpc-link-noop.mjs',
    getContents: () => 'export function useOrpcInspectorPlugin() {\n  return { init() {} }\n}\n',
  })
  // Types come from runtime/noop
  addTemplate({
    filename: 'orpc-link-noop.d.ts',
    getContents: () => `export { useOrpcInspectorPlugin } from ${JSON.stringify(resolve('./runtime/noop'))}\n`,
  })
  addImports({
    name: 'useOrpcInspectorPlugin',
    from: noop.dst.replace(/\.mjs$/, ''),
  })
}

/** Whether a (possibly nested or async) Vite plugin list already has a plugin with this name */
async function hasPlugin(plugins: PluginOption[] | undefined, name: string): Promise<boolean> {
  for (const option of plugins ?? []) {
    const plugin = await option
    if (Array.isArray(plugin)
      ? await hasPlugin(plugin, name)
      : plugin && 'name' in plugin && plugin.name === name) {
      return true
    }
  }
  return false
}

function withSlashes(path: string) {
  return `/${path.replace(/^\/+|\/+$/g, '')}/`.replace(/^\/\/$/, '/')
}

/**
 * `nuxt build` with `production`: Nuxt DevTools v4 skips Vite DevTools in build, and Nuxt pages do not go through transformIndexHtml,
 * so the module adds the Vite DevTools build itself, serves the hub and panel through Nitro and loads the dock from a client plugin
 */
function setupProduction(nuxt: Nuxt, options: OrpcInspectorModuleOptions, resolve: ResolvedModule, devtoolsEntry: string) {
  addRuntime(nuxt, resolve)
  // Client and server builds: the recorder redirect (and the dock in the client build)
  addVitePlugin(createOrpcInspectorPlugin({
    panelBase: nuxt.options.app.baseURL,
    zodLocale: options.zodLocale,
    production: true,
    nuxt: true,
  }))

  let devtoolsPresent = false
  // Registered before addVitePlugin's own vite:extend hook below, so the check runs first
  nuxt.hook('vite:extend', async ({ config }) => {
    devtoolsPresent = await hasPlugin(config.plugins, DEVTOOLS_BUILD_PLUGIN)
  })
  addVitePlugin(async () => {
    if (devtoolsPresent)
      return []
    const { DevTools } = await import(/* @vite-ignore */ pathToFileURL(devtoolsEntry).href) as typeof import('@vitejs/devtools')
    // No built-in docks: their pages are served at the site root, which Nitro does not serve, and they show nothing in a static deploy
    return DevTools({
      builtinDevTools: false,
      build: { withApp: true },
    })
  }, { server: false })

  // Nitro serves only dist/client/<buildAssetsDir>; the hub and the panel need their own public assets
  nuxt.hook('nitro:config', (nitroConfig) => {
    // Nitro's types are not installed with the package; only publicAssets is used
    const config = nitroConfig as { publicAssets?: { dir: string, baseURL?: string, maxAge?: number }[] }
    config.publicAssets ??= []
    config.publicAssets.push(
      {
        dir: `${nuxt.options.buildDir}/dist/client/${HUB_DIRNAME}`,
        baseURL: `${withSlashes(nuxt.options.app.buildAssetsDir)}${HUB_DIRNAME}`,
        maxAge: 0,
      },
      // Vite DevTools 0.8 links its branding icons at the site root, so they only load when app.baseURL is /
      {
        dir: `${nuxt.options.buildDir}/dist/client/__devtools-assets`,
        baseURL: '/__devtools-assets',
        maxAge: 0,
      },
      {
        dir: defaultPanelDir(),
        baseURL: '/__orpc-inspector',
        maxAge: 0,
      },
    )
  })

  addPlugin({
    src: resolve('./runtime/plugin.devtools.client'),
    mode: 'client',
  })
}

/**
 * Nuxt module: in dev, injects the page script, serves the panel page and registers the Vite DevTools dock;
 * SSR records reach the client via the payload. In production only a no-op `useOrpcInspectorPlugin()` remains,
 * unless `production` is on.
 */
const module: NuxtModule<OrpcInspectorModuleOptions> = defineNuxtModule<OrpcInspectorModuleOptions>({
  meta: {
    name: 'orpc-inspector',
    configKey: 'orpcInspector',
  },
  async setup(options, nuxt) {
    const { resolve } = createResolver(import.meta.url)

    if (!nuxt.options.dev) {
      if (options.production) {
        const devtoolsEntry = await tryResolveModule('@vitejs/devtools', pathToFileURL(`${nuxt.options.rootDir}/`))
        if (devtoolsEntry) {
          setupProduction(nuxt, options, resolve, devtoolsEntry)
          return
        }
        useLogger('orpc-inspector').warn('production: true needs @vitejs/devtools installed in the project; the inspector is left out of this build')
      }
      addNoop(resolve)
      return
    }

    addRuntime(nuxt, resolve)

    const logger = useLogger()
    const devtools = checkNuxtDevTools(isNuxtDevToolsEnabled(nuxt.options.devtools), readNuxtDevToolsVersion(nuxt.options.rootDir))
    if (devtools.warning)
      logger.warn(devtools.warning)

    let includeWarned = false
    extendViteConfig((config) => {
      const warning = appendOrpcClientDeps(config)
      if (warning && !includeWarned) {
        includeWarned = true
        logger.warn(warning)
      }
    })

    // Vite's port is internal to Nuxt, so print the line with the origin the user opens
    let startupLogged = false
    nuxt.hook('listen', (_server, listener: { url?: string } | undefined) => {
      if (startupLogged || !listener?.url)
        return
      startupLogged = true
      logger.info(startupLine(nuxtPanelUrl(listener.url, nuxt.options.app.baseURL)))
    })

    // Nuxt's Vite base is buildAssetsDir (/_nuxt/), so the panel page is mounted under app.baseURL instead
    addVitePlugin(createOrpcInspectorPlugin({
      panelBase: nuxt.options.app.baseURL,
      zodLocale: options.zodLocale,
      skipDevToolsWarning: devtools.warned,
      skipStartupLine: true,
      // Nuxt's dev SSR resolves the recorder itself; the plugin's config hook would otherwise reach its ssr environment too
      nuxt: true,
    }), { server: false })
  },
})

export default module

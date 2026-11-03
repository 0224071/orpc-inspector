# SSR

English | [繁體中文](./ssr.zh-TW.md)

Calls made during server-side rendering show in the panel with side `ssr`. Only completed calls are sent.

SSR records are written into the page HTML. Sensitive headers are replaced with `***`, but inputs, outputs and URLs are not masked.

## Nuxt

Nothing to set up. Create the link inside a Nuxt plugin or `setup` (as in the [README](../../README.md#nuxt)), so each request gets its own link.

## Vite without Nuxt

1. In `entry-server.ts`, create one collector per request and let the client find it:

   ```ts
   import { AsyncLocalStorage } from 'node:async_hooks'
   import { OrpcInspectorCollector, renderOrpcInspectorScript, setCollectorResolver } from 'orpc-inspector'

   const requestCollector = new AsyncLocalStorage<OrpcInspectorCollector>()
   setCollectorResolver(() => requestCollector.getStore())

   export async function render(url: string) {
     const collector = new OrpcInspectorCollector()
     // renderApp: your existing SSR render, e.g. renderToString(app)
     const appHtml = await requestCollector.run(collector, () => renderApp(url))
     return {
       appHtml,
       head: renderOrpcInspectorScript(collector),
     }
   }
   ```

2. Put `head` in `<head>`, before the page script.
3. On the client, add `new OrpcInspectorPlugin()` to the link as usual. The page script from `orpc-inspector/vite` merges the SSR records; you do not call `hydrateOrpcInspector()`.

To skip the resolver, pass the collector directly: `new OrpcInspectorPlugin({ collector })`.

### Where the server entry is loaded

With `orpcInspector()` in the Vite config, an SSR entry loaded through Vite (`vite.ssrLoadModule()` on a Vite dev server, as in step 1) gets the recorder without extra settings: no `ssr.resolve.externalConditions` and no Node flags. The plugin keeps `orpc-inspector` in Vite's SSR module graph on the dev server; it does not change how other packages resolve.

If you list `orpc-inspector` in `ssr.external` or set `ssr.external: true`, the plugin leaves it external, and Node's own conditions decide what it gets.

A server that imports `orpc-inspector` directly with plain `node`, outside Vite's module graph, still gets the no-op. The plugin cannot see that import, so run that server with the development condition:

```sh
node --conditions=development server.js
```

See also [Troubleshooting](./troubleshooting.md#calls-are-missing). Both apply to development; to keep SSR recording in a build, see [Production builds](./production.md#vite).

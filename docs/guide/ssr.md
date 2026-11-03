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

## Good to know

- Load the SSR entry through Vite (`vite.ssrLoadModule()`, as in step 1) and recording works with no extra settings.
- If `orpc-inspector` is in `ssr.external`, or `ssr.external` is `true`, Node's own conditions decide what it gets.
- A server that imports `orpc-inspector` with plain `node`, outside Vite, gets the no-op. Run it with `node --conditions=development server.js`.

See also [Troubleshooting](./troubleshooting.md#calls-are-missing). All of this applies to development; to keep SSR recording in a build, see [Production builds](./production.md#vite).

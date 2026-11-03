# Production builds

English | [繁體中文](./production.zh-TW.md)

Set `production: true` to keep the inspector in a preview or staging build. Off by default: production builds get a no-op. Decided at build time; there is no runtime switch.

> [!WARNING]
> Anyone who can load the page can open the panel and read every recorded call: inputs, outputs, errors, URLs and headers. SSR records are written into the page HTML. Use this only for non-public or test deploys. The Vite DevTools hub that hosts the dock also publishes its own build data.

## Vite

1. Turn on Vite DevTools in the build, and the option:

   ```ts
   import vue from '@vitejs/plugin-vue'
   import { orpcInspector } from 'orpc-inspector/vite'
   import { defineConfig } from 'vite'

   export default defineConfig({
     devtools: {
       build: { withApp: true, injection: true },
     },
     plugins: [
       vue(),
       orpcInspector({ production: true }),
     ],
   })
   ```

2. Run `vite build` and deploy the whole `outDir`. It contains the panel (`__orpc-inspector/`) and the DevTools hub (`__devtools/`).

- `vite build` does not exit with Vite's `devtools` option. To make it exit, drop `devtools` and use the plugin: `plugins: [DevTools({ build: { withApp: true, injection: true } }), orpcInspector({ production: true })]` (`DevTools` from `@vitejs/devtools`).
- SSR: use the option in the config for both the client and the server build. `renderOrpcInspectorScript()` then works as in [SSR](./ssr.md#vite-without-nuxt).

## Nuxt

1. Install Vite DevTools:

   ```sh
   pnpm add -D @vitejs/devtools@^0.8.0
   ```

2. Turn on the option:

   ```ts
   export default defineNuxtConfig({
     modules: ['orpc-inspector/nuxt'],
     orpcInspector: {
       production: true,
     },
   })
   ```

3. Run `nuxt build`. Nitro serves the panel at `<app.baseURL>__orpc-inspector/` and the hub at `<app.baseURL><buildAssetsDir>__devtools/`.

To build with and without the inspector from one config, use an environment: `$env: { staging: { orpcInspector: { production: true } } }`, then `nuxt build --envName staging`.

## What an opted-in build records

- Client and SSR calls, as in dev. `zodLocale` applies.
- Sensitive headers (`authorization`, `cookie` and similar, also inside error data) are replaced with `***` when recorded, for client calls too. The original is not kept, so the panel cannot reveal it. In dev, client headers are only hidden in the panel and can be revealed.
- Inputs, outputs and error bodies are **not** masked.

See also [Troubleshooting](./troubleshooting.md#production-build).

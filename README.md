<p align="center">
  <a href="https://github.com/0224071/orpc-inspector/actions/workflows/ci.yml"><img src="https://github.com/0224071/orpc-inspector/actions/workflows/ci.yml/badge.svg" alt="CI status"></a>
  <a href="./LICENSE"><img src="https://badgen.net/badge/license/MIT/blue" alt="MIT license"></a>
</p>

# orpc-inspector

> DevTools panel for [oRPC](https://orpc.dev) calls

English | [繁體中文](./README.zh-TW.md)

See every oRPC call your app makes (input, output, errors, validation issues, headers) in a DevTools panel.

<img src="./docs/images/demo-en.gif" width="800" alt="Demo: copy failed calls as one report with a click, then paste it into GitHub, Discord or LINE">

## Quick start

| | Vite app | Nuxt app |
|---|---|---|
| Framework | Vite 8.3+ | Nuxt 4.6+ |
| DevTools | `@vitejs/devtools` 0.8 | Nuxt DevTools v4 (v3 has no dock) |
| oRPC | `@orpc/client` and `@orpc/contract` 1.16+ (1.x) | same |

The inspector watches the client only. The backend can be an oRPC server or any REST API through [`OpenAPILink`](https://orpc.dev/docs/openapi/client/openapi-link).

### Vite (Vue / React / other frameworks)

1. Install:

   ```sh
   pnpm add @orpc/client@^1.16.0 @orpc/contract@^1.16.0
   pnpm add -D orpc-inspector @vitejs/devtools@^0.8.0 vite@^8.3.0
   ```

2. Turn on DevTools and add `orpcInspector()` in `vite.config.ts`:

   ```ts
   import vue from '@vitejs/plugin-vue' // or react(), …
   import { orpcInspector } from 'orpc-inspector/vite'
   import { defineConfig } from 'vite'

   export default defineConfig({
     devtools: true,
     plugins: [
       vue(),
       orpcInspector(),
     ],
   })
   ```

3. Add `OrpcInspectorPlugin` to your oRPC link:

   ```ts
   import { createORPCClient } from '@orpc/client'
   import { RPCLink } from '@orpc/client/fetch'
   import { OrpcInspectorPlugin } from 'orpc-inspector'

   const link = new RPCLink({
     url: `${location.origin}/rpc`,
     plugins: [
       new OrpcInspectorPlugin(),
     ],
   })

   export const client = createORPCClient(link)
   ```

Run `vite` and open **oRPC** in the DevTools dock. The first time, enter the auth code the dev server prints ([why](https://devtools.vite.dev/errors/dtk0013)).

### Nuxt

1. Install:

   ```sh
   pnpm add @orpc/client@^1.16.0 @orpc/contract@^1.16.0
   pnpm add -D orpc-inspector @nuxt/devtools@4 @nuxt/kit@^4.6.0
   ```

2. Add the module in `nuxt.config.ts`:

   ```ts
   export default defineNuxtConfig({
     devtools: { enabled: true },
     modules: ['orpc-inspector/nuxt'],
   })
   ```

3. Add the auto-imported `useOrpcInspectorPlugin()` to your link. Create the link inside a Nuxt plugin, so SSR calls are recorded per request:

   ```ts
   // app/plugins/orpc.ts
   import { createORPCClient } from '@orpc/client'
   import { RPCLink } from '@orpc/client/fetch'

   export default defineNuxtPlugin(() => {
     const link = new RPCLink({
       url: `${useRequestURL().origin}/rpc`,
       plugins: [
         useOrpcInspectorPlugin(),
       ],
     })
     return {
       provide: {
         client: createORPCClient(link),
       },
     }
   })
   ```

Run `nuxt dev` and open **oRPC** in the DevTools dock. The first time, enter the auth code the dev server prints ([why](https://nuxt.com/modules/devtools/upgrading-to-v4)).

## Features

- 🔍 **Every call in one place**: input, output, errors, [validation issues](./docs/guide/validation.md) and headers, from the client and [SSR](./docs/guide/ssr.md)
- 🛠️ **In the DevTools dock**: Vite DevTools for Vue, React and other Vite apps; Nuxt DevTools v4 for Nuxt
- 🌐 **Readable errors**: [zod messages in your language](./docs/guide/zod-locale.md), [error reports](./docs/guide/error-reports.md) for Markdown, Discord or LINE
- 🔒 **Sensitive headers masked**: `authorization`, `cookie` and similar headers are hidden in the panel and in copied reports
- 📦 **Zero cost in production**: production builds get a no-op unless you [opt in](./docs/guide/production.md)

## Panel not showing?

Open the panel from the DevTools dock, not from its URL in a new tab. For other causes, see [Troubleshooting](./docs/guide/troubleshooting.md).

## Guides

| I want to… | Guide |
|---|---|
| Understand how the pieces fit together | [How it works](./docs/guide/how-it-works.md) |
| See which fields failed validation | [Validation issues](./docs/guide/validation.md) |
| Use interceptors, batching or `OpenAPILink` | [Link integration](./docs/guide/link.md) |
| Record SSR calls without Nuxt | [SSR](./docs/guide/ssr.md) |
| Show zod messages in my language | [Translating zod messages](./docs/guide/zod-locale.md) |
| Paste failures into an issue or chat | [Copying error reports](./docs/guide/error-reports.md) |
| Keep the inspector on a staging deploy | [Production builds](./docs/guide/production.md) |
| Fix a panel that does not open or misses calls | [Troubleshooting](./docs/guide/troubleshooting.md) |

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). Changes are planned with [OpenSpec](https://github.com/Fission-AI/OpenSpec) in `openspec/`.

## License

[MIT](./LICENSE)

# Translating zod messages

English | [繁體中文](./zod-locale.zh-TW.md)

Set `zodLocale` to show zod's default validation messages in your language.

## Set up

Vite, in `vite.config.ts`:

```ts
orpcInspector({ zodLocale: 'zh-TW' })
```

Nuxt, in `nuxt.config.ts`:

```ts
export default defineNuxtConfig({
  modules: ['orpc-inspector/nuxt'],
  orpcInspector: {
    zodLocale: 'zh-TW',
  },
})
```

Any locale in your zod 4's `zod/v4/locales/` works.

## What gets translated

- **Translated**: zod's default messages from client validation (`RequestValidationPlugin` / `ResponseValidationPlugin`) and server input validation (400 `BAD_REQUEST`), including SSR calls.
- **Not translated**: messages you wrote yourself (schema, check or global `customError`). Server messages count as default only if they equal zod's English message or your app's zod locale message.
- **Unchanged**: recorded data, and the errors your app gets from zod. The panel only changes what it displays; the original message is in its tooltip.
- Server input failures are listed under **Invalid**, marked as rejected by the server.
- `zodLocale` is separate from the panel language (Settings → Display → Language).

Copied reports can use the original or translated messages: see [Copying error reports](./error-reports.md). See also [Troubleshooting](./troubleshooting.md#zod-messages-are-not-translated).

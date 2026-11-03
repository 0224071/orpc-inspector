# Troubleshooting

English | [繁體中文](./troubleshooting.zh-TW.md)

## Panel does not open

| Symptom | Cause | Fix |
|---|---|---|
| No oRPC entry in the dock; dev server logs one warning | Vite DevTools is missing, or Nuxt DevTools is v3 or disabled | Vite: install `@vitejs/devtools` and set `devtools: true`. Nuxt: install `@nuxt/devtools@4` and set `devtools: { enabled: true }` |
| Panel URL (`<base>__orpc-inspector/`) shows a disconnected screen | The URL is the page the dock loads; it does not work in its own tab | Open the panel from the DevTools dock |
| Warning says Vite DevTools failed to load | Vite DevTools threw while loading; its error is logged above the warning | Fix that error; check that `@vitejs/devtools` is `^0.8.0` |
| No `[orpc-inspector]` line in the dev server log | The plugin or module is not registered | Vite: add `orpcInspector()` to `plugins`. Nuxt: add `'orpc-inspector/nuxt'` to `modules` |

## Calls are missing

| Symptom | Cause | Fix |
|---|---|---|
| No calls at all | `OrpcInspectorPlugin` is not on the link | Add it to the link's `plugins` ([Vite](../../README.md#vite-vue--react--other-frameworks), [Nuxt](../../README.md#nuxt)) |
| No SSR calls in a hand-written SSR server | The server imports `orpc-inspector` with plain `node`, outside Vite, so it gets the no-op; or `ssr.external` keeps it external | Load the SSR entry through Vite with `orpcInspector()` in the config, or run with `node --conditions=development` ([SSR](./ssr.md#good-to-know)) |
| No SSR calls in Nuxt | Link is created once and shared across requests | Create the link inside a Nuxt plugin or `setup`, per request |
| A batch request is not shown | `BatchLinkPlugin` is used | Expected: the panel shows each procedure request, not the combined batch |

## Nuxt dev reloads on first load

| Symptom | Cause | Fix |
|---|---|---|
| The page reloads once on the first load in `nuxt dev` | `@orpc/client`, `@orpc/client/fetch` or `@orpc/contract` is in `vite.optimizeDeps.exclude`. The module adds these three to `optimizeDeps.include`, except ids you excluded | Remove them from `optimizeDeps.exclude` ([Vite: dependency pre-bundling](https://vite.dev/guide/dep-pre-bundling)) |

## zod messages are not translated

| Symptom | Cause | Fix |
|---|---|---|
| Dev server warns about `zodLocale` | zod 4 is not installed, or the locale name does not exist | Install zod 4; use a name from `zod/v4/locales/` |
| Some messages stay in English | They are custom messages, zod 3 schemas, non-zod schemas, or values changed by serialization (dates, bigints) | Expected: only zod 4 default messages are translated |
| A server 500 validation error shows no issues | Output validation failures carry no issues | Expected: it stays a plain error ([oRPC: validation errors](https://orpc.dev/docs/advanced/validation-errors)) |

## Production build

| Symptom | Cause | Fix |
|---|---|---|
| Warning, and the build has no inspector | Vite DevTools is not in the build | Add `devtools: { build: { withApp: true, injection: true } }` |
| Warning, and no dock on the page | `build.injection` is off | Turn it on, or load `<base>__devtools/embedded.js` yourself |
| `vite build` does not exit | Vite's `devtools` option starts the DevTools server after building | Use the `DevTools()` plugin from `@vitejs/devtools` instead ([Production builds](./production.md#vite)) |
| Nuxt: warning, and the build is a no-op | `@vitejs/devtools` cannot be resolved | `pnpm add -D @vitejs/devtools@^0.8.0` |
| Nuxt: broken logo in the dock | Non-root `app.baseURL`; Vite DevTools loads its logo from `/` | Known limitation ([vitejs/devtools#583](https://github.com/vitejs/devtools/issues/583)); the dock still works |

# Proposal

## Why

oRPC v2 is in beta (`2.0.0-beta.51` on the `beta` dist-tag) and its maintainers are collecting feedback before going stable. Against v2 the inspector breaks: `new RPCLink({ plugins: [new OrpcInspectorPlugin()] })` throws at construction, because a v2 link plugin's `init` must return the new link options instead of mutating them. The peer ranges also reject v2, and errors lose their HTTP status because `ORPCError.status` no longer exists. Shipping v2 support before v2 goes stable means users who upgrade oRPC get a working inspector instead of a crash.

## What Changes

- New package entry `orpc-inspector/v2` for oRPC v2 links. It exports `OrpcInspectorPlugin` and `createOrpcInspectorInterceptors` with the v2 plugin contract (`name`/`after` ordering, `init` returns new options without mutating the caller's object, `transportInterceptors`), and re-exports the major-independent API (collector, SSR helpers, types) so v2 users change only the import path.
- The root entry `orpc-inspector` stays the oRPC 1.x entry, with no API change.
- Production no-op for the v2 entry (`dist/v2.prod.js`), selected by the same `development` export condition as the root entry.
- The Vite plugin and Nuxt module give `orpc-inspector/v2` the real recorder in the same places they do for `orpc-inspector` (Vite dev server SSR, production opt-in builds).
- Error classification reads what both majors provide: HTTP status from `error.status` (v1) or from the response kept on the error's cause (v2); v2's `MalformedResponseError` is recorded with its status and masked response headers; an oRPC error caused by a validation error counts as an input failure only for `BAD_REQUEST`, otherwise as an output failure (v2's response validation plugin throws `INTERNAL_SERVER_ERROR` with a validation cause).
- The transport recorder accepts the path-only request URL v2 hands to transport interceptors.
- Nuxt: `useOrpcInspectorPlugin()` picks the v1 or v2 plugin from the major of `@orpc/client` installed in the project. The production no-op composable returns a plugin that works with both majors (today it returns `undefined` from `init`, which crashes a v2 link).
- Peer ranges for `@orpc/client` and `@orpc/contract` become `^1.16.0 || ^2.0.0-beta.51`.
- Tests run against both majors, with v2 installed through pnpm aliases in devDependencies.
- README and `docs/guide/` (English and Traditional Chinese) explain which entry to import.

Out of scope: a v2 playground, support for v2 plugins that need knowledge of the inspector beyond ordering, and changes to header masking or the panel.

### If v2 renames things again before stable

The v2-specific surface is kept to `src/orpc-v2/` plus a few tolerant reads in the shared core. Each rename maps to one place:

| v2 change | Where to edit |
|---|---|
| `transportInterceptors` / `interceptors` option names | `src/orpc-v2/index.ts` |
| Plugin contract (`init` return value, `name`/`before`/`after`) | `src/orpc-v2/index.ts` |
| Built-in plugin names the inspector orders after | `ORPC_V2_BUILT_IN_PLUGINS` in `src/orpc-v2/types.ts` |
| Where the response status sits on an error (`cause.response.status`) | `errorStatus()` in `src/core/classify-error.ts` |
| `ValidationError.invalidData`, `MalformedResponseError.response` | `src/core/classify-error.ts` |
| Transport request shape (`request.url`, `request.headers`) | `recordTransport` in `src/core/recorder.ts` |
| Validation error codes used by the client validation plugins | `classifyError` in `src/core/classify-error.ts` |

The v2 test suite pins one beta; moving to a new beta is a devDependency bump plus whatever the table above points to.

## Capabilities

### New Capabilities
- `orpc-v2-link`: recording calls made through oRPC v2 links via the `orpc-inspector/v2` entry: plugin contract and ordering, manual interceptors, v2 error and transport shapes, peer ranges, and the production no-op of the v2 entry.

### Modified Capabilities
- `call-recording`: error classification no longer treats every oRPC error caused by a validation error as an input failure; only `BAD_REQUEST` counts as input, other codes count as output.
- `ssr-transfer`: the Vite dev server SSR takeover covers `orpc-inspector/v2` as well as the root specifier.
- `nuxt-integration`: `useOrpcInspectorPlugin()` picks the plugin for the installed oRPC major, and the production no-op link plugin works with both majors (new requirements).

## Impact

- Code: new `src/orpc-v2/`, `src/v2.ts`, `src/v2.prod.ts`; `src/core/classify-error.ts`, `src/core/recorder.ts` (request URL type only), `src/vite/plugin.ts` and `src/vite/recorder-entry.ts` (redirect the `/v2` specifier), `src/nuxt/module.ts` and `src/nuxt/runtime/` (major detection, v2 composable, no-op).
- Package: new `./v2` export; `tsdown.config.ts` entries; peer ranges; devDependency aliases `@orpc/client-v2`, `@orpc/contract-v2`, `@orpc/server-v2` (plus OpenAPI if published for v2) pinned to `2.0.0-beta.51`.
- Tests: new `test/orpc-v2/` run in a Vitest project that resolves `@orpc/*` to the v2 aliases.
- Docs: README, README.zh-TW, `docs/guide/` in both languages.
- Users on oRPC 1.x see no change.

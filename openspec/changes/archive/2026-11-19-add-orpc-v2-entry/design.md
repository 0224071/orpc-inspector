# Design

## Context

The recorder core (`src/core/`) already sits behind a thin oRPC 1.x adapter (`src/orpc-v1/`): `createCallRecorder()` returns `record` (call-level interceptor) and `recordTransport` (transport-level interceptor), and the adapter wires them into a link. What changes in oRPC v2 `2.0.0-beta.51`, checked against the published packages:

| Area | v1 | v2 beta.51 |
|---|---|---|
| Plugin `init` | mutates options, return ignored | must return new options |
| Plugin ordering | numeric `order` | `name` plus `before` / `after` name lists, stable topological sort |
| Transport interceptor option | `clientInterceptors` | `transportInterceptors` |
| `request.url` at transport level | `URL` with origin | string, path plus query (origin is a transport option) |
| HTTP status on `ORPCError` | `error.status` | none; decoded errors carry `cause: ResponseError` with `response.status/headers/body` |
| Non-oRPC error response | `ORPCError` with `data: { status, headers, body }` | `MalformedResponseError` with `response` |
| Client response validation | throws `ValidationError` | throws `ORPCError('INTERNAL_SERVER_ERROR', { cause: ValidationError })` |
| Client request validation | `ORPCError('BAD_REQUEST', { cause: ValidationError })` | same |
| `ValidationError` raw data | `data` | `invalidData` |
| `ORPCError` instanceof registry | per-version global symbol | one unversioned global set |

In an app only one major of `@orpc/client` resolves from a given module, and the built package keeps `@orpc/*` external, so a bare `import { ORPCError } from '@orpc/client'` in the core always gets the major the app uses.

## Goals / Non-Goals

**Goals:**
- v2-specific code lives in `src/orpc-v2/` and is small enough to rewrite when the beta changes.
- The core stays shared: one recorder, one store, one collector, one panel, for both majors.
- Both majors are tested in CI from one install.

**Non-Goals:**
- Supporting both majors inside one app at the same time.
- Detecting the major at runtime inside one entry (the user chose separate entries).
- A v2 playground.

## Decisions

### 1. One tolerant error classifier in the core, not one per major

`classifyError` stays in `src/core/classify-error.ts` and reads both shapes:
- status: `error.status` if it is a number, otherwise `error.cause.response.status` if present (`errorStatus()`);
- validation error raw data: `invalidData` if present, otherwise `data`;
- an `ORPCError` whose cause is a `ValidationError`: input when the code is `BAD_REQUEST`, otherwise output (covers v1 request validation, v2 request validation and v2 response validation; v1 response validation still throws `ValidationError` directly);
- an `Error` with a `response` object holding a numeric `status` (v2 `MalformedResponseError`): state `error`, status from the response, data = `{ status, headers, body }` with headers masked like v1's error data.

Alternative: a classifier per major injected into `createCallRecorder`. Rejected: it duplicates ~100 lines whose only differences are four property reads, and it touches `recorder.ts`, which another branch is changing. The one behavior change for v1 (a non-`BAD_REQUEST` oRPC error with a validation cause becomes output instead of input) does not occur with v1's built-in plugins, and the `call-recording` delta records it.

### 2. Structural types for the v2 entry

`src/orpc-v2/` imports no types from `@orpc/*`. The repo type-checks against v1, and the published `v2.d.ts` must not point at the test aliases. The plugin declares `name`, `after: string[]` and a generic `init<O extends LinkOptionsLike>(options: O): O`; the interceptors are the recorder's generic `record` / `recordTransport`. A type test (`test/orpc-v2/types.test.ts`) assigns them to the real v2 `RPCLink` options imported from the `@orpc/client-v2` alias, so a type rename in v2 fails the typecheck.

Alternative: import v2 types through a path mapping. Rejected: one tsconfig cannot map `@orpc/client` to v1 for some files and v2 for others, and the emitted declarations would reference the alias.

### 3. Ordering: `after` oRPC's built-in plugin names, prepend, return new options

`init` returns `{ ...options, interceptors: [record, ...old], transportInterceptors: [recordTransport, ...old] }`. Being outermost needs the inspector's `init` to run after the plugins it should wrap. v2 has no priority number, only names, so the plugin sets `after` to the known built-in names (`~batch`, `~cookie-jar`, `~dedupe`, `~request-compression`, `~response-compression`, `~retry`, `~retry-after`, `~timeout`, `~request-validation`, `~response-validation`). Unknown names are ignored by v2's sort, so listing a name that a link does not use is safe. User plugins keep their array order; the docs say to put the inspector last.

Returning a new object also removes the v1 issue where one options object shared by two links registers the interceptors twice.

Alternative: a getter on `after` listing every other plugin. Rejected: the plugin cannot see the other plugins before the sort runs.

### 4. Entries and build

`tsdown` gets `v2` and `v2.prod` entries next to `index` / `index.prod`; shared code lands in common chunks, so the store and collector are one module instance for both entries. `package.json` gets:

```json
"./v2": { "types": "./dist/v2.d.ts", "development": "./dist/v2.js", "default": "./dist/v2.prod.js" }
```

`src/v2.ts` re-exports the core API plus `src/orpc-v2/`. `src/v2.prod.ts` mirrors `src/index.prod.ts`, sharing its no-op collector and SSR functions by re-export, plus a no-op plugin whose `init` returns the options it got. `OrpcInspectorOptions` moves to the core so both adapters share it.

### 5. Real recorder redirect covers `/v2`

`src/vite/plugin.ts` redirects the bare `orpc-inspector` id to a virtual module that re-exports `dist/index.js`. It gets a second pair of virtual ids for `orpc-inspector/v2` re-exporting `dist/v2.js`, under the same conditions (production opt-in build, Vite dev server SSR). `recorderModule()` takes the entry name. The Nuxt production opt-in path reuses this plugin and needs no separate change.

### 6. Nuxt picks the composable by installed major

At module setup the module resolves `@orpc/client/package.json` from `rootDir` (as it already does for Nuxt DevTools' version) and reads the major. For major 2 it auto-imports `useOrpcInspectorPlugin` from `runtime/composables.v2` (which imports `orpc-inspector/v2`); otherwise from `runtime/composables`. If the package cannot be resolved it falls back to v1.

The production no-op template becomes `{ name: 'orpc-inspector', init(options) { return options } }`, valid for both majors (v1 ignores the return value and the name). Its `.d.ts` template points at `runtime/noop` or `runtime/noop.v2` so the composable's type matches the major.

Alternative: a module option `orpcInspector.orpc: 1 | 2`. Rejected: it is one more thing to configure, and the installed version is the truth.

### 7. Tests against both majors from one install

`packages/orpc-inspector` devDependencies gain `@orpc/client-v2`, `@orpc/contract-v2`, `@orpc/server-v2` as `npm:@orpc/<name>@2.0.0-beta.51` (and `@orpc/openapi-v2` if it ships a v2 OpenAPI link). beta.51 was published 2026-11-17, past `minimumReleaseAge: 1440`. A third Vitest project `orpc-v2` (node) includes `test/orpc-v2/**` and aliases `^@orpc/(client|contract|server)(/.*)?$` to the `-v2` packages, so the core's bare imports get v2 there; the `node` project excludes that folder. The v2 server packages resolve their own `@orpc/client` dependency to the same v2 install.

If `trustPolicy: no-downgrade` blocks a v2 package, ask the user before adding any exclusion.

## Risks / Trade-offs

- [v2 beta renames the plugin API or option keys again] → v2 code is isolated in `src/orpc-v2/`; the proposal's table lists where each rename lands; tests pin one beta, and the type test fails on type-level renames.
- [A user plugin that prepends interceptors and runs after the inspector ends up outside it] → document "put the inspector last"; the built-in plugins are covered by `after`.
- [Recorded url on v2 is a path without origin] → spec states it; the origin is a transport option that interceptors do not see. Adding it would need a v2-specific transport hook, deferred.
- [Peer range `^2.0.0-beta.51` admits later betas that may break] → acceptable for a beta; README names the tested beta.
- [Nuxt major detection reads the root's `@orpc/client`, which can differ from what a layer resolves] → fallback is v1, matching today; documented in troubleshooting.
- [The error-classification change for non-`BAD_REQUEST` oRPC errors with a validation cause also applies to v1] → no v1 built-in produces it; covered by the `call-recording` delta and a test.

## Migration Plan

Additive. v1 users change nothing. v2 users change the import to `orpc-inspector/v2`; Nuxt users change nothing. Rollback is removing the `./v2` export; nothing persists.

# Tasks

## 1. Test setup for both majors

- [x] 1.1 Add `@orpc/client-v2`, `@orpc/contract-v2`, `@orpc/server-v2` (and `@orpc/openapi-v2` if v2 ships an OpenAPI link) as `npm:@orpc/<name>@2.0.0-beta.51` devDependencies; verify `pnpm install` succeeds without new `trustPolicyExclude` entries (ask the user first if it is blocked)
- [x] 1.2 Add the `orpc-v2` Vitest project with the `@orpc/*` → `-v2` alias and exclude `test/orpc-v2/**` from the `node` project; verify with a smoke test that `ORPCError` imported by `src/core` is the v2 class there

## 2. Shared core

- [x] 2.1 Make `classifyError` read both majors (status from the response cause, `invalidData`, `BAD_REQUEST`-only input rule, `MalformedResponseError`); verify existing `test/core/classify-error.test.ts` passes and new cases cover the wrapped output validation error on v1 classes
- [x] 2.2 Let `recordTransport` accept a string request URL; verify with a recorder unit test
- [x] 2.3 Move `OrpcInspectorOptions` to the core and re-export it from `src/orpc-v1/types.ts`; verify `pnpm typecheck`

## 3. v2 entry

- [x] 3.1 Add `src/orpc-v2/` (plugin with `name`/`after`, non-mutating `init`, manual interceptors) and `src/v2.ts`; verify `test/orpc-v2/plugin.test.ts` and `scenarios.test.ts` cover success, stream, cancel, server and client input issues, output validation in both plugin orders, retry, error status 403, malformed response, GET url, and two links from one options object
- [x] 3.2 Add `test/orpc-v2/types.test.ts` that passes the plugin and interceptors to v2 `RPCLink` options; verify `pnpm typecheck` passes and fails if `transportInterceptor` is renamed
- [x] 3.3 Add `src/v2.prod.ts`, the `v2` / `v2.prod` tsdown entries, the `./v2` export and peer ranges `^1.16.0 || ^2.0.0-beta.51`; verify `test/orpc-v2/prod.test.ts` and that `dist/v2.prod.js` contains no recorder code

## 4. Integrations

- [x] 4.1 Redirect `orpc-inspector/v2` to the real recorder in the Vite plugin (production opt-in and dev SSR); verify plugin unit tests for both ids and that `orpc-inspector/client` is untouched
- [ ] 4.2 Nuxt: detect the `@orpc/client` major, add `runtime/composables.v2.ts` and `runtime/noop.v2.ts`, make the no-op template return options with a name; verify `test/nuxt/module.test.ts` covers v1, v2 and unresolvable cases

## 5. Docs

- [ ] 5.1 README / README.zh-TW and `docs/guide/` (link, troubleshooting, production as needed, both languages): which entry to import for v1 and v2, the tested beta, "put the inspector last", url without origin on v2; verify the code samples match the exported API

## 6. Integration checks

- [ ] 6.1 `pnpm check` passes
- [ ] 6.2 Fresh-install trial in `.tmp` with the packed tarball and oRPC beta.51: plugin and manual interceptors record success, error 403 with status, invalid 400 with issues, under `--conditions=development`; the default condition gives the no-op without crashing
